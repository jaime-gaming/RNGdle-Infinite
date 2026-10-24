import { test, expect } from "@playwright/test";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import {
  emptyProgress,
  applyProgress,
  parseAndRepairProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { RNGWEEN_FINALE_SKIN, rngweenCalendar } from "../src/rngween.js";
import {
  emptyRngweenLimited,
  claimRngweenFinale,
  limitedRewardIds,
  markRngweenFinale,
  parseRngweenLimited,
} from "../src/rngween-limited.js";
import { RNGWEEN_MISSIONS } from "../src/rngween.js";
import { emptyTasks } from "../src/tasks.js";
import { withAllFragments } from "./helpers/world-roll.js";

// Halloween night is one UTC day, and it changes exactly three things:
// a banner on the screen, doubled Pumpkoins, and a skin you keep.
const eve = Date.UTC(2026, 9, 30, 23, 59);
const night = Date.UTC(2026, 9, 31, 12);
const lastMinute = Date.UTC(2026, 9, 31, 23, 59);
const after = Date.UTC(2026, 10, 1, 0, 1);
const account = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  ...patch,
});
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

test("the calendar opens one day, doubles Pumpkoins, and then closes", () => {
  expect(rngweenCalendar(eve).finaleActive).toBe(false);
  expect(rngweenCalendar(eve).pumpkoinMultiplier).toBe(1);
  expect(rngweenCalendar(night).finaleActive).toBe(true);
  expect(rngweenCalendar(night).pumpkoinMultiplier).toBe(2);
  expect(rngweenCalendar(lastMinute).finaleActive).toBe(true);
  expect(rngweenCalendar(after).finaleActive).toBe(false);
  expect(rngweenCalendar(after).pumpkoinMultiplier).toBe(1);
  expect(rngweenCalendar(night).endsAt).toBe(Date.UTC(2026, 10, 1));
});

test("participation is the key to the skin, and only on the night", () => {
  const idle = account({ rngweenLimited: emptyRngweenLimited() });
  expect(() => claimRngweenFinale(idle, night)).toThrow("Take part first");
  expect(() => claimRngweenFinale(idle, eve)).toThrow("Halloween night");

  const took = markRngweenFinale(idle, night);
  expect(took.rngweenLimited.finaleCount).toBe(1);
  // Outside the night nothing is counted, so nothing is earned by accident.
  expect(markRngweenFinale(idle, eve).rngweenLimited.finaleCount).toBe(0);

  const kept = claimRngweenFinale(took, night);
  expect(kept.owned).toContain(RNGWEEN_FINALE_SKIN.id);
  expect(kept.equipped).toBe(RNGWEEN_FINALE_SKIN.id);
  expect(kept.rngweenLimited.finaleEarned).toBe(true);
  expect(kept.history.at(-1).type).toBe("rngween-finale");
  expect(() => claimRngweenFinale(kept, night)).toThrow("already yours");
});

test("the skin survives a repaired save, an older save and retirement", () => {
  const kept = claimRngweenFinale(
    markRngweenFinale(
      account({ rngweenLimited: emptyRngweenLimited() }),
      night,
    ),
    night,
  );
  // An older build that never heard of the finale must not lose the skin.
  const older = parseRngweenLimited({
    ...emptyRngweenLimited(),
    auras: [RNGWEEN_FINALE_SKIN.id],
  });
  expect(older.limited.finaleEarned).toBe(true);
  expect(limitedRewardIds(older.limited)).toContain(RNGWEEN_FINALE_SKIN.id);

  const retired = parseRngweenLimited({
    ...kept.rngweenLimited,
    retired: true,
  });
  expect(retired.limited.finaleEarned).toBe(true);
  expect(parseProgress(JSON.stringify(kept)).owned).toContain(
    RNGWEEN_FINALE_SKIN.id,
  );
  const { repairs } = parseAndRepairProgress(
    JSON.stringify({ ...kept, rngweenLimited: { ...kept.rngweenLimited } }),
  );
  expect(repairs).toEqual([]);
});

test("every mission pays twice for the whole night, and its claim counts as taking part", () => {
  const counts = { rolls: 300, rare: 60, banked: 8000000, taskClaims: 21 };
  const finished = {
    ...emptyTasks(),
    rngween: { id: "rngween-2026", counts, earned: [] },
  };
  const claim = (at) => {
    const before = withAllFragments(account({ tasks: finished }));
    const after = applyProgress(before, {
      type: "claim-rngween-aura",
      id: RNGWEEN_MISSIONS[0].id,
      at,
    });
    return {
      paid: after.rngweenLimited.pumpkoins,
      row: after.history.find((entry) => entry.type === "rngween-mission"),
      took: after.rngweenLimited.finaleCount,
      base: RNGWEEN_MISSIONS[0].pumpkoins,
    };
  };
  const nightPay = claim(night);
  expect(nightPay.paid).toBe(nightPay.base * 2);
  expect(nightPay.row.pumpkoins).toBe(nightPay.base * 2);
  expect(nightPay.row.multiplier).toBe(2);
  expect(nightPay.took).toBe(1);
  const evePay = claim(eve);
  expect(evePay.paid).toBe(evePay.base);
  expect(evePay.row.multiplier).toBeUndefined();
  expect(evePay.took).toBe(0);
});

test("the banner appears only on October 31 and keeps the skin it hands out", async ({
  page,
}) => {
  await mockSeasonClock(page, night);
  await seedProgress(page, {
    rngweenLimited: { ...emptyRngweenLimited(), finaleCount: 1 },
  });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Halloween Event");
  await expect(banner).toContainText("Pumpkoins ×2");
  await expect(banner).toContainText(/0[0-9]:[0-5][0-9]:[0-5][0-9]|1[0-2]:/);

  await banner
    .getByRole("button", { name: `Collect ${RNGWEEN_FINALE_SKIN.name}` })
    .click();
  await expect(banner).toContainText("Lantern kept");
  await expect
    .poll(async () => (await saved(page))?.owned ?? [])
    .toContain(RNGWEEN_FINALE_SKIN.id);
  // Reloading proves the night's skin is in the saved account, not the screen.
  await page.reload();
  await expect(banner).toContainText("Lantern kept");
  await expect
    .poll(async () => (await saved(page))?.rngweenLimited?.finaleEarned)
    .toBe(true);
});

test("no banner before the night, and the hint explains how to earn the skin", async ({
  page,
}) => {
  await mockSeasonClock(page, eve);
  await seedProgress(page);
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "Halloween event" }),
  ).toHaveCount(0);

  await mockSeasonClock(page, night);
  await seedProgress(page, { rngweenLimited: emptyRngweenLimited() });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner).toContainText(
    `Take part tonight for the ${RNGWEEN_FINALE_SKIN.name}`,
  );
  await expect(banner.getByRole("button")).toHaveCount(0);

  await mockSeasonClock(page, after);
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "Halloween event" }),
  ).toHaveCount(0);
});

test("the banner stays out of the way on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSeasonClock(page, night);
  await seedProgress(page, {
    rngweenLimited: { ...emptyRngweenLimited(), finaleCount: 1 },
  });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner).toBeVisible();
  const box = await banner.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeLessThan(80);
  // It pushes the page down instead of covering the header.
  const header = await page.locator(".header").boundingBox();
  expect(header.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
});
