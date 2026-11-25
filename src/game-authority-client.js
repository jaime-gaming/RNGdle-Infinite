import { firebaseAuth } from "./firebase.js";
import {
  cloudUnavailableReason,
  gameAuthorityErrorReference,
} from "./error-codes.js";

export const GAME_DEVICE_KEY = "rng-infinite-game-device-v1";
export const GAME_REQUEST_KEY = "rng-infinite-pending-game-roll-v1";
export const GAME_TOKEN_SOURCE_KEY = "rng-infinite-game-token-source-v1";

function newId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    throw new Error(
      "This browser cannot securely identify a Cloud roll request.",
    );
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes]
    .map(
      (byte, index) =>
        `${index === 4 || index === 6 || index === 8 || index === 10 ? "-" : ""}${byte.toString(16).padStart(2, "0")}`,
    )
    .join("");
}

function validId(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function deviceId() {
  let id = localStorage.getItem(GAME_DEVICE_KEY);
  if (!validId(id)) {
    id = newId();
    localStorage.setItem(GAME_DEVICE_KEY, id);
  }
  return id;
}

function requestFor(userId, profileId) {
  const currentDeviceId = deviceId();
  let existing = null;
  try {
    existing = JSON.parse(sessionStorage.getItem(GAME_REQUEST_KEY) || "null");
  } catch {}
  if (
    existing?.userId === userId &&
    existing?.profileId === profileId &&
    existing?.deviceId === currentDeviceId &&
    validId(existing?.requestId)
  )
    return existing;

  const request = {
    requestId: newId(),
    deviceId: currentDeviceId,
    userId,
    profileId,
  };
  sessionStorage.setItem(GAME_REQUEST_KEY, JSON.stringify(request));
  return request;
}

function clearRequest(requestId) {
  try {
    const existing = JSON.parse(
      sessionStorage.getItem(GAME_REQUEST_KEY) || "null",
    );
    if (existing?.requestId === requestId)
      sessionStorage.removeItem(GAME_REQUEST_KEY);
  } catch {}
}

// Firebase Auth owns the browser session. This is the only place the game
// borrows it, so a build without Firebase (or a test) can supply the signed-in
// user instead of reaching into the Firebase module.
let tokenSource = null;

export function setGameTokenSource(source) {
  tokenSource = typeof source === "function" ? source : null;
}

async function idTokenFor(userId) {
  const user = tokenSource
    ? await tokenSource(userId)
    : firebaseAuth?.currentUser;
  if (!user || user.uid !== userId)
    throw new Error("The Cloud sign-in changed. Reload and try again.");
  return user.getIdToken();
}

function updateSecurity(onSecurity, security) {
  if (
    security &&
    ["clear", "warning", "restricted", "pending"].includes(security.status)
  )
    onSecurity?.(security);
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function authorityError(
  code,
  message,
  { reason = "", status = 0, hint = "" } = {},
) {
  const error = new Error(message);
  error.code = code;
  error.reference = gameAuthorityErrorReference(code, message);
  // A support reference alone cannot tell a provider outage from a blocked
  // request. The HTTP status travels with the error so the notice and the
  // console warning say which one happened.
  error.status = Number.isSafeInteger(status) ? status : 0;
  if (reason) error.reason = reason;
  if (hint) error.hint = hint;
  return error;
}

function offline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function requestGameStatus(userId, onSecurity) {
  try {
    const token = await idTokenFor(userId);
    const response = await fetch("/api/game/status", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
      referrerPolicy: "same-origin",
    });
    const body = await readJsonResponse(response);
    updateSecurity(onSecurity, body?.security);
    return body?.security ?? null;
  } catch {
    return null;
  }
}

export async function requestServerRoll(userId, profileId, onSecurity) {
  let pending;
  try {
    pending = requestFor(userId, profileId);
  } catch {
    throw authorityError(
      "request-not-secure",
      "This browser could not safely prepare a Cloud roll request. Your progress is unchanged.",
    );
  }

  let response;
  try {
    const token = await idTokenFor(userId);
    response = await fetch("/api/game/roll", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: pending.requestId,
        deviceId: pending.deviceId,
        profileId,
      }),
      referrerPolicy: "same-origin",
    });
  } catch (cause) {
    const accountChanged =
      cause instanceof Error &&
      cause.message === "The Cloud sign-in changed. Reload and try again.";
    throw authorityError(
      accountChanged ? "account-changed" : "game-security-unavailable",
      accountChanged
        ? cause.message
        : "Cloud rolls cannot be verified right now. Your saved progress is safe; try again later or continue locally.",
      {
        reason: accountChanged
          ? ""
          : cloudUnavailableReason({
              online: !offline(),
              status: 0,
              message: String(cause?.message ?? ""),
            }),
        status: 0,
      },
    );
  }

  const body = await readJsonResponse(response);
  updateSecurity(onSecurity, body?.security);
  if (!response.ok || body?.ok !== true) {
    if ([400, 401, 403, 409, 413, 415, 429].includes(response.status))
      clearRequest(pending.requestId);
    const message =
      body?.message ||
      (body?.code === "cloud-restricted"
        ? "Cloud rolls are paused for this account. Your saved progress is safe; continue locally or contact support."
        : "Cloud rolls cannot be verified right now. Your saved progress is safe; try again later or continue locally.");
    const code =
      typeof body?.code === "string" ? body.code : "game-security-unavailable";
    const error = authorityError(code, message, {
      status: response.status,
      hint: typeof body?.hint === "string" ? body.hint : "",
      reason: cloudUnavailableReason({
        online: !offline(),
        status: response.status,
        code,
        message,
      }),
    });
    if (Number.isSafeInteger(body?.retryAfterMs) && body.retryAfterMs >= 0)
      error.retryAfterMs = body.retryAfterMs;
    throw error;
  }

  if (
    typeof body.rollId !== "string" ||
    body.profileId !== profileId ||
    !Array.isArray(body.numbers) ||
    body.numbers.length < 1 ||
    body.numbers.length > 6 ||
    body.drawCount !== body.numbers.length ||
    body.numbers.some(
      (number) =>
        !Number.isSafeInteger(number) || number < 0 || number > 1_000_000,
    ) ||
    !Number.isSafeInteger(body.timing?.rollMS) ||
    !Number.isSafeInteger(body.timing?.cooldownMS) ||
    !Array.isArray(body.armedSkills) ||
    !Array.isArray(body.firedSkills) ||
    ![null, "boost", "charge"].includes(body.flywheel)
  ) {
    throw authorityError(
      "invalid-game-response",
      "The Cloud roll response could not be checked. No progress was changed; retry safely.",
      { status: response.status },
    );
  }

  return {
    ...body,
    requestKey: pending.requestId,
  };
}

// One console line per failed Cloud verification, so a report can say whether
// the request never left the browser or the Worker answered and why. It never
// carries the token, the save, the profile or the roll.
export function describeCloudVerificationFailure(error) {
  if (!error || typeof error !== "object") return null;
  const status = Number.isSafeInteger(error.status) ? error.status : 0;
  const where =
    status === 0
      ? "the request never reached the Worker"
      : status === 401
        ? "the Worker rejected the sign-in"
        : status === 503
          ? "the Worker could not verify the roll"
          : `the Worker answered ${status}`;
  return {
    reference: error.reference ?? "",
    code: typeof error.code === "string" ? error.code : "",
    status,
    reason: error.reason ?? "",
    hint: error.hint ?? "",
    where,
  };
}

export function acknowledgeServerRoll(requestId = null) {
  if (validId(requestId)) {
    clearRequest(requestId);
    return;
  }
  try {
    sessionStorage.removeItem(GAME_REQUEST_KEY);
  } catch {}
}
