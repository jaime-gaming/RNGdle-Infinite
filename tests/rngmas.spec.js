import { evaluate } from "./helpers/index.js";
import { test, expect, pauseClockAt } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
} from "../src/progress.js";
import {
  ADVENT_FINALE,
  recordWinterRoll,
  GOLEM_SMASH_COST,
  RNGMAS_WEEKS,
  adventDoorAt,
  adventFinaleAt,
  golemStrikeFor,
  parseRngmas,
  rngmasStatus,
  rngmasWeekAt,
} from "../src/rngmas.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { readSavedProgress } from "./helpers/save.js";

const BEFORE = Date.UTC(2026, 10, 20, 12);
const SEASON = Date.UTC(2026, 11, 10, 12);
const CHRISTMAS = Date.UTC(2026, 11, 25, 12);
const AFTER = Date.UTC(2027, 0, 3, 12);

test("RNGmas opens on December 1 and closes on January 2", () => {
  expect(rngmasStatus(BEFORE)).toMatchObject({
    active: false,
    upcoming: true,
    over: false,
    shown: true,
  });
  expect(rngmasStatus(SEASON)).toMatchObject({
    active: true,
    upcoming: false,
    over: false,
    shown: true,
  });
  expect(rngmasStatus(AFTER)).toMatchObject({
    active: false,
    upcoming: false,
    over: true,
    shown: false,
  });
  expect(rngmasStatus(Date.UTC(2026, 1, 15)).shown).toBe(false);
  expect(rngmasWeekAt(SEASON)?.id).toBe("ember");
  expect(rngmasWeekAt(BEFORE)).toBeNull();
  expect(rngmasWeekAt(AFTER)).toBeNull();
});

test("a door is only claimable on its UTC day", () => {
  expect(adventDoorAt(8, SEASON).openNow).toBe(false);
  expect(adventDoorAt(7, SEASON).openNow).toBe(false);
  expect(adventDoorAt(10, SEASON).openNow).toBe(true);
  expect(adventDoorAt(11, SEASON).openNow).toBe(false);
  expect(adventDoorAt(8, Date.UTC(2026, 11, 8, 0)).openNow).toBe(true);
  expect(adventDoorAt(8, Date.UTC(2026, 11, 11, 0)).openNow).toBe(false);
  expect(adventDoorAt(8, AFTER).missed).toBe(true);
});

test("the Christmas star is only claimable on December 25", () => {
  expect(adventFinaleAt(Date.UTC(2026, 11, 24, 23)).openNow).toBe(false);
  expect(adventFinaleAt(CHRISTMAS).openNow).toBe(true);
  expect(adventFinaleAt(Date.UTC(2027, 0, 1, 23)).openNow).toBe(false);
  expect(adventFinaleAt(AFTER).openNow).toBe(false);
});

test("golem damage is the actual rolled number with no multiplier", () => {
  for (const n of [0, 1, 500000, 1000000])
    expect(golemStrikeFor(n).damage).toBe(n);
  expect(() => golemStrikeFor(-1)).toThrow();
});

test("an open advent door pays its EP exactly once", () => {
  const start = { ...emptyProgress(), profile: testProfile, balance: 0 };
  const claimed = applyProgress(start, {
    type: "claim-advent",
    day: 8,
    at: Date.UTC(2026, 11, 8, 12),
  });
  expect(claimed.balance).toBe(30000);
  expect(claimed.totalEarned).toBe(30000);
  expect(claimed.rngmas.claimed).toEqual([8]);
  expect(claimed.history.at(-1)).toMatchObject({
    type: "advent-claim",
    day: 8,
    ep: 30000,
  });
  expect(() =>
    applyProgress(claimed, {
      type: "claim-advent",
      day: 8,
      at: Date.UTC(2026, 11, 8, 12),
    }),
  ).toThrow(/already opened/);
});

test("a missed door and the Christmas star refuse to open early", () => {
  const start = { ...emptyProgress(), profile: testProfile };
  expect(() =>
    applyProgress(start, { type: "claim-advent", day: 7, at: SEASON }),
  ).toThrow(/not open/);
  expect(() =>
    applyProgress(start, {
      type: "claim-advent",
      day: ADVENT_FINALE.day,
      at: SEASON,
    }),
  ).toThrow(/not open/);

  const star = applyProgress(start, {
    type: "claim-advent",
    day: ADVENT_FINALE.day,
    at: CHRISTMAS,
  });
  expect(star.rngmas.finale).toBe(true);
  expect(star.owned).toContain("rngmas-star");
  expect(star.history.at(-1)).toMatchObject({
    type: "advent-claim",
    day: 25,
    productId: "rngmas-star",
  });
});

test("the last advent door pays the Gingerbread aura", () => {
  const start = { ...emptyProgress(), profile: testProfile };
  const claimed = applyProgress(start, {
    type: "claim-advent",
    day: 24,
    at: Date.UTC(2026, 11, 24, 12),
  });
  expect(claimed.rngmas.claimed).toEqual([24]);
  expect(claimed.owned).toContain("rngmas-gingerbread");
});

const GOLEM_AT = Date.UTC(2026, 11, 2, 12);
const completeNumber = (state, number, id, source) =>
  applyProgress(state, {
    type: "complete",
    id,
    at: GOLEM_AT,
    cooldownUntil: GOLEM_AT + 1000,
    result: evaluate(number),
    ...(source ? { source } : {}),
  });

test("a paid strike uses one real online result and survives save/reload", () => {
  let state = { ...emptyProgress(), profile: testProfile, balance: 6000000 };
  state = applyProgress(state, { type: "golem-smash", at: GOLEM_AT });
  expect(state.balance).toBe(5900000);
  expect(state.rngmas.golems.hollow.armed).toBe(true);
  expect(() =>
    applyProgress(state, { type: "golem-smash", at: GOLEM_AT }),
  ).toThrow(/prepared/);
  state = parseProgress(JSON.stringify(state));
  state = completeNumber(state, 604827, "winter-one");
  expect(state.rngmas.golems.hollow.damage).toBe(604827);
  expect(state.rngmas.golems.hollow.armed).toBe(false);
  expect(completeNumber(state, 604827, "winter-one")).toEqual(state);
  expect(
    completeNumber(state, 900000, "winter-two").rngmas.golems.hollow.damage,
  ).toBe(604827);
});

test("zero damage still consumes the prepared strike and offline rolls do not", () => {
  let state = { ...emptyProgress(), profile: testProfile, balance: 1000000 };
  state = applyProgress(state, { type: "golem-smash", at: GOLEM_AT });
  const offline = completeNumber(state, 1000000, "offline-one", "offline");
  expect(offline.rngmas.golems.hollow.armed).toBe(true);
  const zero = completeNumber(offline, 0, "zero");
  expect(zero.rngmas.golems.hollow).toMatchObject({
    damage: 0,
    armed: false,
    strikes: 1,
    lastNumber: 0,
  });
});

test("weekly activities differ, require completion and pay rewards once", () => {
  expect(new Set(RNGMAS_WEEKS.map((w) => w.metric)).size).toBe(5);
  for (const week of RNGMAS_WEEKS) {
    let state = { ...emptyProgress(), profile: testProfile };
    expect(() =>
      applyProgress(state, { type: "claim-winter-week", at: week.start }),
    ).toThrow(/Complete/);
    state.rngmas.golems[week.id] = {
      ...state.rngmas.golems[week.id],
      count: week.goal,
      damage: week.hp,
    };
    if (week.metric === "purchases")
      state.rngmas.marketPurchases = [
        "snow-spark",
        "snow-surge",
        "snow-overdrive",
      ];
    if (week.metric === "exchanged") state.rngmas.snowcoinsExchanged = 100;
    const claimed = applyProgress(state, {
      type: "claim-winter-week",
      at: week.start,
    });
    expect(claimed.owned).toContain(week.reward);
    expect(claimed.balance).toBe(week.ep);
    expect(claimed.battlePass.boosts.charges[week.boost]).toBe(week.charges);
    expect(claimed.rngmas.snowcoins).toBe(week.coins);
    expect(() =>
      applyProgress(claimed, { type: "claim-winter-week", at: week.start }),
    ).toThrow(/already/);
  }
});

test("weekly tally rules keep transaction progress separate from normal rolls", () => {
  const record = emptyProgress().rngmas;
  expect(
    recordWinterRoll(record, { number: 1234 }, SEASON).golems.ember.count,
  ).toBe(0);
  expect(
    recordWinterRoll(record, { number: 1235 }, Date.UTC(2026, 11, 17)).golems
      .frost.count,
  ).toBe(0);
  expect(
    recordWinterRoll(record, { number: 1204 }, Date.UTC(2026, 11, 24)).golems
      .golem.count,
  ).toBe(1);
  expect(
    recordWinterRoll(record, { number: 1204 }, Date.UTC(2026, 11, 24))
      .snowcoins,
  ).toBe(1);
});

test("golem preparations refuse wrong weeks, insufficient EP and a pending roll", () => {
  const state = { ...emptyProgress(), profile: testProfile };
  expect(() =>
    applyProgress(state, { type: "golem-smash", at: BEFORE }),
  ).toThrow(/No winter/);
  expect(() =>
    applyProgress(state, { type: "golem-smash", at: SEASON }),
  ).toThrow(/not open/);
  expect(() =>
    applyProgress(state, { type: "golem-smash", at: GOLEM_AT }),
  ).toThrow(/Not enough/);
  expect(() =>
    applyProgress(
      { ...state, balance: 200000, pendingRoll: { id: "x" } },
      { type: "golem-smash", at: GOLEM_AT },
    ),
  ).toThrow(/current roll/);
});

test("the RNGmas record repairs junk", () => {
  const junk = parseRngmas({
    claimed: [999, "8", 8, 8],
    finale: "yes",
    golems: {
      ember: { damage: -5, strikes: "x", defeated: "yes" },
    },
  });
  expect(junk.claimed).toEqual([8]);
  expect(junk.finale).toBe(false);
  expect(junk.golems.ember).toEqual({
    damage: 0,
    strikes: 0,
    count: 0,
    armed: false,
    lastNumber: null,
    defeated: false,
  });
});

test("a saved RNGmas record keeps its doors, star and golems", () => {
  const empty = parseRngmas(null);
  const raw = {
    ...emptyProgress(),
    profile: testProfile,
    owned: [],
    rngmas: {
      id: "rngmas-2026",
      claimed: [1, 2, 3],
      finale: true,
      golems: {
        ...empty.golems,
        ember: { damage: 1_500_000, strikes: 25, defeated: true },
      },
    },
  };
  const parsed = parseProgress(JSON.stringify(raw));
  expect(parsed.rngmas.claimed).toEqual([1, 2, 3]);
  expect(parsed.rngmas.finale).toBe(true);
  expect(parsed.rngmas.golems.ember.defeated).toBe(true);
  expect(parsed.owned).toEqual(
    expect.arrayContaining(["rngmas-star", "rngmas-ember"]),
  );
});

test("the shop grows an RNGmas door during the season", async ({ page }) => {
  await seedProgress(page, {
    ...emptyProgress(),
    profile: testProfile,
    balance: 1_000_000,
    totalEarned: 1_000_000,
  });
  await pauseClockAt(page, SEASON);
  await page.goto("/shop");
  await waitForApp(page);
  await expect(page.getByTestId("rngmas-event-button")).toBeVisible();
  await expect(page.locator('[data-shelf="rngmas"]')).toBeVisible();
  await page.locator('[data-shelf="rngmas"]').click();
  await expect(page).toHaveURL(/\/shop\/rngmas$/);
  await expect(page.locator("#shop-rngmas")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Advent calendar/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Winter trail", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Weekly winter activity" })
      .getByRole("heading", { name: "Christmas market", exact: true }),
  ).toBeVisible();
});

test("an open advent door pays EP from the calendar", async ({ page }) => {
  await seedProgress(page, {
    ...emptyProgress(),
    profile: testProfile,
    balance: 0,
    totalEarned: 0,
  });
  await pauseClockAt(page, Date.UTC(2026, 11, 8, 12));
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  const door = page.getByRole("button", { name: /Advent door 8/ });
  await expect(door).toBeEnabled();
  await door.click();
  await expect
    .poll(async () => (await readSavedProgress(page)).balance)
    .toBe(30000);
  await expect(door).toBeDisabled();
});

test("the golem preparation is saved without inventing damage", async ({
  page,
}) => {
  await seedProgress(page, {
    ...emptyProgress(),
    profile: testProfile,
    balance: 1000000,
    totalEarned: 1000000,
  });
  await pauseClockAt(page, GOLEM_AT);
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  await page.getByRole("button", { name: "Winter trail", exact: true }).click();
  await page.getByRole("button", { name: /Prepare strike/ }).click();
  await expect(page.getByText(/Strike prepared\./).first()).toBeVisible();
  const saved = await readSavedProgress(page);
  expect(saved.balance).toBe(900000);
  expect(saved.rngmas.golems.hollow).toMatchObject({
    armed: true,
    damage: 0,
    strikes: 0,
  });
});

test("before the season the shop only teases RNGmas", async ({ page }) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, BEFORE);
  await page.goto("/shop");
  await waitForApp(page);
  await expect(page.getByTestId("rngmas-event-button")).toContainText(
    "starts in",
  );
  await expect(page.locator('[data-shelf="rngmas"]')).toContainText("Dec 1");
  await page.goto("/shop/rngmas");
  await expect(page.locator("#shop-rngmas")).toBeVisible();
  const doors = page.getByRole("button", { name: /Advent door/ });
  await expect(doors).toHaveCount(24);
  await expect
    .poll(() =>
      doors.evaluateAll((entries) => entries.every((door) => door.disabled)),
    )
    .toBe(true);
});

test("after the season the shop shows no RNGmas", async ({ page }) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, AFTER);
  await page.goto("/shop");
  await waitForApp(page);
  await expect(page.getByTestId("rngmas-event-button")).toHaveCount(0);
  await expect(page.locator('[data-shelf="rngmas"]')).toHaveCount(0);
});

test("the winter theme appears in the Appearance menu during the season", async ({
  page,
}) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, Date.UTC(2026, 11, 16, 12));
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  const frost = page.getByRole("menuitemradio", { name: /Frostfall theme/ });
  await expect(frost).toBeVisible();
  await expect(
    page.getByRole("menuitemradio", { name: /Lights theme/ }),
  ).toHaveCount(0);
  await frost.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-rngmas-theme",
    "rngmas-frost",
  );
});

test("the season brings a snow decoration layer behind the page", async ({
  page,
}) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, SEASON);
  await page.goto("/");
  await waitForApp(page);
  const decor = page.locator(".rngmas-decor");
  await expect(decor).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngmas");
  await expect(decor).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".rngmas-snowfield i")).toHaveCount(22);
  await expect(page.locator(".rngmas-snowbank")).toHaveCount(2);
  const style = await decor.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      pointerEvents: computed.pointerEvents,
      position: computed.position,
      zIndex: computed.zIndex,
    };
  });
  expect(style).toEqual({
    pointerEvents: "none",
    position: "fixed",
    zIndex: "-1",
  });
});

test("the snow decoration honours reduced motion and leaves after the season", async ({
  page,
}) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, SEASON);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForApp(page);
  await expect(page.locator(".rngmas-decor")).toHaveClass(/is-reduced-motion/);
  const animated = await page
    .locator(".rngmas-snowfield i")
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animated).toBe("none");

  await pauseClockAt(page, AFTER);
  await page.goto("/shop");
  await waitForApp(page);
  await expect(page.locator(".rngmas-decor")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-season");
});

test("a winter aura draws the shared ornament layer", async ({ page }) => {
  await seedProgress(page, {
    ...emptyProgress(),
    profile: testProfile,
    balance: 4_000_000,
    totalEarned: 4_000_000,
    owned: ["rngmas-star"],
  });
  await pauseClockAt(page, SEASON);
  await page.goto("/shop/auras/rngmas");
  await waitForApp(page);
  const aura = page.locator(".rngmas-aura").first();
  await expect(aura).toBeVisible();
  await expect(aura).toHaveClass(/aura-winter/);
  await expect(aura.locator(".aura-seal")).toHaveCount(1);
  await expect(aura.locator(".aura-crest")).toHaveCount(1);
  await expect(aura.locator(".aura-guardian")).toHaveCount(2);
  await expect(aura.locator(".aura-motes i")).toHaveCount(8);
});

test("every chapter has a distinct activity and permanent aura", () => {
  const rewards = new Set();
  for (const week of RNGMAS_WEEKS) {
    expect(week.hp).toBeGreaterThan(0);
    expect(week.start).toBeLessThan(week.end);
    expect(week.reward).toMatch(/^rngmas-/);
    rewards.add(week.reward);
  }
  expect(rewards.size).toBe(RNGMAS_WEEKS.length);
});

test("Christmas mode defaults defensively and preserves explicit opt-out", async () => {
  const { parseSettings } = await import("../src/settings.js");
  expect(parseSettings(null).christmasMode).toBe(true);
  expect(parseSettings('{"christmasMode":"false"}').christmasMode).toBe(true);
  expect(parseSettings('{"christmasMode":false}').christmasMode).toBe(false);
});

test("Frostfall starts at the First Light handover and expires with RNGmas", async () => {
  const { rngmasThemeActive, RNGMAS_THEME_START, RNGMAS_END } =
    await import("../src/rngmas.js");
  const { seasonEndFor, battlePassSeason } =
    await import("../src/battle-pass.js");
  expect(RNGMAS_THEME_START).toBe(seasonEndFor(1));
  expect(rngmasThemeActive(RNGMAS_THEME_START - 1)).toBe(false);
  expect(rngmasThemeActive(RNGMAS_THEME_START)).toBe(true);
  expect(rngmasThemeActive(RNGMAS_END - 1)).toBe(true);
  expect(rngmasThemeActive(RNGMAS_END)).toBe(false);
  expect(battlePassSeason(RNGMAS_THEME_START).name).toBe("RNGmas 2026");
  expect(battlePassSeason(RNGMAS_END).active).toBe(false);
});

test("Christmas mode can be toggled from Themes and survives reload", async ({
  page,
}) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, SEASON);
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "christmas mode" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(page.locator(".rngmas-decor")).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("new activity save fields repair malformed input without losing receipts", () => {
  const parsed = parseRngmas({
    claimed: [1],
    golems: {
      hollow: { count: -1, armed: "yes", lastNumber: 1000001 },
      ember: { count: Infinity, armed: true },
    },
  });
  expect(parsed.claimed).toEqual([1]);
  expect(parsed.golems.hollow).toMatchObject({
    count: 0,
    armed: false,
    lastNumber: null,
  });
  expect(parsed.golems.ember).toMatchObject({ count: 0, armed: false });
});

test("Snowcoins settle once per online roll and exclude skill extras and offline", () => {
  const at = Date.UTC(2026, 11, 2, 12);
  let state = { ...emptyProgress(), profile: testProfile };
  const action = {
    type: "complete",
    id: "snow-roll",
    at,
    cooldownUntil: at + 1000,
    result: evaluate(1234),
    extras: [{ result: evaluate(2468) }],
  };
  state = applyProgress(state, action);
  expect(state.rngmas.snowcoins).toBe(1);
  expect(applyProgress(state, action).rngmas.snowcoins).toBe(1);
  expect(
    applyProgress(state, { ...action, id: "offline", source: "offline" }).rngmas
      .snowcoins,
  ).toBe(1);
});

test("weekly rewards expire at the UTC boundary and do not fund cycle gates", () => {
  const state = { ...emptyProgress(), profile: testProfile };
  state.rngmas.golems.hollow.damage = 25000000;
  const claimed = applyProgress(state, {
    type: "claim-winter-week",
    at: Date.UTC(2026, 11, 7, 23, 59, 59),
  });
  expect(claimed.cycleEarnedEP).toBe(state.cycleEarnedEP);
  expect(() =>
    applyProgress(state, {
      type: "claim-winter-week",
      at: Date.UTC(2026, 11, 8),
    }),
  ).toThrow(/Complete/);
});

test("finishing the golem remains claimable after reload and delivers the boost", () => {
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    balance: 1000000,
    totalEarned: 1000000,
  };
  state.rngmas.golems.hollow.damage = 24999999;
  state = applyProgress(state, { type: "golem-smash", at: GOLEM_AT });
  state = completeNumber(state, 999999, "finishing-strike");
  state = parseProgress(JSON.stringify(state));
  expect(state.rngmas.golems.hollow.damage).toBe(25000000);
  expect(state.rngmas.golems.hollow.defeated).toBe(false);
  const claimed = applyProgress(state, {
    type: "claim-winter-week",
    at: GOLEM_AT,
  });
  expect(claimed.owned).toContain("rngmas-hollow");
  expect(claimed.battlePass.boosts.charges["boost-overdrive"]).toBe(2);
  expect(claimed.rngmas.snowcoins).toBe(state.rngmas.snowcoins + 50);
  expect(
    parseProgress(JSON.stringify(claimed)).rngmas.golems.hollow.defeated,
  ).toBe(true);
});
