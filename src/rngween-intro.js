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
