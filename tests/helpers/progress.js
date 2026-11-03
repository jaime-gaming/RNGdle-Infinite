import { emptyProgress, PROGRESS_KEY } from "../../src/progress.js";
import { LOCAL_PLAY_KEY } from "../../src/local-play.js";

export const testProfile = {
  id: "test-profile",
  username: "LuckyTester",
  createdAt: 1700000000000,
};

export async function seedProgress(page, values = {}) {
  // A seeded named profile models someone who chose to continue locally.
  await page.addInitScript(
    ({ key, data, localPlayKey }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(data));
      if (data.profile) localStorage.setItem(localPlayKey, "1");
    },
    {
      key: PROGRESS_KEY,
      localPlayKey: LOCAL_PLAY_KEY,
      data: { ...emptyProgress(), profile: testProfile, ...values },
    },
  );
}
