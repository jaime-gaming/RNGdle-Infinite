import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { pauseClockAt } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import fs from "node:fs";
import path from "node:path";
import { CHANGELOG } from "../src/changelog.js";
import { MONTH_THEMES, SEASON_THEME_OVERRIDE } from "../src/season-config.js";
import { badges } from "../src/badges.js";
import {
  allBadgeMetadata,
  infiniteBadges,
  infiniteOriginalRarityForCount,
} from "../src/infinite-badges.js";
import {
  BATTLE_PASS_FIRST_START,
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_SEASON_MS,
  BPEP_PER_LEVEL,
  battlePassSeason,
  emptyBattlePass,
  passSeasonEnd,
  passSeasonIdentity,
  passSeasonName,
  seasonLabel,
  seasonNumber,
} from "../src/battle-pass.js";

const at = Date.UTC(2026, 10, 18, 12);
const emojiMap = JSON.parse(fs.readFileSync("src/emoji-map.json", "utf8"));
const originals = infiniteBadges.filter(
  (badge) => !["INFINITE_PENDULUM", "INFINITE_LAST_SECOND"].includes(badge.id),
);

test("every v0.6 original wears a glyph no other badge uses", () => {
  expect(originals).toHaveLength(7);
  const owners = new Map();
  for (const badge of allBadgeMetadata)
    owners.set(badge.emoji, [...(owners.get(badge.emoji) ?? []), badge.id]);
  for (const badge of originals)
    expect(owners.get(badge.emoji), `${badge.name} owns its glyph`).toEqual([
      badge.id,
    ]);

  // The written catalogue and the scoring metadata must agree, or the shelf
  // would show a different face from the one the roll reveals.
  for (const badge of infiniteBadges) {
    const listed = badges.find((entry) => entry.canonicalId === badge.id);
    expect(listed, `${badge.name} is listed`).toBeTruthy();
    expect(listed.emoji, `${badge.name} matches the shelf`).toBe(badge.emoji);
  }
});

test("Infinite Original rarity follows actual appearance frequency", () => {
  const expected = {
    INFINITE_PENDULUM: "anomaly",
    INFINITE_LAST_SECOND: "anomaly",
    INFINITE_PERFECT_NUMBER: "mythic",
    INFINITE_NARCISSISTIC: "anomaly",
    INFINITE_TRIANGULAR: "rare",
    INFINITE_KAPREKAR: "anomaly",
    INFINITE_AUTOMORPHIC: "mythic",
    INFINITE_FACTORION: "mythic",
    INFINITE_EMIRP: "uncommon",
  };
  for (const badge of infiniteBadges) {
    expect(badge.rarity, badge.name).toBe(expected[badge.id]);
    const listed = badges.find((entry) => entry.canonicalId === badge.id);
    expect(listed.rarity.toLowerCase(), `${badge.name} shelf rarity`).toBe(
      badge.rarity,
    );
    expect(badge.rarity, `${badge.name} uses the frequency rule`).toBe(
      infiniteOriginalRarityForCount(badge.matchingNumbers),
    );
    expect(badge.probabilityPercent).toBeCloseTo(
      (badge.matchingNumbers / 1_000_001) * 100,
      10,
    );
  }

  // More matching rolls can never produce a rarer tier.
  const tiers = ["mythic", "anomaly", "epic", "rare", "uncommon", "common"];
  let previous = -1;
  for (const count of [1, 10, 11, 100, 1_000, 10_000, 100_000, 1_000_001]) {
    const current = tiers.indexOf(infiniteOriginalRarityForCount(count));
    expect(current).toBeGreaterThanOrEqual(previous);
    previous = current;
  }
});

test("the new glyphs have local artwork, not a system fallback", () => {
  for (const badge of originals) {
    const file = emojiMap[badge.emoji];
    expect(file, `vendored ${badge.name}`).toBeTruthy();
    expect(
      fs.existsSync(path.join("public", file.replace(/^\//, ""))),
      `artwork for ${badge.name}`,
    ).toBe(true);
  }
});

test("changelog badge names carry their icon inside the link", async ({
  page,
}) => {
  await page.goto("/changelog");
  await waitForApp(page);

  for (const [version, count] of [
    ["v0.2", 2],
    ["v0.6", 7],
  ]) {
    const entry = page.locator(".changelog-entry", {
      has: page.getByText(version, { exact: true }),
    });
    const links = entry.locator(".changelog-badge-link");
    await expect(links).toHaveCount(count);
    for (let i = 0; i < count; i++)
      await expect(links.nth(i).locator(".emoji img")).toHaveCount(1);
  }

  // The v0.6 note opens the same badge window the v0.2 note does.
  const v06 = page.locator(".changelog-entry", {
    has: page.getByText("v0.6", { exact: true }),
  });
  await v06
    .locator(".changelog-badge-link", { hasText: "Perfect Number" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#modal-title")).toHaveText("Perfect Number");
  await expect(dialog.locator(".emoji img")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the v0.6 note names every original the way v0.2 named its two", () => {
  const v06 = CHANGELOG.find((entry) => entry.version === "v0.6");
  const named = v06.body.filter(
    (line) => line.startsWith("new originals:") || line.startsWith("also new:"),
  );
  expect(named).toHaveLength(2);
  for (const badge of originals) {
    const line = named.find((entry) => entry.includes(badge.name));
    expect(line, `${badge.name} is named`).toBeTruthy();
  }
  expect(v06.badges).toEqual(originals.map((badge) => badge.id));
});

test("the month palette stays valid while only configured seasons are exposed", () => {
  // The config file is the single source of truth: twelve months, all valid.
  expect(MONTH_THEMES).toHaveLength(12);
  expect(SEASON_THEME_OVERRIDE).toBe(null);
  expect(MONTH_THEMES.map((entry) => entry.month)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
  const names = MONTH_THEMES.map((entry) => entry.name);
  expect(new Set(names).size).toBe(names.length);
  for (const entry of MONTH_THEMES) {
    expect(entry.name.length).toBeGreaterThan(3);
    expect(entry.theme.length).toBeGreaterThan(10);
    expect(entry.accent).toMatch(/^#[0-9a-f]{6}$/);
  }

  const first = battlePassSeason(BATTLE_PASS_FIRST_START);
  expect(first.index).toBe(1);
  // Season 1 opens on 18 November 2026, so it wears the November theme.
  expect(first.month).toBe(11);
  expect(first.name).toBe(MONTH_THEMES[10].name);
  expect(first.accent).toBe(MONTH_THEMES[10].accent);
  expect(first.theme).toBe(MONTH_THEMES[10].theme);
  expect(first).not.toHaveProperty("daysLong");
  expect(first).not.toHaveProperty("endsInMs");

  const active = battlePassSeason(BATTLE_PASS_FIRST_START + 1000);
  expect(active.index).toBe(1);
  expect(active.id).toBe("season-1");
  expect(active.name).toBe(MONTH_THEMES[10].name);
  expect(active.name).toBe(passSeasonName(1));
  expect(active).not.toHaveProperty("nextName");
  expect(seasonNumber(active.id)).toBe(1);
  expect(seasonLabel(active.id)).toBe(`Season 1 ${"\u00b7"} ${active.name}`);

  const closed = battlePassSeason(
    BATTLE_PASS_FIRST_START + BATTLE_PASS_SEASON_MS,
  );
  expect(closed.id).toBe("season-1");
  expect(closed.active).toBe(false);
  expect(closed.ended).toBe(true);

  expect(passSeasonIdentity(1).lap).toBe(1);
  expect(passSeasonIdentity(13).lap).toBe(2);
  expect(passSeasonName(0)).toBe(first.name);
  expect(passSeasonName(-4)).toBe(first.name);
  expect(passSeasonName(NaN)).toBe(first.name);
  expect(seasonLabel("")).toBe("Unstarted season");
  expect(seasonLabel("nonsense")).toBe("Unstarted season");
});

test("each Battle Pass season accepts its own scheduled duration", () => {
  const start = Date.UTC(2027, 0, 1);
  const day = 24 * 60 * 60 * 1000;
  expect(passSeasonEnd({ start, end: start + 14 * day })).toBe(
    start + 14 * day,
  );
  expect(passSeasonEnd({ start, durationMs: 42 * day })).toBe(start + 42 * day);
  expect(
    passSeasonEnd(
      { start, end: start + 42 * day },
      { start: start + 21 * day },
    ),
  ).toBe(start + 21 * day);
});

test("First Light is a selectable temporary theme only while the pass is active", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(BATTLE_PASS_FIRST_START - 1));
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "First Light theme", exact: true }),
  ).toHaveCount(0);

  await pauseClockAt(page, new Date(BATTLE_PASS_FIRST_START));
  await page.clock.runFor(30_000);
  const firstLight = page.getByRole("menuitemradio", {
    name: "First Light theme",
    exact: true,
  });
  await expect(firstLight).toBeVisible();
  await expect(page.locator(".appearance-temporary")).toHaveText("TEMPORAL");
  await firstLight.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-pass-theme",
    "first-light-pass",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await pauseClockAt(page, new Date(BATTLE_PASS_FIRST_START - 1));
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("html")).not.toHaveAttribute("data-pass-theme");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "First Light theme", exact: true }),
  ).toHaveCount(0);
});

test("the pass page shows its season name, milestones and past seasons", async ({
  page,
}) => {
  const pass = emptyBattlePass();
  pass.seasonId = battlePassSeason(at).id;
  pass.xp = 12 * BPEP_PER_LEVEL;
  pass.archive = [
    { seasonId: "season-1", xp: 9000, premium: true, claimed: 24 },
    { seasonId: "season-2", xp: 4000, premium: false, claimed: 9 },
  ];
  await seedProgress(page, { battlePass: pass });
  await pauseClockAt(page, new Date(at));
  await page.goto("/pass");
  await waitForApp(page);

  const season = battlePassSeason(at);
  const hero = page.locator(".pass-hero");
  await expect(hero.getByRole("heading", { name: season.name })).toBeVisible();
  await expect(hero).toContainText(season.theme);
  await expect(hero).toContainText(`Season ${season.index}`);
  await expect(hero).not.toContainText("Next season");
  await expect(hero.locator(".pass-hero-next")).toHaveCount(0);

  await expect(page.locator(".pass-level")).toHaveCount(BATTLE_PASS_LEVELS);
  await expect(page.locator(".pass-level.is-milestone")).toHaveCount(3);
  await expect(page.locator(".pass-level.is-next")).toHaveCount(1);
  await expect(page.locator('[data-reward="premium-20"]')).toContainText(
    "Prism Axolotl",
  );
  await expect(page.locator('[data-reward="free-10"]')).toContainText(
    "Signal Flare",
  );

  const archive = page.getByRole("region", { name: "Past seasons" });
  await expect(archive).toContainText("Season 1 · First Light");
  await expect(archive).toContainText("24 rewards claimed");
  await expect(archive.locator("li")).toHaveCount(2);
  await expect(archive.locator(".pass-archive-premium")).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
