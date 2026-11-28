import { test, expect, pauseClockAt } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { waitForApp } from "./helpers/app.js";
import { readSavedProgress } from "./helpers/save.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import {
  RNGMAS_REWARDS,
  RNGMAS_START,
  RNGMAS_END,
  nextRngmasBoundary,
  winterRewardSource,
  adventRewardFor,
} from "../src/rngmas.js";
import { WINTER_LIVE_EVENTS } from "../src/winter-festival.js";
const saved = () => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 3000000,
  totalEarned: 3000000,
});

test("every offered reward has one explicit source and a valid UTC claim window", () => {
  for (const reward of RNGMAS_REWARDS) {
    const source = winterRewardSource(reward.id);
    expect(source, reward.id).toBeTruthy();
    expect(source.opensAt).toBeGreaterThanOrEqual(RNGMAS_START);
    expect(source.closesAt).toBeLessThanOrEqual(RNGMAS_END);
    expect(source.opensAt).toBeLessThan(source.closesAt);
  }
  expect(winterRewardSource("forged")).toBeNull();
});
test("season clocks wake up on daily, chapter and gathering boundaries rather than thirty seconds later", () => {
  expect(nextRngmasBoundary(RNGMAS_START - 1000)).toBe(RNGMAS_START);
  expect(nextRngmasBoundary(Date.UTC(2026, 11, 7, 23, 59, 59))).toBe(
    Date.UTC(2026, 11, 8),
  );
  for (const event of WINTER_LIVE_EVENTS)
    expect(nextRngmasBoundary(event.start - 1)).toBe(event.start);
  expect(nextRngmasBoundary(RNGMAS_END)).toBe(Infinity);
});
test("starter Advent rewards are meaningful, once-only and do not rewrite older earned EP", () => {
  expect(adventRewardFor(1).ep).toBe(10000);
  expect(adventRewardFor(6).ep).toBe(22500);
  const old = saved();
  old.rngmas.claimed = [1];
  old.history = [
    {
      id: "old-door",
      type: "advent-claim",
      day: 1,
      ep: 2500,
      at: RNGMAS_START + 1000,
    },
  ];
  const restored = parseProgress(JSON.stringify(old));
  expect(restored.history.at(-1).ep).toBe(2500);
  expect(() =>
    applyProgress(restored, {
      type: "claim-advent",
      day: 1,
      at: RNGMAS_START + 1000,
    }),
  ).toThrow(/already/);
  const fresh = saved();
  const result = applyProgress(fresh, {
    type: "claim-advent",
    day: 1,
    at: RNGMAS_START + 1000,
  });
  expect(result.balance - fresh.balance).toBe(10000);
  expect(result.cycleEarnedEP).toBe(fresh.cycleEarnedEP);
});
test("November 28 shows the complete event preview but cannot claim, spend or enable Christmas mode", async ({
  page,
}) => {
  await seedProgress(page, saved());
  await pauseClockAt(page, Date.UTC(2026, 10, 28, 12));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await expect(page.locator(".winter-village-header:visible")).toContainText(
    "Opens December 1",
  );
  await expect(page.locator(".winter-event-guide")).toContainText(
    "November 28 update is a preview",
  );
  await expect(
    page.locator(".winter-tasks .festival-card").first().getByRole("button"),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Christmas mode", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator(".rngmas-decor")).toHaveCount(0);
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  await expect(
    page.getByRole("button", { name: /Advent door 1,/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Rewards", exact: true }).click();
  await expect(page.locator(".festival-collection article")).toHaveCount(13);
  await expect(page.locator(".festival-collection")).toContainText(
    "base companion required",
  );
  await page
    .getByRole("button", { name: "Market & exchange", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Spark Injector ×1/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Exchange EP for Snowcoins",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});
test("the first door unlocks exactly at midnight, pays once, and persists without reload exploits", async ({
  page,
}) => {
  const state = saved();
  await seedProgress(page, state);
  await pauseClockAt(page, RNGMAS_START - 2000);
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  const door = page.getByRole("button", { name: /Advent door 1,/ });
  await expect(door).toBeDisabled();
  const before = await page
    .locator(".winter-village-header:visible .winter-countdown time")
    .textContent();
  await page.clock.runFor(1000);
  const after = await page
    .locator(".winter-village-header:visible .winter-countdown time")
    .textContent();
  expect(after).not.toBe(before);
  await page.clock.runFor(1001);
  await expect(door).toBeEnabled();
  await expect(page.locator(".rngmas-decor")).toHaveCount(1);
  await door.click();
  await expect
    .poll(async () => (await readSavedProgress(page)).balance)
    .toBe(state.balance + 10000);
  await page.reload();
  await waitForApp(page);
  await expect(door).toBeDisabled();
  expect((await readSavedProgress(page)).balance).toBe(state.balance + 10000);
});
test("daily doors and live gatherings switch at their precise UTC boundaries on the open page", async ({
  page,
}) => {
  await seedProgress(page, saved());
  await pauseClockAt(page, Date.UTC(2026, 11, 4, 17, 59, 59));
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Live schedule", exact: true })
    .click();
  await expect(
    page.locator('.festival-card[data-live="true"]:visible'),
  ).toContainText("Light the village tree");
  await page.clock.runFor(1001);
  await expect(
    page.locator('.festival-card[data-live="true"]:visible'),
  ).toContainText("Meteor watch");
});
test("announcement, Tasks, Shop and the winter pass share opaque evergreen styling and readable countdowns", async ({
  page,
}) => {
  await seedProgress(page, saved());
  await pauseClockAt(page, Date.UTC(2026, 11, 17));
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  const tasksColor = await page
    .locator(".winter-village-header:visible")
    .evaluate((node) => getComputedStyle(node).backgroundImage);
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  expect(
    await page
      .locator(".winter-village-header:visible")
      .evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toBe(tasksColor);
  await page.getByTestId("rngmas-event-button").click();
  const dialog = page.getByTestId("rngmas-event-dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog
      .locator(".winter-village-header:visible")
      .evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toBe(tasksColor);
  await expect(dialog.locator(".winter-countdown time")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/pass");
  await waitForApp(page);
  await expect(page.locator(".winter-pass")).toBeVisible();
  await expect(page.locator(".winter-pass .winter-countdown")).toBeVisible();
});
