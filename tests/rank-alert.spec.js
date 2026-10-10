import { test, expect } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import { mockRandom } from "./helpers/random-roll.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { SETTINGS_KEY } from "../src/settings.js";

const ROLL_NUMBER = 604827;
const MINIMUM_RANK = "common";
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const rolls = async (page) =>
  (await saved(page)).history.filter((entry) => entry.type === "roll");
const autoRollSwitch = (page) =>
  page.getByRole("switch", { name: "Auto-Roll", exact: true });

// A selected rank threshold stops automation and leaves the roll's stats
// available, without putting its exact number in the notification.
test("a rank alert stops Auto-Roll and keeps the roll's stats on screen", async ({
  page,
}) => {
  await seedProgress(page, { owned: ["auto-roll"] });
  await mockRandom(page, [ROLL_NUMBER, 1337]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.__rankNotifications = [];
    class TestNotification {
      static permission = "granted";
      constructor(title, options) {
        this.title = title;
        this.options = options;
        window.__rankNotifications.push({ title, ...options });
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: TestNotification,
    });
  });

  await page.goto("/settings");
  const rankSelect = page.getByLabel("Notify me at this rank or higher");
  await expect(rankSelect).toBeDisabled();
  await page
    .getByRole("switch", {
      name: "Desktop notification when a roll is ready",
    })
    .click();
  await expect(rankSelect).toBeEnabled();
  await rankSelect.selectOption(MINIMUM_RANK);
  await expect(rankSelect).toHaveValue(MINIMUM_RANK);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).notifyRank,
      SETTINGS_KEY,
    ),
  ).toBe(MINIMUM_RANK);

  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await expect(autoRollSwitch(page)).toHaveAttribute("aria-checked", "false");
  await autoRollSwitch(page).click();
  await page.clock.runFor(300);

  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await expect(autoRollSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".result-rank .rank-pill")).toBeVisible();
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    `Number ${ROLL_NUMBER}`,
  );
  await expect(page.locator(".result-rank .rank-pill")).toHaveText("common");

  await expect
    .poll(() => page.evaluate(() => window.__rankNotifications.length))
    .toBe(1);
  const notification = await page.evaluate(() => window.__rankNotifications[0]);
  expect(notification).toMatchObject({
    title: "Common rank reached",
    body: "Auto-Roll stopped. Return to RNGdle Infinite to review this roll.",
    tag: "rngdle-infinite-rank",
    silent: true,
  });
  expect(notification.title).not.toContain(String(ROLL_NUMBER));
  expect(notification.body).not.toContain(String(ROLL_NUMBER));
  expect((await rolls(page)).map((entry) => entry.number)).toEqual([
    ROLL_NUMBER,
  ]);

  await page.clock.fastForward(180000);
  await expect(autoRollSwitch(page)).toHaveAttribute("aria-checked", "false");
  expect((await rolls(page)).map((entry) => entry.number)).toEqual([
    ROLL_NUMBER,
  ]);
});
