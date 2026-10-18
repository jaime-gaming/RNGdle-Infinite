import { RNGWEEN_ID } from "./rngween.js";

// CLEANUP Nov 4, 2026: remove the welcome mount/helper. Keep the seen receipt
// until then: it is local presentation, not an account reward or date control.
export const RNGWEEN_INTRO_KEY = "rng-infinite-rngween-intro-v1";
export function hasSeenRngweenIntro() {
  try {
    return localStorage.getItem(RNGWEEN_INTRO_KEY) === RNGWEEN_ID;
  } catch {
    return false;
  }
}
export function markRngweenIntroSeen() {
  try {
    localStorage.setItem(RNGWEEN_INTRO_KEY, RNGWEEN_ID);
    return true;
  } catch {
    return false;
  }
}

// CLEANUP Nov 4, 2026: remove with the World gate. A local receipt that the
// player has already walked into the World once, so the home gate can open
// straight into it instead of routing through the Reaper every time.
export const RNGWEEN_WORLD_ENTERED_KEY =
  "rng-infinite-rngween-world-entered-v1";
export function hasEnteredRngweenWorld() {
  try {
    return localStorage.getItem(RNGWEEN_WORLD_ENTERED_KEY) === RNGWEEN_ID;
  } catch {
    return false;
  }
}
export function markRngweenWorldEntered() {
  try {
    localStorage.setItem(RNGWEEN_WORLD_ENTERED_KEY, RNGWEEN_ID);
  } catch {
    /* private mode: the Reaper simply greets again next time */
  }
}
