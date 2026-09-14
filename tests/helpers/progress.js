import { emptyProgress, PROGRESS_KEY } from "../../src/progress.js";
export const testProfile = {
  id: "test-profile",
  username: "LuckyTester",
  createdAt: 1700000000000,
};
export async function seedProgress(page, values = {}) {
  await page.addInitScript(
    ({ key, data }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(data));
    },
    {
      key: PROGRESS_KEY,
      data: { ...emptyProgress(), profile: testProfile, ...values },
    },
  );
}
