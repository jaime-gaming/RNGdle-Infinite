import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockWorldNumbers } from "./helpers/world-random.js";
import { revealWorld } from "./helpers/world-roll.js";
import { applyProgress, emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { emptyTasks } from "../src/tasks.js";
import {
  RNGWEEN_WORLD_KEY,
  emptyRngweenLimited,
} from "../src/rngween-limited.js";
import {
  KEEP_ROLLING_COST,
  worldPointsAvailable,
  worldState,
} from "../src/rngween-world-zones.js";

const active = Date.UTC(2026, 10, 2, 12);
const taskCounts = { rolls: 300, rare: 60, banked: 8000000, taskClaims: 21 };
const finished = {
  ...emptyTasks(),
  rngween: { id: "rngween-2026", counts: taskCounts, earned: [] },
};
const valleyAccount = (values = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  tasks: finished,
  rngweenLimited: {
    ...emptyRngweenLimited(),
    bought: [RNGWEEN_WORLD_KEY.id],
  },
  ...values,
});
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

test("Keep rolling in the Valley costs zero World points", () => {
  expect(KEEP_ROLLING_COST.points).toBe(0);
  const start = valleyAccount();
  expect(worldPointsAvailable(start.rngweenLimited)).toBe(0);
  const committed = applyProgress(start, {
    type: "rngween-world-keep-rolling",
    zone: "valley",
    number: 42,
    expectedCount: 0,
    at: active,
    rngweenAt: active,
  });
  const world = worldState(committed.rngweenLimited);
  expect(world.pending?.number).toBe(42);
  expect(world.spent).toBe(0);
  expect(worldPointsAvailable(committed.rngweenLimited)).toBe(0);
});

test("Valley Keep rolling shows the last-surprise message, stays visible during reveals, and stops cleanly mid-reveal", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(active) });
  await mockSeasonClock(page, active);
  await mockWorldNumbers(page, [11, 22, 33]);
  await seedProgress(page, valleyAccount());
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="valley"]').click();

  await expect(page.locator(".world-keep-rolling-surprise")).toHaveText(
    "a last surprise before the event ends...",
  );
  const toggle = page.locator(".world-keep-rolling");
  await expect(toggle).toContainText("Keep rolling");
  await expect(toggle).toContainText("Free · runs in background");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toContainText("Stop chain");
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.number)
    .toBe(11);

  // Both the Stop chain button and the last-surprise note stay accessible while revealing.
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeEnabled();
  await expect(page.locator(".world-keep-rolling-surprise")).toHaveText(
    "a last surprise before the event ends...",
  );

  // Let roll 11 settle and verify roll 22 chains automatically with 0 points spent.
  await revealWorld(page);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.drawn)
    .toEqual([11]);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.number)
    .toBe(22);
  expect((await saved(page)).rngweenLimited.world.spent ?? 0).toBe(0);

  // Stopping mid-reveal preserves the committed roll 22 and starts nothing after it.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect((await saved(page)).rngweenLimited.world.pending?.number).toBe(22);
  await revealWorld(page);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.drawn)
    .toEqual([11, 22]);
  await page.clock.fastForward(15000);
  expect((await saved(page)).rngweenLimited.drawn).toEqual([11, 22]);
  expect((await saved(page)).rngweenLimited.world.pending).toBeNull();
});

test("Valley Keep rolling continues across pages, hidden tabs and reloads, then stops and notifies on 6666", async ({
  page,
}) => {
  let now = active;
  await page.clock.install({ time: new Date(now) });
  const site = await mockSeasonClock(page, now);
  await mockWorldNumbers(page, [101, 202, 303, 6666, 777]);
  await seedProgress(page, valleyAccount());
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="valley"]').click();

  await page.locator(".world-keep-rolling").click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.number)
    .toBe(101);

  // Leave the World back to the main Roll page: chaining keeps running in the background.
  await page.getByRole("button", { name: "Back to Roll" }).click();
  await expect(page).toHaveURL(/\/$/);

  now += 10200;
  site.set(now);
  await page.clock.fastForward(10200);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.drawn)
    .toEqual([101]);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.number)
    .toBe(202);

  // Hide the browser tab (invalidating seasonNow until re-verified): chaining still continues.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  now += 10200;
  site.set(now);
  await page.clock.fastForward(10200);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.drawn)
    .toEqual([101, 202]);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.number)
    .toBe(303);

  // Restore visibility and reload on "/": switch survives reload and rolls on to 6666.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.reload();
  await mockWorldNumbers(page, [101, 202, 303, 6666, 777]);

  now += 10200;
  site.set(now);
  await page.clock.fastForward(10200);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.drawn)
    .toEqual([101, 202, 303]);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.number)
    .toBe(6666);

  // Settling 6666 awards Hexbound, notifies on the main page, and stops the chain before 777.
  now += 10200;
  site.set(now);
  await page.clock.fastForward(10200);
  await expect
    .poll(async () => (await saved(page)).owned.includes("hexbound"))
    .toBe(true);
  await expect(page.locator(".toast")).toContainText("Hexbound unlocked");

  now += 15000;
  site.set(now);
  await page.clock.fastForward(15000);
  const finalSave = await saved(page);
  expect(finalSave.rngweenLimited.drawn).toEqual([101, 202, 303, 6666]);
  expect(finalSave.rngweenLimited.world.pending).toBeNull();
  expect(finalSave.rngweenLimited.world.spent ?? 0).toBe(0);
});
