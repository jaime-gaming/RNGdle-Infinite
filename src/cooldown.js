import { COOLDOWN_DURATIONS } from "./shop-data.js";

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

export function displayedCooldownSeconds(window, deadline, now) {
  const remaining = Math.max(0, deadline - now);
  if (!window || window.endsAt !== deadline) return Math.ceil(remaining / 1000);

  return Math.max(
    0,
    Math.ceil(
      Math.min(remaining, window.endsAt - Math.max(now, window.startsAt)) /
        1000,
    ),
  );
}

export function cooldownLabel(window, deadline, now) {
  if (!window || window.endsAt !== deadline) return "NEXT ROLL IN";
  return now < window.startsAt ? "COOLDOWN IN" : "NEXT ROLL IN";
}
