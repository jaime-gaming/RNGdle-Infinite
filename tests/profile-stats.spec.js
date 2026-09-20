import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  accountStats,
  exportFileName,
  exportPayload,
} from "../src/profile-stats.js";
import { emptyProgress } from "../src/progress.js";
import { BADGE_TOTAL } from "../src/rebirth.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { PETS } from "../src/pets.js";
import { SKILLS } from "../src/skills.js";

const at = (day) => Date.UTC(2026, 7, day, 12, 0, 0);
const [badgeA] = allBadgeMetadata.map((badge) => badge.id);

function played(extra = {}) {
  return {
    ...emptyProgress(),
    profile: { id: "p1", username: "LuckyOtter41", createdAt: at(1) },
    balance: 125000,
    totalEarned: 400000,
    discovered: [badgeA, "missing-badge"],
    pets: ["pebble", "moth"],
    activePet: "pebble",
    skills: ["surge"],
    equippedSkills: ["surge"],
    rebirths: 2,
    ultraRebirths: 1,
    history: [
      {
        id: "r1",
        type: "roll",
        at: at(2),
        number: 812044,
        tier: "rare",
        ep: 12000,
        badges: [badgeA],
      },
      {
        id: "r1:unlock",
        type: "unlock",
        at: at(2),
        number: 812044,
        badges: [badgeA],
      },
      {
        id: "r2",
        type: "roll",
        at: at(3),
        number: 999999,
        tier: "godly",
        ep: 512000,
        badges: [],
      },
      {
        id: "r2:pet",
        type: "pet",
        at: at(3),
        productId: "moth",
        name: "Lumen Moth",
      },
      {
        id: "r3",
        type: "roll",
        at: at(4),
        number: 1337,
        tier: "trash",
        ep: 40,
        badges: [],
        source: "offline",
      },
      {
        id: "r4",
        type: "roll",
        at: at(4),
        number: 4242,
        tier: "common",
        ep: 260,
        badges: [],
        flywheel: "boost",
        skills: ["surge"],
      },
      {
        id: "b1",
        type: "purchase",
        at: at(5),
        productId: "surge",
        name: "Surge",
        ep: 180000,
      },
      {
        id: "reb1",
        type: "rebirth",
        at: at(6),
        count: 2,
        skill: "reborn-drive",
      },
    ],
    ...extra,
  };
}

test("every profile figure is derived from the save and its activity log", () => {
  const stats = accountStats(played());
  expect(stats.rolls).toBe(4);
  expect(stats.onlineRolls).toBe(3);
  expect(stats.offlineRolls).toBe(1);
  expect(stats.bestRoll).toMatchObject({
    number: 999999,
    ep: 512000,
    tier: "godly",
  });
  expect(stats.favoriteTier).toBe("rare"); // all four tie; the first seen wins
  expect(stats.totalEarned).toBe(400000);
  expect(stats.spent).toBe(180000);
  expect(stats.uniqueBadges).toBe(1);
  // Only real badge ids count: the fixture also carries one that does not exist.
  expect(stats.badgesNow).toBe(1);
  expect(stats.badgesTotal).toBe(BADGE_TOTAL);
  expect(stats.companions).toBe(2);
  expect(stats.companionsFound).toBe(1);
  expect(stats.companionsTotal).toBe(PETS.length);
  expect(stats.skills).toBe(1);
  expect(stats.skillsTotal).toBe(SKILLS.length);
  expect(stats.skillsUsed).toBe(1);
  expect(stats.boostsUsed).toBe(1);
  expect(stats.rebirths).toBe(2);
  expect(stats.ultraRebirths).toBe(1);
  expect(stats.firstEventAt).toBe(at(2));
  expect(stats.lastEventAt).toBe(at(6));
  // Nothing is written back: the caller's object is untouched.
  const progress = played();
  const before = JSON.stringify(progress);
  accountStats(progress);
  expect(JSON.stringify(progress)).toBe(before);
});

test("an empty save reads as zeros rather than as invented progress", () => {
  const stats = accountStats(emptyProgress());
  expect(stats.rolls).toBe(0);
  expect(stats.bestRoll).toBeNull();
  expect(stats.favoriteTier).toBeNull();
  expect(stats.uniqueBadges).toBe(0);
  expect(stats.skillsUsed).toBe(0);
  expect(stats.firstEventAt).toBeNull();
  expect(stats.lastEventAt).toBeNull();
});

test("the export is a read-only snapshot with no import path", () => {
  const progress = played();
  const payload = exportPayload(progress);
  expect(payload.app).toBe("RNGdle Infinite");
  expect(payload.profile.username).toBe("LuckyOtter41");
  expect(payload.stats.rolls).toBe(4);
  expect(payload.save).toMatchObject({
    balance: 125000,
    totalEarned: 400000,
    pets: ["pebble", "moth"],
    activePet: "pebble",
    equippedSkills: ["surge"],
    rebirths: 2,
    ultraRebirths: 1,
  });
  expect(payload.save.history).toHaveLength(progress.history.length);
  expect(exportFileName(progress)).toMatch(
    /^rngdle-infinite-luckyotter41-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(exportFileName(emptyProgress())).toMatch(/^rngdle-infinite-guest-/);

  // The UI offers exactly one direction: a download, and no file input.
  const profile = fs.readFileSync("src/components/LocalProfile.jsx", "utf8");
  expect(profile).toContain("Export my data");
  expect(profile).not.toContain('type="file"');
  expect(profile).not.toMatch(/\bImport\b/);
});
