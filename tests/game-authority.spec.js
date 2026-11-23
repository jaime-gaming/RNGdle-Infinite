import { expect, test } from "@playwright/test";
import { webcrypto } from "node:crypto";
import { emptyProgress } from "../src/progress.js";
import { packVaultSave } from "../src/save-codec.js";
import { createFirebaseAdminTokenProvider } from "../src/firestore-admin.js";
import {
  GameSessionDurableObject,
  WARNING_RESET_AFTER_MS,
  authoritativeGamePlan,
} from "../src/game-session.js";
import { createGameEndpoint } from "../src/game-api.js";
import { createFirebaseTokenVerifier } from "../src/worker-firebase-auth.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const PROJECT_ID = "rngdle-test-project";
const UID = "firebase-user-123";
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  client_email: "game-worker@rngdle-test-project.iam.gserviceaccount.com",
  private_key: "unused by the injected test token provider",
});
const fixedTime = Date.UTC(2026, 10, 23, 12, 0, 0);

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function signedToken(pair, jwk, claims = {}) {
  const header = b64url(
    JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }),
  );
  const payload = b64url(
    JSON.stringify({
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      sub: UID,
      iat: Math.floor(fixedTime / 1000),
      exp: Math.floor(fixedTime / 1000) + 3600,
      auth_time: Math.floor(fixedTime / 1000),
      ...claims,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    pair.privateKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${b64url(signature)}`;
}

function cloudProgress(overrides = {}) {
  return {
    ...emptyProgress(),
    profile: { id: "game-profile-a", username: "cloudplayer", createdAt: 1 },
    owned: ["quickwind-1", "clockwork-2"],
    skills: [],
    equippedSkills: [],
    skillCharge: {},
    ...overrides,
  };
}

function makeDurableStorage() {
  const values = new Map();
  const storage = {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => values.set(key, structuredClone(value)),
  };
  storage.transaction = async (callback) => callback(storage);
  return storage;
}

function doRequest(session, path, body = undefined) {
  return session.fetch(
    new Request(`https://game-session.internal${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

function rollRequest(requestId, deviceId, plan) {
  return new Request("https://game-session.internal/roll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, deviceId, plan }),
  });
}

test("the Worker verifies Firebase ID tokens against the project's signed RS256 keys", async () => {
  const pair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "firebase-test-key";
  jwk.use = "sig";
  jwk.alg = "RS256";
  let keyFetches = 0;
  const verifier = createFirebaseTokenVerifier({
    clock: () => fixedTime,
    fetcher: async () => {
      keyFetches++;
      return Response.json(
        { keys: [jwk] },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      );
    },
  });
  const token = await signedToken(pair, jwk);
  expect(await verifier(token, PROJECT_ID)).toMatchObject({ sub: UID });
  expect(await verifier(token, "another-project")).toBeNull();
  expect(
    await verifier(
      await signedToken(pair, jwk, { exp: Math.floor(fixedTime / 1000) - 1 }),
      PROJECT_ID,
    ),
  ).toBeNull();
  expect(keyFetches).toBe(1);
});

test("the Firebase Admin token provider signs and caches least-purpose Firestore assertions", async () => {
  const pair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const privateBytes = await webcrypto.subtle.exportKey(
    "pkcs8",
    pair.privateKey,
  );
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateBytes).toString("base64")}\n-----END PRIVATE KEY-----`;
  const serviceAccount = JSON.stringify({
    type: "service_account",
    client_email: "game-worker@rngdle-test-project.iam.gserviceaccount.com",
    private_key: privateKey,
  });
  let calls = 0;
  const provider = createFirebaseAdminTokenProvider({
    clock: () => fixedTime,
    fetcher: async (url, options) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      calls++;
      const assertion = new URLSearchParams(options.body).get("assertion");
      const [headerPart, claimsPart, signaturePart] = assertion.split(".");
      const header = JSON.parse(Buffer.from(headerPart, "base64url"));
      const claims = JSON.parse(Buffer.from(claimsPart, "base64url"));
      expect(header).toMatchObject({ alg: "RS256", typ: "JWT" });
      expect(claims.scope).toBe("https://www.googleapis.com/auth/datastore");
      expect(claims.iss).toBe(
        "game-worker@rngdle-test-project.iam.gserviceaccount.com",
      );
      const valid = await webcrypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        pair.publicKey,
        Buffer.from(signaturePart, "base64url"),
        new TextEncoder().encode(`${headerPart}.${claimsPart}`),
      );
      expect(valid).toBe(true);
      return Response.json({
        access_token: "admin-access-token",
        expires_in: 3600,
      });
    },
  });
  expect(await provider(serviceAccount)).toBe("admin-access-token");
  expect(await provider(serviceAccount)).toBe("admin-access-token");
  expect(calls).toBe(1);
});

test("the authoritative plan uses saved upgrades and armed skills, not request parameters", () => {
  const basic = authoritativeGamePlan(cloudProgress());
  expect(basic).toMatchObject({
    profileId: "game-profile-a",
    rollMS: 35_000,
    cooldownMS: 30_000,
    drawCount: 1,
    armedSkills: [],
    firedSkills: [],
  });

  const empowered = authoritativeGamePlan(
    cloudProgress({
      owned: ["flywheel", "quickwind-2", "clockwork-2"],
      skills: ["surge", "twice"],
      equippedSkills: ["surge", "twice"],
      skillCharge: { surge: 5, twice: 7 },
      flywheelCharge: 4,
    }),
  );
  expect(empowered).toMatchObject({
    rollMS: 25_000,
    cooldownMS: 0,
    drawCount: 3,
    armedSkills: ["surge", "twice"],
    firedSkills: ["surge", "twice"],
    flywheel: "boost",
  });
});

test("durable sessions are idempotent, warn in stages, and ignore early attempts from another device", async () => {
  let now = fixedTime;
  let randomCalls = 0;
  let rollIds = 0;
  const session = new GameSessionDurableObject(
    { storage: makeDurableStorage() },
    {
      clock: () => now,
      randomInteger: () => randomCalls++ % 1_000_001,
      createId: () => `server-roll-${String(++rollIds).padStart(4, "0")}`,
    },
  );
  const plan = authoritativeGamePlan(cloudProgress());
  const requestId = "request-client-a-0001";

  const first = await doRequest(session, "/roll", {
    requestId,
    deviceId: "device-client-a",
    plan,
  });
  const firstBody = await first.json();
  expect(first.status).toBe(200);
  expect(firstBody).toMatchObject({
    profileId: "game-profile-a",
    drawCount: 1,
    timing: { rollMS: 35_000, cooldownMS: 30_000 },
    security: { status: "clear" },
  });
  expect(firstBody.numbers).toHaveLength(1);
  expect(firstBody.numbers[0]).toBeGreaterThanOrEqual(0);
  expect(firstBody.numbers[0]).toBeLessThanOrEqual(1_000_000);

  const replay = await session.fetch(
    rollRequest(requestId, "device-client-a", {
      ...plan,
      rollMS: 10_000,
      cooldownMS: 0,
    }),
  );
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(firstBody);
  expect(randomCalls).toBe(1);

  now += 1_000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await session.fetch(
      rollRequest(
        `request-device-b-${String(attempt).padStart(4, "0")}`,
        "device-client-b",
        plan,
      ),
    );
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.security.status).toBe("clear");
    now += 1_000;
  }
  expect(
    (await (await doRequest(session, "/status")).json()).security.status,
  ).toBe("clear");

  for (let attempt = 1; attempt <= 10; attempt++) {
    const response = await session.fetch(
      rollRequest(
        `request-early-client-a-${String(attempt).padStart(4, "0")}`,
        "device-client-a",
        plan,
      ),
    );
    const body = await response.json();
    if (attempt === 4) {
      expect(response.status).toBe(429);
      expect(body.security).toMatchObject({
        status: "warning",
        warningStage: 1,
      });
    } else if (attempt === 7) {
      expect(response.status).toBe(429);
      expect(body.security).toMatchObject({
        status: "warning",
        warningStage: 2,
      });
    } else if (attempt === 10) {
      expect(response.status).toBe(409);
      expect(body).toMatchObject({
        code: "restriction-pending",
        restrictionRequired: true,
        verifiedEvents: 3,
      });
    } else
      expect(
        response.status,
        `attempt ${attempt}: ${JSON.stringify(body)}`,
      ).toBe(429);
    now += 1_000;
  }
  expect(randomCalls).toBe(1);
  expect(
    (await (await doRequest(session, "/status")).json()).security.status,
  ).toBe("pending");

  const confirm = await doRequest(session, "/confirm-restriction", {});
  expect(confirm.status).toBe(200);
  expect((await confirm.json()).security.status).toBe("restricted");
  const denied = await session.fetch(
    rollRequest("request-client-a-after-lock", "device-client-a", plan),
  );
  expect(denied.status).toBe(403);
  expect((await denied.json()).code).toBe("cloud-restricted");
  expect(randomCalls).toBe(1);
});

test("warning stages expire after 30 days without another verified event", async () => {
  let now = fixedTime;
  const session = new GameSessionDurableObject(
    { storage: makeDurableStorage() },
    {
      clock: () => now,
      randomInteger: () => 1,
      createId: () => "server-roll-warning-expiry",
    },
  );
  const plan = authoritativeGamePlan(cloudProgress());
  await doRequest(session, "/roll", {
    requestId: "warning-expiry-start-roll",
    deviceId: "warning-expiry-device",
    plan,
  });
  let warning;
  for (let attempt = 1; attempt <= 4; attempt++) {
    now += 1_000;
    warning = await session.fetch(
      rollRequest(
        `warning-expiry-early-${String(attempt).padStart(4, "0")}`,
        "warning-expiry-device",
        plan,
      ),
    );
  }
  expect(warning.status).toBe(429);
  expect((await warning.json()).security.status).toBe("warning");

  now += WARNING_RESET_AFTER_MS;
  const status = await (await doRequest(session, "/status")).json();
  expect(status.security.status).toBe("clear");
  expect(status.verifiedEvents).toBe(0);
  expect(status.verifiedAttempts).toBe(0);
});

test("the Worker clears a pending Durable Object restriction after Cloud access is restored", async () => {
  let now = fixedTime;
  const durableSession = new GameSessionDurableObject(
    { storage: makeDurableStorage() },
    {
      clock: () => now,
      randomInteger: () => 1,
      createId: () => "server-roll-pending-clear",
    },
  );
  const plan = authoritativeGamePlan(cloudProgress());
  await doRequest(durableSession, "/roll", {
    requestId: "pending-clear-start-roll",
    deviceId: "pending-clear-device",
    plan,
  });
  for (let attempt = 1; attempt <= 10; attempt++) {
    now += 1_000;
    const early = await durableSession.fetch(
      rollRequest(
        `pending-clear-early-${String(attempt).padStart(4, "0")}`,
        "pending-clear-device",
        plan,
      ),
    );
    if (attempt < 10) expect(early.status).toBe(429);
    else expect(early.status).toBe(409);
  }
  expect(
    (await (await doRequest(durableSession, "/status")).json()).security.status,
  ).toBe("pending");

  const namespace = {
    idFromName: (name) => name,
    get: (id) => {
      expect(id).toBe(UID);
      return { fetch: (request) => durableSession.fetch(request) };
    },
  };
  const endpoint = createGameEndpoint({
    clock: () => now,
    verifyToken: async () => ({ sub: UID }),
    getAdminAccessToken: async () => "admin-access-token",
    fetcher: async (input) => {
      const url = new URL(input);
      expect(url.pathname).toBe(
        `${FIRESTORE_ROOT.slice("https://firestore.googleapis.com".length)}/cloud_security_status/${UID}`,
      );
      return Response.json({
        fields: {
          cloud_access: { booleanValue: true },
          status: { stringValue: "cleared" },
        },
      });
    },
  });
  const response = await endpoint(
    new Request("https://game.example/api/game/status", {
      headers: { Authorization: "Bearer firebase-id-token" },
    }),
    {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
      GAME_SESSIONS: namespace,
    },
  );
  expect(response.status).toBe(200);
  expect((await response.json()).security.status).toBe("clear");
});

test("the Worker issues Cloud rolls from Firestore state then persists staged restrictions without touching saves", async () => {
  let now = fixedTime;
  let statusRecord = null;
  let randomCalls = 0;
  let rollIds = 0;
  let firestoreReads = 0;
  let saveDocumentReads = 0;
  const saved = cloudProgress();
  const packedSave = packVaultSave(JSON.stringify(saved));
  const durableSession = new GameSessionDurableObject(
    { storage: makeDurableStorage() },
    {
      clock: () => now,
      randomInteger: () => randomCalls++ % 1_000_001,
      createId: () => `api-roll-${String(++rollIds).padStart(4, "0")}`,
    },
  );
  const namespace = {
    idFromName: (name) => name,
    get: (id) => {
      expect(id).toBe(UID);
      return { fetch: (request) => durableSession.fetch(request) };
    },
  };
  const fetcher = async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin !== "https://firestore.googleapis.com")
      throw new Error(`Unexpected request to ${url.origin}`);
    const authorization = options.headers?.Authorization;
    if (
      url.pathname ===
        `${FIRESTORE_ROOT.slice("https://firestore.googleapis.com".length)}/cloud_security_status` &&
      options.method === "POST"
    ) {
      firestoreReads++;
      expect(authorization).toBe("Bearer admin-access-token");
      expect(url.searchParams.get("documentId")).toBe(UID);
      statusRecord = JSON.parse(options.body).fields;
      return Response.json({ fields: statusRecord });
    }
    if (
      url.pathname ===
      `${FIRESTORE_ROOT.slice("https://firestore.googleapis.com".length)}/cloud_security_status/${UID}`
    ) {
      firestoreReads++;
      expect(authorization).toBe("Bearer admin-access-token");
      if (options.method === "POST") {
        statusRecord = JSON.parse(options.body).fields;
        return Response.json({ fields: statusRecord });
      }
      if (options.method === "PATCH") {
        statusRecord = JSON.parse(options.body).fields;
        return Response.json({ fields: statusRecord });
      }
      if (!statusRecord) return new Response("", { status: 404 });
      return Response.json({ fields: statusRecord });
    }
    if (
      url.pathname ===
      `${FIRESTORE_ROOT.slice("https://firestore.googleapis.com".length)}/player_saves/${UID}`
    ) {
      saveDocumentReads++;
      expect(authorization).toBe("Bearer firebase-id-token");
      return Response.json({
        fields: { save_data: { stringValue: packedSave } },
      });
    }
    throw new Error(`Unexpected Firestore request ${url.pathname}`);
  };
  const endpoint = createGameEndpoint({
    clock: () => now,
    verifyToken: async (token, project) =>
      token === "firebase-id-token" && project === PROJECT_ID
        ? { sub: UID }
        : null,
    getAdminAccessToken: async () => "admin-access-token",
    fetcher,
  });
  const env = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
    GAME_SESSIONS: namespace,
  };
  const postRoll = (
    requestId,
    device = "device-api-client-a",
    requestedProfileId = "game-profile-a",
  ) =>
    endpoint(
      new Request("https://game.example/api/game/roll", {
        method: "POST",
        headers: {
          Origin: "https://game.example",
          "Content-Type": "application/json",
          Authorization: "Bearer firebase-id-token",
        },
        body: JSON.stringify({
          requestId,
          deviceId: device,
          profileId: requestedProfileId,
        }),
      }),
      env,
    );

  const unauthorized = await endpoint(
    new Request("https://game.example/api/game/status", {
      headers: { Authorization: "Bearer bad-token" },
    }),
    env,
  );
  expect(unauthorized.status).toBe(401);
  expect(firestoreReads).toBe(0);

  const mismatchedProfile = await postRoll(
    "api-request-profile-mismatch-0001",
    "device-api-client-a",
    "stale-profile-id",
  );
  expect(mismatchedProfile.status).toBe(409);
  expect(await mismatchedProfile.json()).toMatchObject({
    code: "cloud-profile-changed",
  });
  expect(randomCalls).toBe(0);
  expect(saveDocumentReads).toBe(1);

  const first = await postRoll("api-request-client-a-0001");
  const firstBody = await first.json();
  expect(first.status).toBe(200);
  expect(firstBody).toMatchObject({
    profileId: "game-profile-a",
    timing: { rollMS: 35_000, cooldownMS: 30_000 },
    security: { status: "clear" },
  });
  expect(firstBody.drawCount).toBe(1);
  expect(randomCalls).toBe(1);
  expect(saveDocumentReads).toBe(2);

  now += 1_000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const otherDevice = await postRoll(
      `api-request-other-device-${String(attempt).padStart(4, "0")}`,
      "device-api-client-b",
    );
    expect(otherDevice.status).toBe(429);
    expect((await otherDevice.json()).security.status).toBe("clear");
    now += 1_000;
  }

  for (let attempt = 1; attempt <= 10; attempt++) {
    const response = await postRoll(
      `api-request-early-client-a-${String(attempt).padStart(4, "0")}`,
    );
    const body = await response.json();
    if (attempt === 4) {
      expect(response.status).toBe(429);
      expect(body.security.warningStage).toBe(1);
    } else if (attempt === 7) {
      expect(response.status).toBe(429);
      expect(body.security.warningStage).toBe(2);
    } else if (attempt === 10) {
      expect(response.status).toBe(403);
      expect(body.code).toBe("cloud-restricted");
      expect(body.security.status).toBe("restricted");
    } else
      expect(
        response.status,
        `attempt ${attempt}: ${JSON.stringify(body)}`,
      ).toBe(429);
    now += 1_000;
  }

  expect(statusRecord).toMatchObject({
    cloud_access: { booleanValue: false },
    status: { stringValue: "restricted" },
    verified_events: { integerValue: "3" },
  });
  expect(randomCalls).toBe(1);
  const status = await endpoint(
    new Request("https://game.example/api/game/status", {
      headers: { Authorization: "Bearer firebase-id-token" },
    }),
    env,
  );
  expect(status.status).toBe(403);
  expect((await status.json()).security.status).toBe("restricted");

  statusRecord.cloud_access = { booleanValue: true };
  statusRecord.status = { stringValue: "cleared" };
  const reenabled = await endpoint(
    new Request("https://game.example/api/game/status", {
      headers: { Authorization: "Bearer firebase-id-token" },
    }),
    env,
  );
  expect(reenabled.status).toBe(200);
  expect((await reenabled.json()).security.status).toBe("clear");
  expect(saveDocumentReads).toBe(15);
  expect(saved.profile.id).toBe("game-profile-a");
});
