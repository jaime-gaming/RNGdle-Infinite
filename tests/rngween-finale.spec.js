import { test, expect } from "@playwright/test";
import { pauseClockAt } from "./helpers/clock.js";
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
const eclipse = Date.UTC(2026, 9, 31, 20, 25);
const eclipseEnd = Date.UTC(2026, 9, 31, 20, 30);
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

test("the gift is limited to the exact Eclipse and needs a profile, not participation", () => {
  const idle = account({ rngweenLimited: emptyRngweenLimited() });
  for (const at of [eve, night, eclipse - 1, eclipseEnd, lastMinute, after])
    expect(() => claimRngweenFinale(idle, at)).toThrow("Final Eclipse");
  expect(() => claimRngweenFinale(emptyProgress(), eclipse)).toThrow("profile");
  expect(markRngweenFinale(idle, night).rngweenLimited.finaleCount).toBe(1);
  expect(markRngweenFinale(idle, eve).rngweenLimited.finaleCount).toBe(0);

  for (const at of [eclipse, eclipseEnd - 1]) {
    const kept = claimRngweenFinale(idle, at);
    expect(kept.owned).toContain(RNGWEEN_FINALE_SKIN.id);
    expect(kept.equipped).toBe(RNGWEEN_FINALE_SKIN.id);
    expect(kept.rngweenLimited.finaleEarned).toBe(true);
    expect(kept.rngweenLimited.finaleCount).toBe(0);
    expect(kept.history.at(-1).type).toBe("rngween-finale");
    expect(() => claimRngweenFinale(kept, at)).toThrow("already yours");
  }
});

test("the skin survives a repaired save, an older save and retirement", () => {
  const kept = claimRngweenFinale(
    markRngweenFinale(
      account({ rngweenLimited: emptyRngweenLimited() }),
      night,
    ),
    eclipse,
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

test("a profile receives the lantern automatically during Eclipse and keeps it on reload", async ({
  page,
}) => {
  await mockSeasonClock(page, eclipse);
  await seedProgress(page, { rngweenLimited: emptyRngweenLimited() });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner.locator('[data-reaper-act="eclipse"]')).toBeVisible();
  await expect(banner).toContainText("Hollow Lantern unlocked");
  await expect
    .poll(async () => (await saved(page))?.owned ?? [])
    .toContain(RNGWEEN_FINALE_SKIN.id);
  await page.reload();
  await expect(banner).toContainText("Hollow Lantern unlocked");
  expect(
    (await saved(page)).history.filter(
      (entry) => entry.type === "rngween-finale",
    ),
  ).toHaveLength(1);
});

for (const [name, at] of [
  ["before Eclipse", eclipse - 60_000],
  ["after Eclipse", eclipseEnd],
]) {
  test(`the lantern is not delivered ${name}`, async ({ page }) => {
    await mockSeasonClock(page, at);
    await seedProgress(page, {
      rngweenLimited: { ...emptyRngweenLimited(), finaleCount: 1 },
    });
    await page.goto("/");
    await expect(
      page.getByRole("complementary", { name: "Halloween event" }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    expect((await saved(page)).owned).not.toContain(RNGWEEN_FINALE_SKIN.id);
  });
}

test("the gift arrives when Eclipse starts without reloading", async ({
  page,
}) => {
  const site = await mockSeasonClock(page, eclipse - 2000);
  await seedProgress(page, { rngweenLimited: emptyRngweenLimited() });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner.locator('[data-reaper-act="reaping"]')).toBeVisible();
  expect((await saved(page)).owned).not.toContain(RNGWEEN_FINALE_SKIN.id);
  site.set(eclipse);
  await page.clock.fastForward(3000);
  await expect(banner.locator('[data-reaper-act="eclipse"]')).toBeVisible();
  await expect(banner).toContainText("Hollow Lantern unlocked");
});

test("the gift waits for a verified website clock", async ({ page }) => {
  const site = await mockSeasonClock(page, null);
  await seedProgress(page, { rngweenLimited: emptyRngweenLimited() });
  await page.goto("/");
  await page.waitForTimeout(500);
  expect((await saved(page)).owned).not.toContain(RNGWEEN_FINALE_SKIN.id);
  site.set(eclipse);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("complementary", { name: "Halloween event" }),
  ).toContainText("Hollow Lantern unlocked");
});

test("guests are invited to create a profile during Eclipse", async ({
  page,
}) => {
  await mockSeasonClock(page, eclipse);
  await seedProgress(page, { profile: null });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner).toContainText(
    "Create a profile to keep the Hollow Lantern",
  );
  await banner.getByRole("button", { name: "Create profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Start saving your progress" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Username" }).fill("EclipseVisitor");
  await page.getByRole("button", { name: "Start saving my progress" }).click();
  await expect(banner).toContainText("Hollow Lantern unlocked");
  await expect
    .poll(async () => (await saved(page))?.owned ?? [])
    .toContain(RNGWEEN_FINALE_SKIN.id);
});

test("a failed save can be retried during Eclipse", async ({ page }) => {
  await mockSeasonClock(page, eclipse);
  await seedProgress(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner).toContainText("Web Locks");
  expect((await saved(page)).owned).not.toContain(RNGWEEN_FINALE_SKIN.id);
  await page.evaluate(() => delete navigator.locks);
  await banner.getByRole("button", { name: "Retry" }).click();
  await expect(banner).toContainText("Hollow Lantern unlocked");
});

test("the banner appears only on October 31", async ({ page }) => {
  const site = await mockSeasonClock(page, eve);
  await seedProgress(page);
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "Halloween event" }),
  ).toHaveCount(0);
  site.set(night);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner).toContainText("Pumpkoins ×2");
  await expect(banner).toContainText("20:00–20:30 UTC");
  site.set(after);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(banner).toHaveCount(0);
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

// The strip is a clock, so its seconds have to move with the verified date the
// rest of the event uses — not with the half-minute page render.
test("the Halloween strip counts down every second and leaves at midnight", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(Date.UTC(2026, 9, 31, 23, 59, 54)));
  await mockSeasonClock(page, Date.UTC(2026, 9, 31, 23, 59, 54));
  await seedProgress(page, {
    rngweenLimited: { ...emptyRngweenLimited(), finaleCount: 1 },
  });
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  const read = async () =>
    (await banner.locator(".reaper-schedule-countdown").innerText()).trim();
  await expect(banner).toBeVisible();
  const first = await read();
  expect(first).toMatch(/^HALLOWEEN ENDS 00:00:0[3-6]$/);
  await page.clock.runFor(2000);
  const second = await read();
  expect(second).not.toBe(first);
  // 23:59:54 -> 00:00:00: the night is over and the strip goes away.
  await page.clock.runFor(6000);
  await expect(banner).toHaveCount(0);
});
