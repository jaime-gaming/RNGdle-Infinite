import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { pauseClockAt } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import fs from "node:fs";
import path from "node:path";
import { CHANGELOG } from "../src/changelog.js";
import { MONTH_THEMES, SEASON_THEME_OVERRIDE } from "../src/season-config.js";
import { badges } from "../src/badges.js";
import { allBadgeMetadata, infiniteBadges } from "../src/infinite-badges.js";
import {
  BATTLE_PASS_FIRST_START,
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_SEASON_MS,
  BPEP_PER_LEVEL,
  battlePassSeason,
  emptyBattlePass,
  passSeasonIdentity,
  passSeasonName,
  seasonLabel,
  seasonNumber,
} from "../src/battle-pass.js";

const at = Date.UTC(2026, 10, 17, 12);
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
    expect(line).toContain(`${badge.name} (${badge.rarity})`);
  }
  expect(v06.badges).toEqual(originals.map((badge) => badge.id));
});

test("every season wears the theme of the month it opens in", () => {
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
  // Season 1 opens on 16 November 2026, so it wears the November theme.
  expect(first.month).toBe(11);
  expect(first.name).toBe(MONTH_THEMES[10].name);
  expect(first.accent).toBe(MONTH_THEMES[10].accent);
  expect(first.theme).toBe(MONTH_THEMES[10].theme);
  expect(first.daysLong).toBe(28);
  expect(first.day).toBe(1);

  // A 28-day season drifts through the calendar, so the theme follows the
  // month the window actually opens in, not the season number.
  for (let index = 0; index < 18; index++) {
    const start = BATTLE_PASS_FIRST_START + index * BATTLE_PASS_SEASON_MS;
    const season = battlePassSeason(start + 1000);
    const month = new Date(start).getUTCMonth() + 1;
    const theme = MONTH_THEMES[month - 1];
    expect(season.index, `season ${index + 1}`).toBe(index + 1);
    expect(season.id).toBe(`season-${index + 1}`);
    expect(season.month).toBe(month);
    expect(season.name).toBe(theme.name);
    expect(season.name).toBe(passSeasonName(index + 1));
    expect(season.nextName).toBe(
      MONTH_THEMES[new Date(start + BATTLE_PASS_SEASON_MS).getUTCMonth()].name,
    );
    expect(seasonNumber(season.id)).toBe(index + 1);
    expect(seasonLabel(season.id)).toBe(
      `Season ${index + 1} ${"\u00b7"} ${theme.name}`,
    );
  }

  // 28-day seasons and 30-day months drift, so two seasons can share a theme;
  // the number still tells them apart.
  // Seasons 7 and 8 both open in May 2027, twelve days apart.
  const shared = battlePassSeason(
    BATTLE_PASS_FIRST_START + 6 * BATTLE_PASS_SEASON_MS + 1000,
  );
  const sharedNext = battlePassSeason(
    BATTLE_PASS_FIRST_START + 7 * BATTLE_PASS_SEASON_MS + 1000,
  );
  expect([shared.month, sharedNext.month]).toEqual([5, 5]);
  expect(shared.name).toBe(sharedNext.name);
  expect(seasonLabel(shared.id)).not.toBe(seasonLabel(sharedNext.id));

  expect(passSeasonIdentity(1).lap).toBe(1);
  expect(passSeasonIdentity(13).lap).toBe(2);
  expect(passSeasonName(0)).toBe(first.name);
  expect(passSeasonName(-4)).toBe(first.name);
  expect(passSeasonName(NaN)).toBe(first.name);
  expect(seasonLabel("")).toBe("Unstarted season");
  expect(seasonLabel("nonsense")).toBe("Unstarted season");
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
  await expect(hero.locator(".pass-hero-next")).toContainText(season.nextName);

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
