import { COOLDOWN_DURATIONS } from "./shop-data.js";
// A cosmetic snapshot only: roll eligibility still uses cooldownUntil.
export function parseCooldownWindow(value, deadline, pending) {
  const candidate =
    value ??
    (pending
      ? {
          startsAt: pending.startedAt + pending.rollMS,
          endsAt: pending.startedAt + pending.rollMS + pending.cooldownMS,
        }
      : null);
  if (
    !candidate ||
    !Number.isSafeInteger(candidate.startsAt) ||
    candidate.startsAt < 0 ||
    !Number.isSafeInteger(candidate.endsAt) ||
    candidate.endsAt !== deadline ||
    ![0, ...COOLDOWN_DURATIONS].includes(candidate.endsAt - candidate.startsAt)
  )
    return null;
  return { startsAt: candidate.startsAt, endsAt: candidate.endsAt };
}
export function cooldownFraction(window, now) {
  if (!window || window.endsAt <= window.startsAt) return 0;
  return Math.max(
    0,
    Math.min(1, (now - window.startsAt) / (window.endsAt - window.startsAt)),
  );
}
