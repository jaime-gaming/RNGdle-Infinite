import { rngweenCalendar } from "./rngween.js";

// The week before the Limited Shop opens: one quiet line where the Reaper's
// Gate will sit. Only the verified UTC clock shows it, and it leaves on its
// own the moment the gate takes its place.
// CLEANUP Oct 21, 2026 00:00 UTC: dead code once the gate is open; remove with
// the gate on Nov 4.
export const COUNTDOWN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function rngweenCountdownVisible(now) {
  const season = rngweenCalendar(now);
  if (season.limitedPhase !== "upcoming") return false;
  return season.limitedStartsAt - now <= COUNTDOWN_WINDOW_MS;
}

// "3d 4h", "4h 12m" or "12m": enough to plan around, never a ticking clock.
export function countdownLabel(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
