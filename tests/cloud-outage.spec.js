import { expect, test } from "@playwright/test";
import { webcrypto } from "node:crypto";
import { emptyProgress } from "../src/progress.js";
import { cloudUnavailableReason } from "../src/error-codes.js";
import { createGameEndpoint, GAME_FAULTS } from "../src/game-api.js";
import { GameSessionDurableObject } from "../src/game-session.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const PROJECT_ID = "rngdle-test-project";
const UID = "firebase-user-outage";
const SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  client_email: "game-worker@rngdle-test-project.iam.gserviceaccount.com",
  private_key: "unused by the injected test token provider",
});

function progress() {
  return {
    ...emptyProgress(),
    profile: {
      id: "game-profile-outage",
      username: "outageplayer",
      createdAt: 1,
    },
    owned: [],
    skills: [],
    equippedSkills: [],
    skillCharge: {},
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

function namespaceFor(session) {
  return {
    idFromName: (name) => name,
    get: () => ({ fetch: (request) => session.fetch(request) }),
  };
}

function statusRequest() {
  return new Request("https://game.example/api/game/status", {
    headers: { Authorization: "Bearer firebase-id-token" },
  });
}

async function captureWorkerLog(run) {
  const lines = [];
  const original = console.error;
  console.error = (...parts) => lines.push(parts.join(" "));
  try {
    await run();
  } finally {
    console.error = original;
  }
  return lines.join("\n");
}

test("a Worker deployed without its service-account secret names the missing binding in its log", async () => {
  const session = new GameSessionDurableObject({
    storage: makeDurableStorage(),
  });
  const endpoint = createGameEndpoint({
    verifyToken: async () => ({ sub: UID }),
    getAdminAccessToken: async () => "admin-access-token",
    fetcher: async () => {
      throw new Error("No Firestore request is expected without a secret.");
    },
  });
  const env = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    GAME_SESSIONS: namespaceFor(session),
  };

  let response;
  const log = await captureWorkerLog(async () => {
    response = await endpoint(statusRequest(), env);
  });

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "game-security-unavailable",
  });
  expect(log).toContain(GAME_FAULTS.config);
});

test("each unavailable dependency logs its own fault while the browser keeps one reference", async () => {
  const session = new GameSessionDurableObject({
    storage: makeDurableStorage(),
  });
  const env = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
    GAME_SESSIONS: namespaceFor(session),
  };

  const revocation = createGameEndpoint({
    verifyToken: async () => {
      throw new Error("Google key set unavailable.");
    },
    getAdminAccessToken: async () => "admin-access-token",
    fetcher: async () => {
      throw new Error(
        "Firestore is not reached while sign-in cannot be checked.",
      );
    },
  });
  let response;
  const log = await captureWorkerLog(async () => {
    response = await revocation(statusRequest(), env);
  });
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("fault");
  expect(log).toContain(GAME_FAULTS.token);

  const noDurableObject = createGameEndpoint({
    verifyToken: async () => ({ sub: UID }),
    getAdminAccessToken: async () => "admin-access-token",
    fetcher: async (input) => {
      const url = new URL(input);
      if (url.host !== "firestore.googleapis.com")
        throw new Error("Unexpected host.");
      return new Response("", { status: 404 });
    },
  });
  const sessionLog = await captureWorkerLog(async () => {
    response = await noDurableObject(statusRequest(), {
      ...env,
      GAME_SESSIONS: {
        idFromName: () => "id",
        get: () => ({
          fetch: async () => {
            throw new Error("Durable Object binding is missing.");
          },
        }),
      },
    });
  });
  expect(response.status).toBe(503);
  expect(sessionLog).toContain(GAME_FAULTS.session);
});

test("a save that cannot form a roll plan is reported as a save fault, not as a cooldown", async () => {
  const { packVaultSave } = await import("../src/save-codec.js");
  const session = new GameSessionDurableObject({
    storage: makeDurableStorage(),
  });
  const broken = progress();
  delete broken.owned;
  const packed = packVaultSave(JSON.stringify(broken));
  const endpoint = createGameEndpoint({
    verifyToken: async () => ({ sub: UID }),
    getAdminAccessToken: async () => "admin-access-token",
    fetcher: async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith(`player_saves/${UID}`))
        return Response.json({
          fields: { save_data: { stringValue: packed } },
        });
      return new Response("", { status: 404 });
    },
  });

  let response;
  const log = await captureWorkerLog(async () => {
    response = await endpoint(
      new Request("https://game.example/api/game/roll", {
        method: "POST",
        headers: {
          Origin: "https://game.example",
          "Content-Type": "application/json",
          Authorization: "Bearer firebase-id-token",
        },
        body: JSON.stringify({
          requestId: "request-save-plan-0001",
          deviceId: "device-save-plan-0001",
          profileId: "game-profile-outage",
        }),
      }),
      {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT,
        GAME_SESSIONS: namespaceFor(session),
      },
    );
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "cloud-save-not-ready" });
  expect(log).toContain(GAME_FAULTS.plan);
});

test("the player's roll notice names the action that helps with this outage", () => {
  expect(cloudUnavailableReason({ online: false })).toBe("offline");
  expect(cloudUnavailableReason({ status: 401 })).toBe("sign-in");
  expect(
    cloudUnavailableReason({ status: 401, code: "sign-in-required" }),
  ).toBe("sign-in");
  expect(cloudUnavailableReason({ status: 403 })).toBe("provider");
  expect(cloudUnavailableReason({ status: 429 })).toBe("provider");
  expect(
    cloudUnavailableReason({
      status: 0,
      message: "TypeError: Failed to fetch",
    }),
  ).toBe("browser-settings");
  expect(cloudUnavailableReason({ status: 0 })).toBe("server");
  expect(cloudUnavailableReason({ status: 503 })).toBe("server");
});
