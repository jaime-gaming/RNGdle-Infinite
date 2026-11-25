import {
  createFirebaseAdminTokenProvider,
  FirestoreServiceUnavailable,
  readCloudRestriction,
  readPlayerSave,
  writeCloudRestriction,
} from "./firestore-admin.js";
import {
  createFirebaseTokenVerifier,
  TokenVerificationUnavailable,
} from "./worker-firebase-auth.js";
import { authoritativeGamePlan } from "./game-session.js";

const STATUS_PATH = "/api/game/status";
const ROLL_PATH = "/api/game/roll";
const GAME_PREFIX = "/api/game/";
const MAX_BODY_BYTES = 512;

// Server-side diagnosis tags. They are logged by the Worker and never returned
// to the browser: the client only receives its support reference.
export const GAME_FAULTS = Object.freeze({
  config: "cloud-game-config-missing",
  token: "cloud-game-token-unavailable",
  session: "cloud-game-session-unavailable",
  restriction: "cloud-game-restriction-unavailable",
  save: "cloud-game-save-unavailable",
  plan: "cloud-game-plan-unavailable",
  roll: "cloud-game-roll-unavailable",
  route: "unknown-api-route",
});

export function isGamePath(pathname) {
  return typeof pathname === "string" && pathname.startsWith(GAME_PREFIX);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// The browser keeps its single support reference; the fault tag only reaches
// the Worker log, where it names which dependency actually failed.
export function logCloudFault(fault, detail = "") {
  try {
    console.error(
      `[RNGdle Worker] Cloud roll verification unavailable: ${fault}${detail ? ` (${detail})` : ""}.`,
    );
  } catch {}
}

function serviceUnavailable(fault, detail = "") {
  logCloudFault(fault, detail);
  return jsonResponse(503, {
    ok: false,
    code: "game-security-unavailable",
    message:
      "Cloud rolls cannot be verified right now. Your saved progress is safe; try again later.",
  });
}

async function readBoundedBody(request) {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function bearerToken(request) {
  const value = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]{1,16384})$/i.exec(value);
  return match?.[1] ?? "";
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function requestOriginAllowed(request, url, method) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return false;
  return method !== "POST" || origin === url.origin;
}

async function sessionFor(namespace, userId) {
  if (
    !namespace ||
    typeof namespace.idFromName !== "function" ||
    typeof namespace.get !== "function"
  )
    throw new FirestoreServiceUnavailable();
  const id = namespace.idFromName(userId);
  const stub = namespace.get(id);
  const response = await stub.fetch(
    new Request("https://game-session.internal/status", { method: "GET" }),
  );
  if (!response.ok) throw new FirestoreServiceUnavailable();
  let status;
  try {
    status = await response.json();
  } catch {
    throw new FirestoreServiceUnavailable();
  }
  if (!status?.security || typeof status.security.status !== "string")
    throw new FirestoreServiceUnavailable();
  return { stub, status };
}

async function confirmDurableRestriction(stub) {
  const response = await stub.fetch(
    new Request("https://game-session.internal/confirm-restriction", {
      method: "POST",
    }),
  );
  if (!response.ok) throw new FirestoreServiceUnavailable();
  try {
    return await response.json();
  } catch {
    throw new FirestoreServiceUnavailable();
  }
}

async function clearDurableRestriction(stub) {
  const response = await stub.fetch(
    new Request("https://game-session.internal/clear-restriction", {
      method: "POST",
    }),
  );
  if (!response.ok) throw new FirestoreServiceUnavailable();
  try {
    return await response.json();
  } catch {
    throw new FirestoreServiceUnavailable();
  }
}

export function createGameEndpoint({
  fetcher = fetch,
  clock = () => Date.now(),
  verifyToken = createFirebaseTokenVerifier({ fetcher, clock }),
  getAdminAccessToken = createFirebaseAdminTokenProvider({ fetcher, clock }),
} = {}) {
  return async function gameEndpoint(request, env = {}) {
    const url = new URL(request.url);
    if (![STATUS_PATH, ROLL_PATH].includes(url.pathname))
      return jsonResponse(404, { ok: false, code: "not-found" });
    const isStatus = url.pathname === STATUS_PATH;
    if (request.method !== (isStatus ? "GET" : "POST"))
      return jsonResponse(405, { ok: false, code: "method-not-allowed" });
    if (!requestOriginAllowed(request, url, request.method))
      return jsonResponse(403, { ok: false, code: "origin-not-allowed" });

    let input = null;
    if (!isStatus) {
      const contentType = request.headers
        .get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/json")
        return jsonResponse(415, { ok: false, code: "unsupported-request" });
      let body;
      try {
        body = await readBoundedBody(request);
      } catch {
        return jsonResponse(400, { ok: false, code: "invalid-request" });
      }
      if (body === null)
        return jsonResponse(413, { ok: false, code: "request-too-large" });
      try {
        input = JSON.parse(body);
      } catch {
        return jsonResponse(400, { ok: false, code: "invalid-request" });
      }
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some(
          (key) => !["requestId", "deviceId", "profileId"].includes(key),
        ) ||
        !validIdentifier(input.requestId) ||
        !validIdentifier(input.deviceId) ||
        typeof input.profileId !== "string" ||
        input.profileId.length < 1 ||
        input.profileId.length > 128
      )
        return jsonResponse(400, { ok: false, code: "invalid-request" });
    }

    const projectId = String(env.FIREBASE_PROJECT_ID ?? "").trim();
    const token = bearerToken(request);
    if (!projectId || !env.FIREBASE_SERVICE_ACCOUNT_JSON || !token)
      return serviceUnavailable(GAME_FAULTS.config);

    let claims;
    try {
      claims = await verifyToken(token, projectId);
    } catch (error) {
      if (error instanceof TokenVerificationUnavailable)
        return serviceUnavailable(GAME_FAULTS.token);
      return serviceUnavailable(GAME_FAULTS.token);
    }
    if (!claims?.sub)
      return jsonResponse(401, {
        ok: false,
        code: "sign-in-required",
        message: "Sign in again before rolling with a Cloud profile.",
      });

    let session;
    let cloudRestriction;
    try {
      [session, cloudRestriction] = await Promise.all([
        sessionFor(env.GAME_SESSIONS, claims.sub),
        readCloudRestriction({
          projectId,
          userId: claims.sub,
          serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
          fetcher,
          getAdminAccessToken,
        }),
      ]);
    } catch {
      return serviceUnavailable(GAME_FAULTS.session);
    }

    if (
      cloudRestriction.cloudAccess === true &&
      ["pending", "restricted"].includes(session.status.security.status)
    ) {
      try {
        const cleared = await clearDurableRestriction(session.stub);
        session.status = {
          ...session.status,
          security: cleared.security,
          verifiedEvents: 0,
          verifiedAttempts: 0,
        };
      } catch {
        return serviceUnavailable(GAME_FAULTS.restriction);
      }
    }

    if (cloudRestriction.restricted) {
      let confirmed = { security: session.status.security };
      if (session.status.security.status !== "restricted")
        try {
          confirmed = await confirmDurableRestriction(session.stub);
        } catch {
          return serviceUnavailable(GAME_FAULTS.restriction);
        }
      return jsonResponse(403, {
        ok: false,
        code: "cloud-restricted",
        security: confirmed.security,
      });
    }
    if (session.status.security.status === "restricted") {
      try {
        await writeCloudRestriction({
          projectId,
          userId: claims.sub,
          serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
          verifiedEvents: session.status.verifiedEvents,
          clock,
          fetcher,
          getAdminAccessToken,
        });
      } catch {
        return serviceUnavailable(GAME_FAULTS.restriction);
      }
      return jsonResponse(403, {
        ok: false,
        code: "cloud-restricted",
        security: session.status.security,
      });
    }

    if (isStatus)
      return jsonResponse(200, {
        ok: true,
        security: session.status.security,
      });

    let savedProgress;
    try {
      savedProgress = await readPlayerSave({
        projectId,
        userId: claims.sub,
        idToken: token,
        fetcher,
      });
    } catch {
      logCloudFault(GAME_FAULTS.save, "the Player save could not be read");
  return jsonResponse(503, {
    ok: false,
    code: "cloud-save-unavailable",
    message:
      "Your Cloud save could not be checked, so no roll was issued. Your saved progress is safe; try again later.",
  });
    }
    if (!savedProgress)
      return jsonResponse(409, {
        ok: false,
        code: "cloud-save-not-ready",
        message:
          "Your Cloud save is not ready for a server roll yet. Wait for the first backup to finish, then try again.",
      });
    if (input.profileId !== savedProgress.profile?.id)
      return jsonResponse(409, {
        ok: false,
        code: "cloud-profile-changed",
        message:
          "The Cloud profile changed since this device last synced. Reload after its save finishes syncing, then try again.",
      });

    let plan;
    try {
      plan = authoritativeGamePlan(savedProgress);
    } catch {
      logCloudFault(
        GAME_FAULTS.plan,
        "the Cloud save could not form a roll plan",
      );
      return jsonResponse(409, {
        ok: false,
        code: "cloud-save-not-ready",
        message:
          "The Cloud save is still syncing. No roll was issued; try again in a moment.",
      });
    }

    let rollResponse;
    try {
      rollResponse = await session.stub.fetch(
        new Request("https://game-session.internal/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: input.requestId,
            deviceId: input.deviceId,
            plan,
          }),
        }),
      );
    } catch {
      return serviceUnavailable(GAME_FAULTS.session);
    }
    let result;
    try {
      result = await rollResponse.json();
    } catch {
      return serviceUnavailable(GAME_FAULTS.session);
    }

    if (result.restrictionRequired) {
      try {
        await writeCloudRestriction({
          projectId,
          userId: claims.sub,
          serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
          verifiedEvents: result.verifiedEvents,
          clock,
          fetcher,
          getAdminAccessToken,
        });
        const confirmed = await confirmDurableRestriction(session.stub);
        return jsonResponse(403, {
          ok: false,
          code: "cloud-restricted",
          security: confirmed.security,
        });
      } catch {
        return serviceUnavailable(GAME_FAULTS.roll);
      }
    }

    return jsonResponse(rollResponse.status, result);
  };
}
