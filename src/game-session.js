import {
  COOLDOWN_DURATIONS,
  productById,
  ROLL_DURATIONS,
  rollSettings,
} from "./shop-data.js";
import {
  armedSkills,
  drawPicksFor,
  drawPlanFor,
  SKILL_MAX_DRAWS,
  skillById,
  skillWaivesCooldown,
} from "./skills.js";
import { flywheelForDraw } from "./flywheel.js";

export const EARLY_ROLL_TOLERANCE_MS = 10_000;
export const REPEATED_ATTEMPT_INTERVAL_MS = 1_000;
export const VERIFIED_ATTEMPTS_PER_STAGE = 3;
export const EARLY_ATTEMPT_WINDOW_MS = 30 * 60 * 1_000;
export const WARNING_RESET_AFTER_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_EARLY_DEVICES = 8;
const MAX_EARLY_REQUEST_IDS = 64;
const MAX_IDEMPOTENT_REQUESTS = 12;
const IDEMPOTENCY_TTL_MS = 30 * 60 * 1_000;
const ROLL_COUNT = 1_000_001;

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

function emptySession() {
  return {
    nextAllowedAt: 0,
    lastSuccessfulDevice: null,
    warningStage: 0,
    verifiedEvents: 0,
    verifiedAttempts: 0,
    lastVerifiedAt: 0,
    earlyByDevice: {},
    earlyRequestIds: {},
    requests: {},
    restricted: false,
    restrictionPending: false,
  };
}

function randomRollNumber() {
  const limit = Math.floor(0x1_0000_0000 / ROLL_COUNT) * ROLL_COUNT;
  const words = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(words);
    value = words[0];
  } while (value >= limit);
  return value % ROLL_COUNT;
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function validPlan(value) {
  return Boolean(
    value &&
    typeof value.profileId === "string" &&
    value.profileId.length >= 1 &&
    value.profileId.length <= 128 &&
    Number.isSafeInteger(value.rollMS) &&
    ROLL_DURATIONS.includes(value.rollMS) &&
    Number.isSafeInteger(value.cooldownMS) &&
    [0, ...COOLDOWN_DURATIONS].includes(value.cooldownMS) &&
    Number.isSafeInteger(value.drawCount) &&
    value.drawCount >= 1 &&
    value.drawCount <= SKILL_MAX_DRAWS &&
    Array.isArray(value.armedSkills) &&
    value.armedSkills.length <= 16 &&
    value.armedSkills.every(
      (id) => typeof id === "string" && id.length <= 80,
    ) &&
    Array.isArray(value.firedSkills) &&
    value.firedSkills.length <= value.armedSkills.length &&
    value.firedSkills.every((id) => value.armedSkills.includes(id)) &&
    [null, "boost", "charge"].includes(value.flywheel),
  );
}

function clampMap(map, now, maxAge, limit) {
  const recent = Object.entries(map ?? {})
    .filter(([, entry]) => entry && now - entry.lastAttemptAt <= maxAge)
    .sort((left, right) => right[1].lastAttemptAt - left[1].lastAttemptAt)
    .slice(0, limit);
  return Object.fromEntries(recent);
}

function currentSecurity(session) {
  if (session.restricted)
    return {
      status: "restricted",
      message:
        "Cloud rolls are paused for this account. Your saved progress has not been deleted; you can continue locally.",
    };
  if (session.restrictionPending)
    return {
      status: "pending",
      message:
        "Cloud rolls are being paused after continued server-verified cooldown bypass attempts. Your saved progress is not being deleted.",
    };
  if (session.warningStage > 0)
    return {
      status: "warning",
      warningStage: session.warningStage,
      message:
        "Cloud rolls remain available. Repeated requests before the server cooldown may pause Cloud rolls; your saved progress is safe.",
    };
  return { status: "clear", warningStage: 0, message: "" };
}

function resetExpiredWarnings(session, now) {
  if (
    session.warningStage <= 0 ||
    session.restricted ||
    session.restrictionPending ||
    !session.lastVerifiedAt ||
    now - session.lastVerifiedAt < WARNING_RESET_AFTER_MS
  )
    return false;

  session.warningStage = 0;
  session.verifiedEvents = 0;
  session.verifiedAttempts = 0;
  session.lastVerifiedAt = 0;
  session.earlyByDevice = {};
  session.earlyRequestIds = {};
  return true;
}

function newWarningMessage(stage) {
  return {
    status: "warning",
    warningStage: stage,
    message:
      stage === 1
        ? "Several roll requests arrived well before the server cooldown. This is a warning only; Cloud rolls and saved progress remain available."
        : "Further repeated roll requests arrived before the server cooldown. Cloud rolls remain available, but continued verified attempts may pause them. Your saved progress is safe.",
  };
}

function addVerifiedEarlyAttempt(session, deviceId, now) {
  session.earlyByDevice = clampMap(
    session.earlyByDevice,
    now,
    EARLY_ATTEMPT_WINDOW_MS,
    MAX_EARLY_DEVICES,
  );
  const previous = session.earlyByDevice[deviceId];
  if (!previous || now - previous.firstAttemptAt > EARLY_ATTEMPT_WINDOW_MS) {
    session.earlyByDevice[deviceId] = {
      firstAttemptAt: now,
      lastAttemptAt: now,
      repeatedAttempts: 0,
    };
    return null;
  }

  if (now - previous.lastAttemptAt < REPEATED_ATTEMPT_INTERVAL_MS) return null;
  const repeatedAttempts = previous.repeatedAttempts + 1;
  session.earlyByDevice[deviceId] = {
    firstAttemptAt: previous.firstAttemptAt,
    lastAttemptAt: now,
    repeatedAttempts,
  };
  if (repeatedAttempts < VERIFIED_ATTEMPTS_PER_STAGE) return null;

  session.verifiedEvents += 1;
  session.verifiedAttempts += repeatedAttempts;
  session.lastVerifiedAt = now;
  session.earlyByDevice[deviceId] = {
    firstAttemptAt: now,
    lastAttemptAt: now,
    repeatedAttempts: 0,
  };
  if (session.warningStage < 2) {
    session.warningStage += 1;
    return { warning: newWarningMessage(session.warningStage) };
  }
  session.restrictionPending = true;
  return {
    restrictionRequired: true,
    security: {
      status: "pending",
      message:
        "Cloud rolls are being paused after continued server-verified cooldown bypass attempts. Your saved progress is not being deleted.",
    },
  };
}

function recordEarlyRequest(session, requestId, now) {
  session.earlyRequestIds = Object.fromEntries(
    Object.entries(session.earlyRequestIds ?? {})
      .filter(([, expiresAt]) => expiresAt > now)
      .slice(-MAX_EARLY_REQUEST_IDS),
  );
  if (Object.hasOwn(session.earlyRequestIds, requestId)) return false;
  session.earlyRequestIds[requestId] = now + IDEMPOTENCY_TTL_MS;
  session.earlyRequestIds = Object.fromEntries(
    Object.entries(session.earlyRequestIds).slice(-MAX_EARLY_REQUEST_IDS),
  );
  return true;
}

function normalizeSavedProgress(progress) {
  if (
    !progress ||
    typeof progress !== "object" ||
    Array.isArray(progress) ||
    typeof progress.profile?.id !== "string" ||
    !progress.profile.id ||
    !Array.isArray(progress.owned) ||
    !Array.isArray(progress.skills) ||
    !Array.isArray(progress.equippedSkills)
  )
    throw new Error("The Cloud save is not ready for a server roll.");

  const owned = [...new Set(progress.owned)].filter(
    (id) => typeof id === "string" && productById.has(id),
  );
  const skills = [...new Set(progress.skills)].filter(
    (id) => typeof id === "string" && skillById.has(id),
  );
  const equippedSkills = [...new Set(progress.equippedSkills)].filter(
    (id) => typeof id === "string" && skillById.has(id),
  );
  const skillCharge = {};
  if (
    progress.skillCharge &&
    typeof progress.skillCharge === "object" &&
    !Array.isArray(progress.skillCharge)
  )
    for (const [id, value] of Object.entries(progress.skillCharge))
      if (
        skillById.has(id) &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 1_000_000
      )
        skillCharge[id] = value;

  return {
    profile: { id: progress.profile.id },
    owned,
    skills,
    equippedSkills,
    skillCharge,
    activePet:
      typeof progress.activePet === "string" ? progress.activePet : null,
    flywheelCharge:
      Number.isSafeInteger(progress.flywheelCharge) &&
      progress.flywheelCharge >= 0
        ? progress.flywheelCharge
        : 0,
  };
}

export function authoritativeGamePlan(savedProgress) {
  const progress = normalizeSavedProgress(savedProgress);
  const armed = armedSkills(progress);
  const picks = [];
  let drawsUsed = 0;
  for (const pick of drawPicksFor(armed)) {
    if (drawsUsed + pick.attempts > SKILL_MAX_DRAWS) continue;
    picks.push(pick);
    drawsUsed += pick.attempts;
  }

  const hasDrawPlan = drawPlanFor(armed) !== null;
  const drawCount = hasDrawPlan
    ? Math.min(
        SKILL_MAX_DRAWS,
        drawsUsed + (drawsUsed < SKILL_MAX_DRAWS ? 1 : 0),
      )
    : 1;
  const firedSkills = armed.filter(
    (id) => !drawPicksFor([id]).length || picks.some((pick) => pick.id === id),
  );
  const timing = rollSettings(progress.owned);
  const flywheel = flywheelForDraw(progress);
  if (flywheel === "boost" || skillWaivesCooldown(armed)) timing.cooldownMS = 0;

  return {
    profileId: progress.profile.id,
    rollMS: timing.rollMS,
    cooldownMS: timing.cooldownMS,
    drawCount,
    armedSkills: armed,
    firedSkills,
    flywheel,
  };
}

export class GameSessionDurableObject {
  constructor(state, env = {}) {
    this.state = state;
    this.clock = env.clock ?? (() => Date.now());
    this.randomInteger = env.randomInteger ?? randomRollNumber;
    this.createId = env.createId ?? (() => crypto.randomUUID());
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/status")
      return this.readStatus();
    if (request.method === "POST" && path === "/roll")
      return this.issueRoll(request);
    if (request.method === "POST" && path === "/confirm-restriction")
      return this.confirmRestriction();
    if (request.method === "POST" && path === "/clear-restriction")
      return this.clearRestriction();
    return jsonResponse(404, { ok: false, code: "not-found" });
  }

  async readStatus() {
    const transaction = this.state.storage.transaction
      ? (callback) => this.state.storage.transaction(callback)
      : (callback) => callback(this.state.storage);
    return transaction(async (storage) => {
      const session = (await storage.get("session")) ?? emptySession();
      if (resetExpiredWarnings(session, this.clock()))
        await storage.put("session", session);
      return jsonResponse(200, {
        ok: true,
        security: currentSecurity(session),
        verifiedEvents: session.verifiedEvents,
        verifiedAttempts: session.verifiedAttempts,
      });
    });
  }

  async issueRoll(request) {
    let input;
    try {
      input = await request.json();
    } catch {
      return jsonResponse(400, { ok: false, code: "invalid-request" });
    }
    const { requestId, deviceId, plan } = input ?? {};
    if (
      !validIdentifier(requestId) ||
      !validIdentifier(deviceId) ||
      !validPlan(plan)
    )
      return jsonResponse(400, { ok: false, code: "invalid-request" });

    const transaction = this.state.storage.transaction
      ? (callback) => this.state.storage.transaction(callback)
      : (callback) => callback(this.state.storage);
    return transaction(async (storage) => {
      const now = this.clock();
      const session = (await storage.get("session")) ?? emptySession();
      session.requests = Object.fromEntries(
        Object.entries(session.requests ?? {})
          .filter(([, cached]) => cached?.expiresAt > now)
          .slice(-MAX_IDEMPOTENT_REQUESTS),
      );
      const cached = session.requests[requestId];
      if (cached) {
        if (cached.deviceId !== deviceId)
          return jsonResponse(409, {
            ok: false,
            code: "idempotency-conflict",
            message: "That roll request ID has already been used.",
          });
        return jsonResponse(200, cached.response);
      }

      if (session.restricted)
        return jsonResponse(403, {
          ok: false,
          code: "cloud-restricted",
          security: currentSecurity(session),
        });
      if (session.restrictionPending)
        return jsonResponse(409, {
          ok: false,
          code: "restriction-pending",
          restrictionRequired: true,
          security: {
            status: "pending",
            message:
              "Cloud rolls are being paused after continued server-verified cooldown bypass attempts. Your saved progress is not being deleted.",
          },
          verifiedEvents: session.verifiedEvents,
          verifiedAttempts: session.verifiedAttempts,
        });

      if (now < session.nextAllowedAt) {
        const retryAfterMs = session.nextAllowedAt - now;
        let security = currentSecurity(session);
        let warning = null;
        let restrictionRequired = false;
        if (
          deviceId === session.lastSuccessfulDevice &&
          retryAfterMs > EARLY_ROLL_TOLERANCE_MS &&
          recordEarlyRequest(session, requestId, now)
        ) {
          if (
            session.lastVerifiedAt &&
            now - session.lastVerifiedAt > WARNING_RESET_AFTER_MS
          ) {
            session.warningStage = 0;
            session.verifiedEvents = 0;
            session.verifiedAttempts = 0;
          }
          const outcome = addVerifiedEarlyAttempt(session, deviceId, now);
          warning = outcome?.warning ?? null;
          restrictionRequired = outcome?.restrictionRequired === true;
          security = outcome?.security ?? warning ?? currentSecurity(session);
        }
        await storage.put("session", session);
        if (restrictionRequired)
          return jsonResponse(409, {
            ok: false,
            code: "restriction-pending",
            restrictionRequired: true,
            security,
            verifiedEvents: session.verifiedEvents,
            verifiedAttempts: session.verifiedAttempts,
          });
        return jsonResponse(429, {
          ok: false,
          code: "roll-not-ready",
          retryAfterMs,
          message:
            warning?.message ??
            "The server cooldown has not finished yet. Please wait and try again.",
          ...(warning ? { warning } : {}),
          security,
        });
      }

      const numbers = Array.from({ length: plan.drawCount }, () => {
        const number = this.randomInteger();
        if (!Number.isSafeInteger(number) || number < 0 || number >= ROLL_COUNT)
          throw new Error(
            "The server random source returned an invalid number.",
          );
        return number;
      });
      const response = {
        ok: true,
        rollId: this.createId(),
        profileId: plan.profileId,
        drawCount: numbers.length,
        numbers,
        timing: { rollMS: plan.rollMS, cooldownMS: plan.cooldownMS },
        armedSkills: [...plan.armedSkills],
        firedSkills: [...plan.firedSkills],
        flywheel: plan.flywheel,
        security: currentSecurity(session),
        serverTime: now,
        nextAllowedAt: now + plan.rollMS + plan.cooldownMS,
      };
      session.nextAllowedAt = response.nextAllowedAt;
      session.lastSuccessfulDevice = deviceId;
      session.earlyByDevice = {};
      session.requests[requestId] = {
        expiresAt: now + IDEMPOTENCY_TTL_MS,
        deviceId,
        response,
      };
      session.requests = Object.fromEntries(
        Object.entries(session.requests).slice(-MAX_IDEMPOTENT_REQUESTS),
      );
      await storage.put("session", session);
      return jsonResponse(200, response);
    });
  }

  async confirmRestriction() {
    const transaction = this.state.storage.transaction
      ? (callback) => this.state.storage.transaction(callback)
      : (callback) => callback(this.state.storage);
    return transaction(async (storage) => {
      const session = (await storage.get("session")) ?? emptySession();
      session.restricted = true;
      session.restrictionPending = false;
      await storage.put("session", session);
      return jsonResponse(200, {
        ok: true,
        security: currentSecurity(session),
      });
    });
  }

  async clearRestriction() {
    const transaction = this.state.storage.transaction
      ? (callback) => this.state.storage.transaction(callback)
      : (callback) => callback(this.state.storage);
    return transaction(async (storage) => {
      const session = (await storage.get("session")) ?? emptySession();
      session.restricted = false;
      session.restrictionPending = false;
      session.warningStage = 0;
      session.verifiedEvents = 0;
      session.verifiedAttempts = 0;
      session.lastVerifiedAt = 0;
      session.earlyByDevice = {};
      session.earlyRequestIds = {};
      await storage.put("session", session);
      return jsonResponse(200, {
        ok: true,
        security: currentSecurity(session),
      });
    });
  }
}
