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

// Seconds to show on the countdown. The wait itself is unchanged — eligibility
// always uses cooldownUntil — but while the reveal is still playing we display
// the cooldown alone instead of reveal + cooldown, so the number on screen is
// the one the player actually waits after the reveal finishes.
export function displayedCooldownSeconds(window, deadline, now) {
  const remaining = Math.max(0, deadline - now);
  if (!window || window.endsAt !== deadline) return Math.ceil(remaining / 1000);
  // Before the cooldown starts, hold at its full length rather than counting
  // the reveal; afterwards it ticks down normally.
  return Math.ceil(
    Math.min(remaining, window.endsAt - Math.max(now, window.startsAt)) / 1000,
  );
}
