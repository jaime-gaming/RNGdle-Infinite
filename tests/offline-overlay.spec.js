import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { seedProgress } from "./helpers/progress.js";
import { mockRandom } from "./helpers/random-roll.js";
import { readSavedProgress } from "./helpers/save.js";

const away = (count) => ({
  owned: ["offline-roller"],
  offline: {
    lastSeenAt: Date.now() - count * 60000 - 1000,
    batch: null,
    report: null,
  },
});

test("the offline summary is a full-screen modal that hands the viewport back", async ({
  page,
}) => {
  await seedProgress(page, away(60));
  await mockRandom(page, [604827]);
  await page.goto("/");
  await waitForApp(page);

  await expect
    .poll(async () => (await readSavedProgress(page)).offline.report, {
      timeout: 20000,
    })
    .not.toBeNull();
  await expect
    .poll(async () => (await readSavedProgress(page)).offline.batch)
    .toBeNull();

  const overlay = page.getByRole("dialog", { name: "Offline rewards" });
  await expect(overlay).toBeVisible();
  const box = await overlay.boundingBox();
  const viewport = page.viewportSize();
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(viewport.height - 2);

  await page.getByRole("button", { name: "Keep playing" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator(".generate")).toBeEnabled();
  await expect
    .poll(async () => (await readSavedProgress(page)).offline.report)
    .toBeNull();
});

test("the offline summary stays inside a phone viewport and honours reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedProgress(page, away(24 * 60 + 1));
  await mockRandom(page, [604827]);
  await page.goto("/");
  await waitForApp(page);

  const overlay = page.getByRole("dialog", { name: "Offline rewards" });
  await expect(overlay).toBeVisible({ timeout: 20000 });
  await expect(overlay).toContainText("144 rolls");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(
    await overlay.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  const card = overlay.locator(".offline-card");
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeGreaterThanOrEqual(0);
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(641);

  await page.getByRole("button", { name: "Keep playing" }).click();
  await expect(overlay).toHaveCount(0);
});

test("Escape closes a finished offline summary but never abandons a running batch", async ({
  page,
}) => {
  await seedProgress(page, away(60));
  await mockRandom(page, [604827]);
  await page.goto("/");
  await waitForApp(page);

  const overlay = page.getByRole("dialog", { name: "Offline rewards" });
  await expect(overlay).toBeVisible({ timeout: 20000 });
  await expect(overlay).not.toContainText("Restoring your offline rolls");
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect
    .poll(async () => (await readSavedProgress(page)).offline.report)
    .toBeNull();
});
