import { RNGWEEN_INTRO_KEY } from "../../src/rngween-intro.js";
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
    ({ key, data, introSeen, introKey }) => {
      if (introSeen) localStorage.setItem(introKey, "rngween-2026");
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(data));
    },
    {
      key: PROGRESS_KEY,
      introSeen,
      introKey: RNGWEEN_INTRO_KEY,
      data: { ...emptyProgress(), profile: testProfile, ...values },
    },
  );
}
