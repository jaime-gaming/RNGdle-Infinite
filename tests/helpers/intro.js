import {
  RNGWEEN_INTRO_KEY,
  RNGWEEN_WORLD_INTRO_KEY,
} from "../../src/rngween-intro.js";
import { RNGWEEN_ID } from "../../src/rngween.js";

// The welcome and the World opening are once-per-browser receipts, and they
// hold a modal when they appear. The suite runs on today's date, which sits
// inside the RNGween window, so every context starts with both receipts
// already written; a test that wants the welcome simply deletes them (see
// helpers/progress.js and helpers/season-clock.js).
const ORIGIN = "http://127.0.0.1:5173";
export const introStorageState = {
  cookies: [],
  origins: [
    {
      origin: ORIGIN,
      localStorage: [
        { name: RNGWEEN_INTRO_KEY, value: RNGWEEN_ID },
        { name: RNGWEEN_WORLD_INTRO_KEY, value: RNGWEEN_ID },
      ],
    },
  ],
};
// Tests that open a second, isolated browser (linking, sharing, two tabs)
// cannot inherit the config's storage state, so they use this instead.
export function eventContext(browser, options = {}) {
  return browser.newContext({ ...options, storageState: introStorageState });
}
