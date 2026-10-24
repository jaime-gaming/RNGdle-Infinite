import {
  RNGWEEN_INTRO_KEY,
  RNGWEEN_WORLD_INTRO_KEY,
} from "../../src/rngween-intro.js";
import { emptyProgress, PROGRESS_KEY } from "../../src/progress.js";
export const testProfile = {
  id: "test-profile",
  username: "LuckyTester",
  createdAt: 1700000000000,
};
export async function seedProgress(
  page,
  values = {},
  { introSeen = true } = {},
) {
  await page.addInitScript(
    ({ key, data, introSeen, introKey, worldIntroKey }) => {
      // The config seeds both receipts; a test that wants to watch them deletes
      // them here, before the page loads.
      if (introSeen) {
        localStorage.setItem(introKey, "rngween-2026");
        localStorage.setItem(worldIntroKey, "rngween-2026");
      } else if (!sessionStorage.getItem("rng-tests-intro-cleared")) {
        // Only on the first document: a reload must keep whatever the game has
        // written since, or a once-per-device opening would play again.
        sessionStorage.setItem("rng-tests-intro-cleared", "1");
        localStorage.removeItem(introKey);
        localStorage.removeItem(worldIntroKey);
      }
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(data));
    },
    {
      key: PROGRESS_KEY,
      introSeen,
      introKey: RNGWEEN_INTRO_KEY,
      worldIntroKey: RNGWEEN_WORLD_INTRO_KEY,
      data: { ...emptyProgress(), profile: testProfile, ...values },
    },
  );
}
