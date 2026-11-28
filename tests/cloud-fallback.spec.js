import { expect, test } from "@playwright/test";
import {
  CLOUD_RECOVERY_MAX_ATTEMPTS,
  canProbeCloudOutage,
  CLOUD_RECOVERY_MAX_PROBE_MS,
  beginCloudOutage,
  clearCloudOutage,
  endCloudOutage,
  nextProbeDelay,
  outageForAccount,
  readCloudOutage,
  recoveryForUser,
  rememberCloudOutage,
} from "../src/cloud-fallback.js";
import { allowsLocalFallback } from "../src/error-codes.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("only a Cloud outage falls back to local play; a decision by the server does not", () => {
  expect(
    allowsLocalFallback({ code: "game-security-unavailable", status: 503 }),
  ).toBe(true);
  expect(
    allowsLocalFallback({ code: "cloud-save-unavailable", status: 503 }),
  ).toBe(true);
  expect(
    allowsLocalFallback({ code: "cloud-save-not-ready", status: 409 }),
  ).toBe(false);
  expect(
    allowsLocalFallback({ code: "cloud-save-not-ready", status: 503 }),
  ).toBe(true);
  // A request that never left the browser is an outage, not a decision.
  expect(
    allowsLocalFallback({ code: "game-security-unavailable", status: 0 }),
  ).toBe(true);

  // Anything the server decided stays a decision: paused access, a cooldown, a
  // rejected request.
  expect(allowsLocalFallback({ code: "cloud-restricted", status: 403 })).toBe(
    false,
  );
  expect(
    allowsLocalFallback({ code: "restriction-pending", status: 403 }),
  ).toBe(false);
  expect(allowsLocalFallback({ code: "roll-not-ready", status: 429 })).toBe(
    false,
  );
  expect(allowsLocalFallback({ code: "sign-in-required", status: 401 })).toBe(
    false,
  );
  expect(allowsLocalFallback({ code: "request-not-secure" })).toBe(false);
  expect(allowsLocalFallback(new Error("offline"))).toBe(false);
  expect(allowsLocalFallback(null)).toBe(false);
});

test("the outage mark belongs to one account and one session", () => {
  const storage = memoryStorage();
  expect(readCloudOutage(storage)).toBeNull();
  expect(
    rememberCloudOutage(
      { userId: "uid-a", sessionId: "session-1", profileId: "profile-a" },
      storage,
    ),
  ).toBe(true);
  expect(readCloudOutage(storage)).toMatchObject({
    userId: "uid-a",
    sessionId: "session-1",
  });
  expect(recoveryForUser("uid-a", "session-1", storage)).toBeTruthy();
  expect(recoveryForUser("uid-b", "session-1", storage)).toBeNull();
  expect(recoveryForUser("uid-a", "session-2", storage)).toBeNull();

  // A stale or hand-edited mark must not switch the game offline.
  storage.setItem(
    "rng-infinite-cloud-recovery-v1",
    JSON.stringify({ active: false }),
  );
  expect(readCloudOutage(storage)).toBeNull();
  storage.setItem("rng-infinite-cloud-recovery-v1", "{not json");
  expect(readCloudOutage(storage)).toBeNull();
  storage.setItem(
    "rng-infinite-cloud-recovery-v1",
    JSON.stringify({ active: true }),
  );
  expect(readCloudOutage(storage)).toBeNull();

  rememberCloudOutage({ userId: "uid-a", sessionId: "session-1" }, storage);
  clearCloudOutage(storage);
  expect(readCloudOutage(storage)).toBeNull();
});

test("an outage is kept per account, so signing in elsewhere does not inherit it", () => {
  const storage = memoryStorage();
  const first = beginCloudOutage("uid-a", { profileId: "profile-a" }, storage);
  expect(first?.userId).toBe("uid-a");
  expect(first?.sessionId).toMatch(/^outage-/);
  // Hitting the same outage again resumes it instead of restarting the backoff.
  expect(beginCloudOutage("uid-a", {}, storage)?.sessionId).toBe(
    first.sessionId,
  );
  expect(outageForAccount("uid-a", storage)?.sessionId).toBe(first.sessionId);
  expect(outageForAccount("uid-b", storage)).toBeNull();
  expect(outageForAccount("", storage)).toBeNull();
  expect(recoveryForUser("uid-a", first.sessionId, storage)).toBeTruthy();

  // Ending an outage only applies to the account that owns it.
  expect(endCloudOutage("uid-b", storage)).toBe(false);
  expect(outageForAccount("uid-a", storage)).toBeTruthy();
  expect(endCloudOutage("uid-a", storage)).toBe(true);
  expect(outageForAccount("uid-a", storage)).toBeNull();

  // A guest has no outage to record.
  expect(beginCloudOutage(null, {}, storage)).toBeNull();
});

test("a very long outage stops probing instead of retrying forever", () => {
  const storage = memoryStorage();
  beginCloudOutage("uid-a", {}, storage);
  for (let attempts = 1; attempts <= CLOUD_RECOVERY_MAX_ATTEMPTS; attempts++) {
    const mark = outageForAccount("uid-a", storage);
    rememberCloudOutage(
      {
        userId: "uid-a",
        sessionId: mark.sessionId,
        attempts,
        profileId: mark.profileId,
      },
      storage,
    );
  }
  expect(outageForAccount("uid-a", storage)?.attempts).toBe(40);
  // The mark survives: a reload still resumes local play for this account.
  expect(outageForAccount("uid-a", storage)?.sessionId).toBeTruthy();
});

test("the probe backs off to one minute and stops growing", () => {
  expect(nextProbeDelay(0)).toBe(3_000);
  expect(nextProbeDelay(1)).toBe(6_000);
  expect(nextProbeDelay(2)).toBe(12_000);
  expect(nextProbeDelay(30)).toBe(CLOUD_RECOVERY_MAX_PROBE_MS);
  expect(nextProbeDelay(-4)).toBe(3_000);
  expect(nextProbeDelay(Number.NaN)).toBe(3_000);

  // A Worker missing a binding keeps failing; the probe must still not hammer it.
  for (const attempts of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 40]) {
    const delay = nextProbeDelay(attempts);
    expect(delay).toBeGreaterThanOrEqual(3_000);
    expect(delay).toBeLessThanOrEqual(CLOUD_RECOVERY_MAX_PROBE_MS);
  }
  expect(nextProbeDelay(8)).toBe(nextProbeDelay(30));
});

test("a broken storage refuses the mark instead of throwing", () => {
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  expect(rememberCloudOutage({ userId: "u", sessionId: "s" }, broken)).toBe(
    false,
  );
  expect(readCloudOutage(broken)).toBeNull();
  expect(() => clearCloudOutage(broken)).not.toThrow();
});

test("the retry budget has an exact stopping boundary, including after reload", () => {
  const storage = memoryStorage();
  for (const attempts of [0, 39, 40, 41]) {
    rememberCloudOutage(
      { userId: "user", sessionId: "session", attempts },
      storage,
    );
    expect(canProbeCloudOutage(readCloudOutage(storage))).toBe(attempts < 40);
  }
  expect(canProbeCloudOutage(null)).toBe(false);
});

test("malformed outage counters and timestamps cannot activate local fallback", () => {
  const storage = memoryStorage();
  const key = "rng-infinite-cloud-recovery-v1";
  const valid = {
    active: true,
    userId: "user",
    sessionId: "session",
    attempts: 0,
    at: Date.now(),
    profileId: "profile",
  };
  for (const change of [
    { attempts: "1" },
    { attempts: -1 },
    { attempts: 1.5 },
    { at: null },
    { at: -1 },
    { at: 8640000000000001 },
    { profileId: {} },
  ]) {
    storage.setItem(key, JSON.stringify({ ...valid, ...change }));
    expect(readCloudOutage(storage)).toBeNull();
  }
});

test("only actual HTTP outages qualify, not coerced or invalid status values", () => {
  for (const status of [
    null,
    "503",
    "",
    true,
    499,
    600,
    999,
    Infinity,
    503.1,
  ]) {
    if (status === null) continue;
    expect(
      allowsLocalFallback({ code: "game-security-unavailable", status }),
    ).toBe(false);
  }
});
