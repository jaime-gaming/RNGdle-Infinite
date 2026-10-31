import { test, expect } from "./helpers/clock.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import {
  reaperAct,
  REAPER_ACT_MS,
  REAPER_SHOW_START,
  REAPER_SHOW_END,
} from "../src/rngween-finale.js";
import {
  applyProgress,
  emptyProgress,
  parsePending,
  PROGRESS_KEY,
} from "../src/progress.js";
import { rollSettings } from "../src/shop-data.js";
import { SKILL_MAX_DRAWS } from "../src/skills.js";
import { runDrawPlan } from "../src/draw-plan.js";

const start = REAPER_SHOW_START;

test("the show runs once at the scheduled UTC time and has six ordered acts", () => {
  expect(start).toBe(Date.UTC(2026, 9, 31, 20));
  expect(REAPER_SHOW_END).toBe(Date.UTC(2026, 9, 31, 20, 30));
  expect(reaperAct(null)).toBeNull();
  expect(reaperAct(start - 1)).toBeNull();
  expect(reaperAct(start).id).toBe("omen");
  expect(reaperAct(start).draws).toBe(2);
  expect(reaperAct(start + REAPER_ACT_MS).draws).toBe(2);
  expect(reaperAct(start + 2 * REAPER_ACT_MS).id).toBe("bloodmoon");
  expect(reaperAct(start + 2 * REAPER_ACT_MS).epMultiplier).toBe(1.5);
  expect(reaperAct(start + 3 * REAPER_ACT_MS).draws).toBe(3);
  expect(reaperAct(start + 4 * REAPER_ACT_MS).id).toBe("reaping");
  expect(reaperAct(start + 4 * REAPER_ACT_MS).epMultiplier).toBe(1.25);
  expect(reaperAct(start + 5 * REAPER_ACT_MS).id).toBe("eclipse");
  expect(reaperAct(start + 5 * REAPER_ACT_MS).epMultiplier).toBe(2);
  expect(reaperAct(REAPER_SHOW_END - 1).endsAt).toBe(REAPER_SHOW_END);
  expect(reaperAct(REAPER_SHOW_END)).toBeNull();
  expect(reaperAct(Date.UTC(2026, 10, 1))).toBeNull();
  expect(reaperAct(start).line).not.toBe(reaperAct(start + 100000).line);
});

test("the Reaper keeps the highest-scoring genuine draw without paying the others", async () => {
  const sequence = [42, 123456, 777777];
  let cursor = 0;
  const picked = await runDrawPlan(
    { attempts: 3 },
    async () => sequence[cursor++],
    async (number) => evaluate(number),
  );
  const best = sequence.reduce((a, b) =>
    evaluate(b).totalEP > evaluate(a).totalEP ? b : a,
  );
  expect(picked.draws).toEqual(sequence);
  expect(picked.result.number).toBe(best);
  expect(cursor).toBe(3);
});

test("committed Reaper rolls survive repair but invalid powers do not", () => {
  const pending = {
    id: "test",
    number: 123,
    startedAt: start,
    ...rollSettings([]),
    draws: [123, 456, 789],
    drawLimit: SKILL_MAX_DRAWS,
    reaperAt: start + REAPER_ACT_MS * 3,
  };
  expect(parsePending(pending, [])).toEqual(pending);
  expect(() => parsePending({ ...pending, reaperAt: start }, [])).toThrow();
  expect(() => parsePending({ ...pending, reaperAt: null }, [])).toThrow();
  expect(() => parsePending({ ...pending, draws: [123, 456] }, [])).toThrow();
  expect(() => parsePending({ ...pending, reaperAt: undefined }, [])).toThrow();
});

test("a committed decree survives reload and pays once even after the show ends", () => {
  const number = 777777;
  const pending = {
    id: "reaper-reward",
    number,
    startedAt: start,
    ...rollSettings([]),
    draws: [42, 123456, number],
    drawLimit: SKILL_MAX_DRAWS,
    reaperAt: start + 5 * REAPER_ACT_MS,
    reaperBonus: 2,
  };
  expect(parsePending(pending, [])).toEqual(pending);
  expect(() => parsePending({ ...pending, reaperBonus: 99 }, [])).toThrow();
  expect(() =>
    parsePending({ ...pending, reaperAt: start + 3 * REAPER_ACT_MS }, []),
  ).toThrow();
  expect(() => parsePending({ ...pending, reaperAt: undefined }, [])).toThrow();
  const result = evaluate(number);
  const state = { ...emptyProgress(), pendingRoll: parsePending(pending, []) };
  const action = {
    type: "complete",
    id: pending.id,
    result,
    cooldownUntil: start + 90000,
    at: REAPER_SHOW_END + 1000,
    rngweenAt: REAPER_SHOW_END + 1000,
  };
  const paid = applyProgress(state, action);
  expect(paid.balance).toBe(result.totalEP * 2);
  expect(
    paid.history.find((row) => row.id === pending.id).walletMultiplier,
  ).toBe(2);
  expect(applyProgress(paid, action).balance).toBe(paid.balance);
  const legacy = { ...pending };
  delete legacy.reaperBonus;
  expect(applyProgress({ ...state, pendingRoll: legacy }, action).balance).toBe(
    result.totalEP,
  );
});

test("the Eclipse takes three real rolls, commits the highest score and survives reload", async ({
  page,
}) => {
  const at = start + 5 * REAPER_ACT_MS;
  await mockSeasonClock(page, at);
  await mockRandom(page, [42, 123456, 777777]);
  await seedProgress(page);
  await page.goto("/");
  const banner = page.getByRole("complementary", { name: "Halloween event" });
  await expect(banner.locator('[data-reaper-act="eclipse"]')).toBeVisible();
  await expect(page.locator(".reaper-atmosphere")).toHaveClass(/is-eclipse/);
  await expect(banner).toContainText("Three fates enter");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  const read = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
  await expect
    .poll(async () => (await read()).pendingRoll?.draws?.length)
    .toBe(3);
  const before = (await read()).pendingRoll;
  expect(before.draws).toEqual([42, 123456, 777777]);
  expect(before.reaperBonus).toBe(2);
  const best = before.draws.reduce((a, b) =>
    evaluate(b).totalEP > evaluate(a).totalEP ? b : a,
  );
  expect(before.number).toBe(best);
  await page.reload();
  await expect.poll(async () => (await read()).pendingRoll?.id).toBe(before.id);
  expect((await read()).pendingRoll.draws).toEqual(before.draws);
  expect((await read()).pendingRoll.reaperBonus).toBe(2);
  await page.clock.runFor(60000);
  await expect
    .poll(
      async () =>
        (await read()).history.filter(
          (item) => item.id === before.id && item.type === "roll",
        ).length,
    )
    .toBe(1);
  expect((await read()).rngweenLimited.finaleCount).toBe(1);
  expect((await read()).balance).toBe(evaluate(before.number).totalEP * 2);
});

test("before the show the clock announces it without activating the takeover", async ({
  page,
}) => {
  await mockSeasonClock(page, start - 60_000);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator('[data-reaper-schedule="upcoming"]')).toContainText(
    "20:00–20:30 UTC",
  );
  await expect(page.locator("[data-reaper-act]")).toHaveCount(0);
  await expect(page.locator(".reaper-atmosphere")).toHaveCount(0);
});

test("the compact transmission opens optional details and respects reduced motion on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSeasonClock(page, start + 3 * REAPER_ACT_MS);
  await seedProgress(page);
  await page.goto("/");
  const transmission = page.locator('[data-reaper-act="soulstorm"]');
  await expect(transmission).toBeVisible();
  await expect(transmission).toContainText("Three fates shall fight");
  const weather = page.locator(".reaper-atmosphere");
  await expect(weather).toHaveClass(/is-soulstorm/);
  await expect(weather).toHaveClass(/is-still/);
  await expect(weather).toHaveCSS("pointer-events", "none");
  await expect(weather.locator(".reaper-atmosphere-fog")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(transmission.locator(".reaper-halo")).toHaveCSS(
    "animation-name",
    "none",
  );
  const box = await transmission.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeLessThan(145);
  await expect(transmission.locator(".reaper-details")).toHaveCount(0);
  await transmission
    .getByRole("button", { name: "Show event details" })
    .click();
  await expect(transmission.locator(".reaper-details")).toContainText(
    "20:00–20:30 UTC",
  );
  await expect(transmission.locator(".reaper-details")).toContainText(
    "Pumpkoins ×2",
  );
  await transmission
    .getByRole("button", { name: "Hide event details" })
    .click();
  await expect(transmission.locator(".reaper-details")).toHaveCount(0);
});

test("after the scheduled show the atmosphere and powers are gone but Halloween remains", async ({
  page,
}) => {
  await mockSeasonClock(page, REAPER_SHOW_END);
  await seedProgress(page);
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "Halloween event" }),
  ).toBeVisible();
  await expect(page.locator('[data-reaper-schedule="ended"]')).toContainText(
    "show is over",
  );
  await expect(page.locator("[data-reaper-act]")).toHaveCount(0);
  await expect(page.locator(".reaper-atmosphere")).toHaveCount(0);
});

for (const [name, at] of [
  ["before", start - 60_000],
  ["after", REAPER_SHOW_END + 60_000],
]) {
  test(`ordinary rolls are not modified ${name} the show`, async ({ page }) => {
    await mockSeasonClock(page, at);
    await mockRandom(page, [42, 123456, 777777]);
    await seedProgress(page);
    await page.goto("/");
    await expect(
      page.getByRole("complementary", { name: "Halloween event" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "GENERATE", exact: true }).click();
    const read = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        PROGRESS_KEY,
      );
    await expect.poll(async () => (await read()).pendingRoll?.number).toBe(42);
    expect((await read()).pendingRoll).not.toHaveProperty("draws");
    expect((await read()).pendingRoll).not.toHaveProperty("reaperAt");
  });
}

test("the announcement becomes the show at the exact start without reloading", async ({
  page,
}) => {
  await mockSeasonClock(page, start - 2000);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator('[data-reaper-schedule="upcoming"]')).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(page.locator('[data-reaper-act="omen"]')).toBeVisible();
  await expect(page.locator("[data-reaper-schedule]")).toHaveCount(0);
});

test("the show ends on schedule without reloading or repeating", async ({
  page,
}) => {
  await mockSeasonClock(page, REAPER_SHOW_END - 2000);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator('[data-reaper-act="eclipse"]')).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(page.locator('[data-reaper-schedule="ended"]')).toBeVisible();
  await expect(page.locator("[data-reaper-act]")).toHaveCount(0);
  await expect(page.locator(".reaper-atmosphere")).toHaveCount(0);
});

for (const [phase, index, multiplier] of [
  ["bloodmoon", 2, 1.5],
  ["reaping", 4, 1.25],
]) {
  test(`${phase} snapshots its own banked EP decree`, () => {
    const number = 777777;
    const result = evaluate(number);
    const pending = {
      id: phase,
      number,
      startedAt: start,
      ...rollSettings([]),
      draws: [42, number],
      drawLimit: SKILL_MAX_DRAWS,
      reaperAt: start + index * REAPER_ACT_MS,
      reaperBonus: multiplier,
    };
    const parsed = parsePending(pending, []);
    const action = {
      type: "complete",
      id: phase,
      result,
      cooldownUntil: start + 90000,
      at: REAPER_SHOW_END,
      rngweenAt: REAPER_SHOW_END,
    };
    const paid = applyProgress(
      { ...emptyProgress(), pendingRoll: parsed },
      action,
    );
    expect(paid.balance).toBe(Math.round(result.totalEP * multiplier));
    expect(paid.history.find((row) => row.id === phase).ep).toBe(
      result.totalEP,
    );
  });
}

test("the Blood Moon displays its decree and chapter progress on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSeasonClock(page, start + 2 * REAPER_ACT_MS + 30000);
  await seedProgress(page);
  await page.goto("/");
  const scene = page.locator('[data-reaper-act="bloodmoon"]');
  await expect(scene).toContainText("The Blood Moon");
  await expect(
    scene.getByLabel("Current decree, ordinary online rolls"),
  ).toContainText("×1.5");
  await expect(
    scene.locator('[data-reaper-art="original-vector"]'),
  ).toBeVisible();
  await expect(scene.locator(".reaper-step")).toHaveCount(6);
  await expect(scene.locator(".reaper-step.is-current")).toHaveCount(1);
  await expect(page.locator(".reaper-atmosphere")).toHaveClass(/is-bloodmoon/);
  await expect(page.locator(".reaper-atmosphere-moon")).toHaveCSS(
    "opacity",
    "0.48",
  );
  await expect(scene.locator(".reaper-halo")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("a new act changes the decree and atmosphere without a reload", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSeasonClock(page, start + 2 * REAPER_ACT_MS - 2000);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator('[data-reaper-act="reckoning"]')).toBeVisible();
  await page.clock.fastForward(3000);
  const scene = page.locator('[data-reaper-act="bloodmoon"]');
  await expect(scene).toBeVisible();
  await expect(
    scene.getByLabel("Current decree, ordinary online rolls"),
  ).toContainText("×1.5");
  await expect(page.locator(".rngween-finale")).toHaveClass(/is-bloodmoon/);
  await expect(page.locator(".reaper-atmosphere")).toHaveClass(/is-bloodmoon/);
});

test("losing website verification pauses the show and restores ordinary rolls", async ({
  page,
}) => {
  const site = await mockSeasonClock(page, start + 2 * REAPER_ACT_MS);
  await mockRandom(page, [42, 123456]);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator('[data-reaper-act="bloodmoon"]')).toBeVisible();

  site.set(null);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(1200);
  await expect(
    page.getByRole("status").filter({ hasText: "website clock" }),
  ).toBeVisible();
  await expect(page.locator("[data-reaper-act]")).toHaveCount(0);
  await expect(page.locator(".reaper-atmosphere")).toHaveCount(0);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  const read = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
  await expect.poll(async () => (await read()).pendingRoll?.number).toBe(42);
  expect((await read()).pendingRoll).not.toHaveProperty("reaperAt");
  expect((await read()).pendingRoll).not.toHaveProperty("reaperBonus");

  site.set(start + 2 * REAPER_ACT_MS);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(1200);
  await expect(page.locator('[data-reaper-act="bloodmoon"]')).toBeVisible();
});

test("an older verification cannot overwrite a newer website clock after resume", async ({
  page,
}) => {
  await mockSeasonClock(page, start);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator('[data-reaper-act="omen"]')).toBeVisible();
  let releaseOld, signalOld;
  const oldRequested = new Promise((resolve) => {
    signalOld = resolve;
  });
  const oldBlocked = new Promise((resolve) => {
    releaseOld = resolve;
  });
  let calls = 0;
  await page.route("**/favicon.svg?season-clock=*", async (route) => {
    calls++;
    if (calls === 1) {
      signalOld();
      await oldBlocked;
      await route.fulfill({
        status: 200,
        headers: { date: new Date(start + 5 * REAPER_ACT_MS).toUTCString() },
        body: "",
      });
    } else {
      await route.fulfill({
        status: 200,
        headers: { date: new Date(start + REAPER_ACT_MS).toUTCString() },
        body: "",
      });
    }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await oldRequested;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
  await page.clock.runFor(1200);
  await expect(page.locator('[data-reaper-act="reckoning"]')).toBeVisible();
  releaseOld();
  await page.clock.runFor(1200);
  await expect(page.locator('[data-reaper-act="reckoning"]')).toBeVisible();
  await expect(page.locator('[data-reaper-act="eclipse"]')).toHaveCount(0);
});

for (const timezoneId of [
  "Europe/Madrid",
  "America/Los_Angeles",
  "Asia/Tokyo",
]) {
  test.describe(`the show in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("uses the same verified UTC time even with the wrong device date", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2035-04-01T00:00:00Z"));
      await mockSeasonClock(page, start + 2 * REAPER_ACT_MS);
      await seedProgress(page);
      await page.goto("/");
      const show = page.locator('[data-reaper-act="bloodmoon"]');
      await expect(show).toBeVisible();
      await show.getByRole("button", { name: "Show event details" }).click();
      await expect(show).toContainText("20:00–20:30 UTC");
      await expect(
        show.getByLabel("Current decree, ordinary online rolls"),
      ).toContainText("×1.5");
    });
  });
}

test("the countdown keeps showing one second until the event actually starts", async ({
  page,
}) => {
  await mockSeasonClock(page, start - 2000);
  await seedProgress(page);
  await page.goto("/");
  const timer = page.locator(".reaper-schedule-countdown");
  await expect(timer).toBeVisible();
  await page.clock.fastForward(1500);
  await expect(timer).toContainText("00:00:01");
  await expect(page.locator("[data-reaper-act]")).toHaveCount(0);
  await page.clock.fastForward(1000);
  await expect(page.locator('[data-reaper-act="omen"]')).toBeVisible();
});
