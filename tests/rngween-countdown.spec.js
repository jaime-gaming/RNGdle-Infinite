import { test, expect } from "@playwright/test";
import {
  COUNTDOWN_WINDOW_MS,
  countdownLabel,
  rngweenCountdownVisible,
} from "../src/rngween-countdown.js";
import { rngweenCalendar } from "../src/rngween.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { seedProgress } from "./helpers/progress.js";

const opens = rngweenCalendar(0).limitedStartsAt;

test("the countdown shows only during the verified week before the shop opens", () => {
  expect(rngweenCountdownVisible(opens - COUNTDOWN_WINDOW_MS - 1)).toBe(false);
  expect(rngweenCountdownVisible(opens - COUNTDOWN_WINDOW_MS)).toBe(true);
  expect(rngweenCountdownVisible(opens - 1)).toBe(true);
  expect(rngweenCountdownVisible(opens)).toBe(false);
  expect(rngweenCountdownVisible(NaN)).toBe(false);
  expect(countdownLabel(2 * 86_400_000 + 16 * 3_600_000)).toBe("2d 16h");
  expect(countdownLabel(4 * 3_600_000 + 12 * 60_000)).toBe("4h 12m");
  expect(countdownLabel(40 * 60_000)).toBe("40m");
  expect(countdownLabel(10)).toBe("1m");
});

test("the home screen counts down at the gate's seam, then hands over to the Reaper's Gate", async ({
  page,
}) => {
  await mockSeasonClock(page, Date.UTC(2026, 9, 18, 7, 30));
  await seedProgress(page);
  await page.goto("/");
  const line = page.getByRole("complementary", { name: "RNGween countdown" });
  await expect(line).toContainText("RNGween starts in 2d 16h");
  await expect(line).toContainText("October 21, 00:00 UTC");
  await expect(page.locator(".rngween-event, .rngween-decor")).toHaveCount(0);
  await line.getByRole("button", { name: "What is coming" }).click();
  await expect(page).toHaveURL(/\/changelog$/);

  // Too early: nothing at all.
  await mockSeasonClock(page, Date.UTC(2026, 9, 12, 12));
  await page.goto("/");
  await expect(page.locator(".rngween-countdown-line")).toHaveCount(0);

  // Open: the gate replaces it.
  await mockSeasonClock(page, Date.UTC(2026, 9, 22, 12));
  await page.goto("/");
  await expect(page.locator(".rngween-countdown-line")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Halloween world entrance" }),
  ).toBeVisible();
});

test("on a phone the countdown's button never hides behind the bottom tab bar", async ({
  page,
}) => {
  await mockSeasonClock(page, Date.UTC(2026, 9, 18, 7, 30));
  await seedProgress(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const line = page.getByRole("complementary", { name: "RNGween countdown" });
  await expect(line).toContainText("RNGween starts in");
  const box = await page.evaluate(() => {
    const button = document
      .querySelector(".rngween-countdown-line")
      .querySelector("button");
    const tab = document.querySelector(".mobile-tabbar");
    const b = button.getBoundingClientRect();
    return {
      bottom: Math.round(b.bottom),
      height: Math.round(b.height),
      tabTop: Math.round(tab.getBoundingClientRect().top),
    };
  });
  // The mark and the text share one row (the wrap budget is 42px), so the
  // button sits above the tab bar instead of sliding under it.
  expect(box.height).toBeGreaterThan(36);
  expect(box.bottom).toBeLessThanOrEqual(box.tabTop);
});
