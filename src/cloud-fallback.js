// A Cloud outage must not become a manual decision. While the Worker cannot
// verify rolls, the game keeps playing on this device; a short probe keeps
// asking whether Cloud is back, and when it answers the saved progress is
// reconciled by the normal Cloud-save precedence. Nothing is asked of the
// player unless two different profiles really have to be chosen between.
const CLOUD_RECOVERY_KEY = "rng-infinite-cloud-recovery-v1";

export const CLOUD_RECOVERY_FIRST_PROBE_MS = 3_000;
export const CLOUD_RECOVERY_MAX_PROBE_MS = 60_000;
export const CLOUD_RECOVERY_MAX_ATTEMPTS = 40;

// Backoff doubles up to a minute: a Worker that is missing a binding stays
// unavailable until it is redeployed, so the paused game must not hammer it.
export function nextProbeDelay(attempts = 0) {
  const count = Math.max(0, Math.trunc(Number(attempts) || 0));
  return Math.min(
    CLOUD_RECOVERY_MAX_PROBE_MS,
    CLOUD_RECOVERY_FIRST_PROBE_MS * 2 ** Math.min(count, 8),
  );
}

function storageRef(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCloudOutage(storage) {
  try {
    const raw = storageRef(storage)?.getItem(CLOUD_RECOVERY_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    // A mark left by a previous build, or one without an owner, must not switch
    // the game to local play.
    if (stored?.active !== true) return null;
    if (typeof stored.userId !== "string" || !stored.userId) return null;
    if (typeof stored.sessionId !== "string" || !stored.sessionId) return null;
    if (
      !Number.isSafeInteger(stored.at) ||
      stored.at < 0 ||
      stored.at > 8640000000000000
    )
      return null;
    if (
      stored.attempts != null &&
      (!Number.isSafeInteger(stored.attempts) || stored.attempts < 0)
    )
      return null;
    if (stored.profileId != null && typeof stored.profileId !== "string")
      return null;
    return {
      ...stored,
      attempts: Math.min(stored.attempts ?? 0, CLOUD_RECOVERY_MAX_ATTEMPTS),
      profileId: stored.profileId ?? "",
    };
  } catch {
    return null;
  }
}

export function rememberCloudOutage(
  { userId, sessionId, attempts = 0, at = Date.now(), profileId = "" } = {},
  storage,
) {
  try {
    const target = storageRef(storage);
    if (!target || !userId || !sessionId) return false;
    target.setItem(
      CLOUD_RECOVERY_KEY,
      JSON.stringify({
        active: true,
        userId,
        sessionId,
        attempts: Math.min(
          CLOUD_RECOVERY_MAX_ATTEMPTS,
          Math.max(0, Math.trunc(Number(attempts) || 0)),
        ),
        profileId: typeof profileId === "string" ? profileId : "",
        at,
      }),
    );
    return readCloudOutage(target) !== null;
  } catch {
    return false;
  }
}

export function clearCloudOutage(storage) {
  try {
    storageRef(storage)?.removeItem(CLOUD_RECOVERY_KEY);
  } catch {}
}

export function recoveryForUser(userId, sessionId, storage) {
  const stored = readCloudOutage(storage);
  if (!stored) return null;
  if (stored.userId !== userId || stored.sessionId !== sessionId) return null;
  return stored;
}

// One outage per device and account, from the first unverified roll until the
// Worker answers again. Reloads resume the same session, so a paused game comes
// back to local play without a click; a different account starts its own.
export function outageForAccount(userId, storage) {
  if (typeof userId !== "string" || !userId) return null;
  const stored = readCloudOutage(storage);
  if (stored && stored.userId === userId) return stored;
  return null;
}

export function beginCloudOutage(
  userId,
  { active = true, profileId } = {},
  storage,
) {
  if (!active || typeof userId !== "string" || !userId) return null;
  const existing = outageForAccount(userId, storage);
  if (existing) return existing;
  const sessionId = `outage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  rememberCloudOutage({ userId, sessionId, profileId }, storage);
  return outageForAccount(userId, storage);
}

// Called when the Worker answers again: the mark goes, and the next Cloud write
// reconciles this device's progress with the online copy.
export function endCloudOutage(userId, storage) {
  const stored = readCloudOutage(storage);
  if (stored && userId && stored.userId !== userId) return false;
  clearCloudOutage(storage);
  return true;
}

export function canProbeCloudOutage(mark) {
  return Boolean(
    mark &&
    Number.isSafeInteger(mark.attempts) &&
    mark.attempts >= 0 &&
    mark.attempts < CLOUD_RECOVERY_MAX_ATTEMPTS,
  );
}
