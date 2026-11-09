export const AUTO_ROLL_KEY = "rng-infinite-auto-roll-v1";
const scoped = (profileId) => `${AUTO_ROLL_KEY}:${profileId ?? "guest"}`;

export function readAutoRoll(profileId) {
  try {
    return localStorage.getItem(scoped(profileId)) === "on";
  } catch {
    return false;
  }
}

export function writeAutoRoll(profileId, enabled) {
  try {
    if (enabled) localStorage.setItem(scoped(profileId), "on");
    else localStorage.removeItem(scoped(profileId));
    return true;
  } catch {
    return false;
  }
}

export function clearAutoRoll(profileId) {
  try {
    localStorage.removeItem(scoped(profileId));
  } catch {}
}
