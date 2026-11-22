import { test, expect, pauseClockAt } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
} from "../src/progress.js";
import {
  ADVENT_FINALE,
  GOLEM_SMASH_BASE_DAMAGE,
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

test("golem strikes are deterministic and stay inside the multiplier table", () => {
  const multipliers = [1, 2, 3, 5, 10, 25, 50, 100];
  for (let index = 0; index < 40; index += 1) {
    const strike = golemStrikeFor("test-profile:ember", index);
    expect(strike).toEqual(golemStrikeFor("test-profile:ember", index));
    expect(strike.damage).toBe(GOLEM_SMASH_BASE_DAMAGE * strike.multiplier);
    expect(multipliers).toContain(strike.multiplier);
  }
});

test("an open advent door pays its EP exactly once", () => {
  const start = { ...emptyProgress(), profile: testProfile, balance: 0 };
  const claimed = applyProgress(start, {
    type: "claim-advent",
    day: 8,
    at: Date.UTC(2026, 11, 8, 12),
  });
  expect(claimed.balance).toBe(300000);
  expect(claimed.totalEarned).toBe(300000);
  expect(claimed.rngmas.claimed).toEqual([8]);
  expect(claimed.history.at(-1)).toMatchObject({
    type: "advent-claim",
    day: 8,
    ep: 300000,
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

test("golem smash spends EP, carries damage and pays the weekly aura", () => {
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    balance: 5_000_000,
  };
  const week = rngmasWeekAt(SEASON);
  expect(week.id).toBe("ember");
  let strikes = 0;
  while (!state.rngmas.golems.ember.defeated && strikes < 100) {
    const before = state.balance;
    state = applyProgress(state, { type: "golem-smash", at: SEASON });
    expect(state.balance).toBe(before - GOLEM_SMASH_COST);
    strikes += 1;
  }
  expect(state.rngmas.golems.ember.defeated).toBe(true);
  expect(state.rngmas.golems.ember.strikes).toBe(strikes);
  expect(state.rngmas.golems.ember.damage).toBe(week.hp);
  expect(state.owned).toContain("rngmas-ember");
  expect(
    state.history.filter((entry) => entry.type === "golem-reward"),
  ).toEqual([
    expect.objectContaining({
      golemId: "ember",
      productId: "rngmas-ember",
    }),
  ]);
  expect(() =>
    applyProgress(state, { type: "golem-smash", at: SEASON }),
  ).toThrow(/already defeated/);
});

test("golem smash refuses outside the season and without EP", () => {
  const guest = { ...emptyProgress(), profile: testProfile };
  expect(() =>
    applyProgress(guest, { type: "golem-smash", at: BEFORE }),
  ).toThrow(/No golem/);
  expect(() =>
    applyProgress(guest, { type: "golem-smash", at: SEASON }),
  ).toThrow(/Not enough EP/);
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
  await expect(
    page.getByRole("heading", { name: /Ember Golem/ }),
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
    .toBe(300000);
  await expect(door).toBeDisabled();
});

test("golem smash spends EP and moves the golem health bar", async ({
  page,
}) => {
  await seedProgress(page, {
    ...emptyProgress(),
    profile: testProfile,
    balance: 1_000_000,
    totalEarned: 1_000_000,
  });
  await pauseClockAt(page, SEASON);
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  await page.getByRole("button", { name: /Smash for 25,000 EP/ }).click();
  await expect(page.locator(".golem-strike")).toBeVisible();
  const saved = await readSavedProgress(page);
  expect(saved.balance).toBe(1_000_000 - GOLEM_SMASH_COST);
  expect(saved.rngmas.golems.ember.strikes).toBe(1);
  expect(saved.rngmas.golems.ember.damage).toBeGreaterThan(0);
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

test("every week has a golem and a distinct permanent aura", () => {
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

test("every tenth golem strike guarantees at least tenfold damage", () => {
  for (let i = 9; i < 100; i += 10)
    expect(golemStrikeFor("p:frost", i).multiplier).toBeGreaterThanOrEqual(10);
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
