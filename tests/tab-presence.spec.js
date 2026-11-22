import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { seedProgress } from "./helpers/progress.js";
import { mockRandom } from "./helpers/random-roll.js";
import { PRESENCE_PREFIX } from "../src/offline.js";
import { readSavedProgress } from "./helpers/save.js";

async function setVisibility(page, value) {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
}

test("a tab left in the background stops advertising itself as a visible player", async ({
  page,
}) => {
  await seedProgress(page, {
    owned: ["offline-roller"],
    offline: {
      lastSeenAt: Date.now() - 61 * 60 * 1000,
      batch: null,
      report: null,
    },
  });
  await mockRandom(page, [604827]);
  await page.goto("/");
  await waitForApp(page);

  await expect
    .poll(async () => (await readSavedProgress(page)).offline.lastSeenAt)
    .toBeGreaterThan(Date.now() - 30_000);

  // Coming back after an hour pays offline rolls on a full-screen summary; the
  // tab visibility checks below need the game itself.
  const dismiss = page.getByRole("button", { name: "Keep playing" });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  await expect(
    page.getByRole("dialog", { name: "Offline rewards" }),
  ).toHaveCount(0);

  await setVisibility(page, "hidden");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(50);

  const presence = await page.evaluate(
    (prefix) =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => JSON.parse(value)),
    PRESENCE_PREFIX,
  );
  expect(presence.length).toBeGreaterThan(0);
  expect(presence.every((row) => row.visible === false)).toBe(true);
});
