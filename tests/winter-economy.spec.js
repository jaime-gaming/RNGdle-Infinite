import { test, expect, pauseClockAt } from "./helpers/clock.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import {
  parseRngmas,
  WINTER_MARKET,
  RNGMAS_START,
  RNGMAS_END,
  RNGMAS_THEME_START,
  RNGMAS_WEEKS,
  rngmasWeekAt,
} from "../src/rngmas.js";
import { battlePassSeason } from "../src/battle-pass.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import {
  compareSaveRichness,
  saveHasProgress,
  saveProgressScore,
} from "../src/cloud-save.js";
import { waitForApp } from "./helpers/app.js";
import { readSavedProgress } from "./helpers/save.js";

const MARKET = Date.UTC(2026, 11, 8);
const EXCHANGE = Date.UTC(2026, 11, 15);
const fresh = () => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 3000000,
  totalEarned: 3000000,
});

test("all event systems hand over on December 1 UTC", () => {
  expect(RNGMAS_THEME_START).toBe(RNGMAS_START);
  expect(battlePassSeason(RNGMAS_START - 1).name).toBe("First Light");
  expect(battlePassSeason(RNGMAS_START).name).toBe("RNGmas 2026");
  expect(battlePassSeason(RNGMAS_END).active).toBe(false);
});

test("exchange is one-way, integer-only, bounded, persistent and does not count as earned EP", () => {
  let state = fresh();
  for (const amount of [-1, 0, 1.5, 201, Infinity, "10"])
    expect(() =>
      applyProgress(state, { type: "winter-exchange", at: EXCHANGE, amount }),
    ).toThrow();
  expect(() =>
    applyProgress(state, {
      type: "winter-exchange",
      at: EXCHANGE - 1,
      amount: 1,
    }),
  ).toThrow(/closed/);
  state = applyProgress(state, {
    type: "winter-exchange",
    at: EXCHANGE,
    amount: 100,
  });
  expect(state.balance).toBe(2000000);
  expect(state.totalEarned).toBe(3000000);
  expect(state.cycleEarnedEP).toBe(0);
  expect(state.rngmas).toMatchObject({
    snowcoins: 100,
    snowcoinsEarned: 100,
    snowcoinsExchanged: 100,
  });
  state = parseProgress(JSON.stringify(state));
  expect(state.rngmas.snowcoins).toBe(100);
  expect(state.history.at(-1).type).toBe("winter-exchange");
  const claimed = applyProgress(state, {
    type: "claim-winter-week",
    at: EXCHANGE,
  });
  expect(claimed.owned).toContain("rngmas-frost");
  state = applyProgress(state, {
    type: "winter-exchange",
    at: Date.UTC(2026, 11, 26),
    amount: 100,
  });
  expect(() =>
    applyProgress(state, { type: "winter-exchange", at: EXCHANGE, amount: 1 }),
  ).toThrow(/limit/);
  expect(() =>
    applyProgress(state, {
      type: "winter-exchange",
      at: RNGMAS_END,
      amount: 1,
    }),
  ).toThrow(/closed/);
});

test("market uses Snowcoins once per stall, stays open and rewards three distinct purchases", () => {
  let state = fresh();
  state.rngmas.snowcoins = state.rngmas.snowcoinsEarned = 200;
  expect(() =>
    applyProgress(state, {
      type: "winter-market-buy",
      id: WINTER_MARKET[0].id,
      at: MARKET - 1,
    }),
  ).toThrow(/closed/);
  for (const item of WINTER_MARKET.slice(0, 3)) {
    state = applyProgress(state, {
      type: "winter-market-buy",
      id: item.id,
      at: MARKET,
    });
    expect(() =>
      applyProgress(state, {
        type: "winter-market-buy",
        id: item.id,
        at: MARKET,
      }),
    ).toThrow(/already/);
  }
  expect(state.balance).toBe(3000000);
  expect(state.rngmas.snowcoins).toBe(155);
  expect(state.battlePass.boosts.charges["boost-overdrive"]).toBe(1);
  state = parseProgress(JSON.stringify(state));
  expect(state.rngmas.marketPurchases.length).toBe(3);
  const claimed = applyProgress(state, {
    type: "claim-winter-week",
    at: MARKET,
  });
  expect(claimed.owned).toContain("rngmas-ember");
  state = applyProgress(state, {
    type: "winter-market-buy",
    id: WINTER_MARKET[3].id,
    at: EXCHANGE,
  });
  expect(state.battlePass.boosts.charges["boost-surge"]).toBe(4);
  expect(() =>
    applyProgress(state, {
      type: "winter-market-buy",
      id: WINTER_MARKET[4].id,
      at: RNGMAS_END,
    }),
  ).toThrow(/closed/);
  expect(() =>
    applyProgress(fresh(), {
      type: "winter-market-buy",
      id: WINTER_MARKET[0].id,
      at: MARKET,
    }),
  ).toThrow(/Not enough/);
});

test("malformed currency is repaired and legacy cosmetics and activity records are retained", () => {
  const parsed = parseRngmas({
    snowcoins: -1,
    snowcoinsEarned: "200",
    snowcoinsExchanged: Infinity,
    marketPurchases: ["snow-spark", "snow-spark", "bad"],
    golems: { hollow: { damage: 1234, armed: true, strikes: 1 } },
  });
  expect(parsed).toMatchObject({
    snowcoins: 0,
    snowcoinsEarned: 0,
    snowcoinsExchanged: 0,
    marketPurchases: ["snow-spark"],
  });
  expect(parsed.golems.hollow.damage).toBe(1234);
  const state = fresh();
  state.rngmas.snowcoins = state.rngmas.snowcoinsEarned = 12;
  expect(parseProgress(JSON.stringify(state)).rngmas.snowcoins).toBe(12);
});

test("market and exchange work through the saved wallet on a phone", async ({
  page,
}) => {
  const state = fresh();
  state.rngmas.snowcoins = state.rngmas.snowcoinsEarned = 50;
  await seedProgress(page, state);
  await pauseClockAt(page, EXCHANGE + 1000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  await page.getByLabel("Snowcoins to exchange").fill("10");
  await page
    .getByRole("button", { name: "Exchange EP for Snowcoins", exact: true })
    .click();
  await expect
    .poll(async () => (await readSavedProgress(page)).rngmas.snowcoins)
    .toBe(60);
  await page.getByRole("button", { name: /Spark Injector ×1/ }).click();
  await expect
    .poll(async () => (await readSavedProgress(page)).rngmas.snowcoins)
    .toBe(50);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await page.goto("/history");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "Snowcoin exchange", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Christmas market purchase",
      exact: true,
    }),
  ).toBeVisible();
});

test("Cloud reconciliation tracks earned currency and distinct spent receipts, not the decreasing wallet", () => {
  const before = fresh();
  const after = structuredClone(before);
  after.rngmas.snowcoins = after.rngmas.snowcoinsEarned = 50;
  expect(
    saveHasProgress({
      ...emptyProgress(),
      profile: testProfile,
      rngmas: after.rngmas,
    }),
  ).toBe(true);
  expect(compareSaveRichness(after, before)).toBe("local");
  expect(saveProgressScore(after)).toBeGreaterThan(saveProgressScore(before));
  const spent = applyProgress(after, {
    type: "winter-market-buy",
    id: "snow-spark",
    at: MARKET,
  });
  expect(compareSaveRichness(spent, after)).toBe("local");
  const alternate = structuredClone(spent);
  alternate.rngmas.marketPurchases = ["snow-surge"];
  expect(compareSaveRichness(spent, alternate)).toBe("incomparable");
  const other = {
    ...after,
    profile: { ...after.profile, id: "another-profile" },
  };
  expect(compareSaveRichness(spent, other)).toBe("incomparable");
});

test("Fresh Start retains the winter wallet, purchase receipts and legacy chapter records", () => {
  const state = fresh();
  state.ultraRebirths = 3;
  state.rngmas.snowcoins = state.rngmas.snowcoinsEarned = 200;
  state.rngmas.golems.ember.count = 12;
  state.rngmas.golems.frost.defeated = true;
  const purchased = applyProgress(state, {
    type: "winter-market-buy",
    id: "snow-surge",
    at: MARKET,
  });
  const reset = applyProgress(purchased, { type: "fresh-start", at: EXCHANGE });
  expect(reset.rngmas).toEqual(purchased.rngmas);
  const repaired = parseProgress(JSON.stringify(reset));
  expect(repaired.rngmas.golems.ember.count).toBe(12);
  expect(repaired.rngmas.golems.frost.defeated).toBe(true);
  expect(repaired.owned).toContain("rngmas-frost");
  expect(repaired.rngmas.snowcoins).toBe(185);
  expect(() =>
    applyProgress(repaired, {
      type: "winter-market-buy",
      id: "snow-surge",
      at: EXCHANGE,
    }),
  ).toThrow(/already/);
});

test("weekly UTC boundaries are contiguous and final closing disables transactions", () => {
  for (let index = 0; index < RNGMAS_WEEKS.length; index++) {
    const week = RNGMAS_WEEKS[index];
    expect(rngmasWeekAt(week.start)?.id).toBe(week.id);
    expect(rngmasWeekAt(week.end - 1)?.id).toBe(week.id);
    expect(rngmasWeekAt(week.end)?.id ?? null).toBe(
      RNGMAS_WEEKS[index + 1]?.id ?? null,
    );
  }
  expect(rngmasWeekAt(RNGMAS_START - 1)).toBeNull();
});

test("exchange rejects insufficient funds, wallet overflow and invalid transaction times", () => {
  const state = fresh();
  expect(() =>
    applyProgress(
      { ...state, balance: 9999 },
      { type: "winter-exchange", amount: 1, at: EXCHANGE },
    ),
  ).toThrow(/Not enough/);
  state.rngmas.snowcoins = state.rngmas.snowcoinsEarned = 1000000;
  expect(() =>
    applyProgress(state, { type: "winter-exchange", amount: 1, at: EXCHANGE }),
  ).toThrow(/limit/);
  for (const at of [NaN, Infinity, -1, "date"]) {
    expect(() =>
      applyProgress(state, { type: "winter-exchange", amount: 1, at }),
    ).toThrow(/time/);
    expect(() =>
      applyProgress(state, { type: "winter-market-buy", id: "snow-spark", at }),
    ).toThrow(/time/);
  }
  expect(
    parseRngmas({
      snowcoins: 2000000,
      snowcoinsEarned: 3000000,
      snowcoinsExchanged: 999,
    }).snowcoins,
  ).toBe(1000000);
  expect(parseRngmas({ snowcoins: 100, snowcoinsEarned: 10 }).snowcoins).toBe(
    10,
  );
  expect(parseRngmas({ snowcoinsExchanged: 999 }).snowcoinsExchanged).toBe(200);
  expect(parseRngmas(null).snowcoins).toBe(0);
});
