import { test, expect } from "@playwright/test";
import { accountStats, cycleStats } from "../src/profile-stats.js";
import {
  applyProgress,
  emptyProgress,
  HISTORY_LIMIT,
  parseAndRepairProgress,
} from "../src/progress.js";
import { isCycleMarker } from "../src/history-log.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { PETS } from "../src/pets.js";
import { shopProducts } from "../src/shop-data.js";
import { SKILLS } from "../src/skills.js";
import { testProfile } from "./helpers/progress.js";

// What the profile and the Rebirth page show must not depend on how much of the
// log is still there. These tests clear entries in every way the game allows
// and check that every figure reads the same afterwards.

const BASE = Date.UTC(2026, 0, 1);
const at = (minutes) => BASE + minutes * 60000;
const BADGES = allBadgeMetadata.map((badge) => badge.id);
const PRODUCT = shopProducts[0].id;
// The EP a roll of each tier pays, inside that tier's band of the scoring table.
const EP = {
  trash: 40,
  common: 2500,
  uncommon: 6000,
  rare: 12000,
  epic: 30000,
  anomaly: 40000,
  mythic: 200000,
  godly: 512000,
};

const roll = ({ id, minutes, tier, number, ...extra }) => ({
  id,
  type: "roll",
  at: at(minutes),
  number,
  tier,
  ep: EP[tier],
  badges: [],
  ...extra,
});
const marker = (count, minutes) => ({
  id: `reb${count}`,
  type: "rebirth",
  at: at(minutes),
  count,
});

// Three finished cycles and a running one, with every kind of entry the profile
// reads: rolls of every tier, offline and boosted rolls, charged skills, badge
// unlocks, purchases and companions.
function richLog() {
  const history = [];
  const tiers = ["trash", "common", "rare", "epic", "godly", "uncommon"];
  let minute = 0;
  const tick = () => ++minute;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 40; i++) {
      const n = cycle * 100 + i;
      history.push(
        roll({
          id: `c${cycle}-r${i}`,
          minutes: tick(),
          tier: tiers[n % tiers.length],
          number: n,
          // A roll names each badge once, as the game does.
          badges: [...new Set([BADGES[n % 60], BADGES[(n * 7) % 60]])],
          ...(n % 5 === 0 ? { source: "offline" } : {}),
          ...(n % 9 === 0 ? { skills: [SKILLS[0].id] } : {}),
          ...(n % 11 === 0 ? { flywheel: "boost" } : {}),
        }),
      );
      if (i % 10 === 0)
        history.push({
          id: `c${cycle}-u${i}`,
          type: "unlock",
          at: at(tick()),
          number: n,
          badges: [BADGES[(n * 3) % 80]],
        });
      if (i % 13 === 0)
        history.push({
          id: `c${cycle}-b${i}`,
          type: "purchase",
          at: at(tick()),
          productId: PRODUCT,
          name: "Quickwind",
          ep: 1500 + i,
        });
      if (i % 17 === 0) {
        const pet = PETS[(cycle * 3 + i) % PETS.length];
        history.push({
          id: `c${cycle}-p${i}`,
          type: "pet",
          at: at(tick()),
          productId: pet.id,
          name: pet.name,
        });
      }
    }
    history.push(marker(cycle + 1, tick()));
  }
  for (let i = 0; i < 60; i++)
    history.push(
      roll({
        id: `now-${i}`,
        minutes: tick(),
        tier: "common",
        number: 5000 + i,
      }),
    );
  return history;
}

// A save the way the game keeps it: the current cycle's EP is stored too.
function saveWith(history, extra = {}) {
  const start = history.findLastIndex(isCycleMarker);
  const cycleEP = history
    .slice(start + 1)
    .filter((entry) => entry.type === "roll")
    .reduce((sum, entry) => sum + entry.ep, 0);
  return {
    ...emptyProgress(),
    profile: testProfile,
    balance: 5000,
    totalEarned: 90000,
    rebirths: history.filter(isCycleMarker).length,
    cycleEarnedEP: cycleEP,
    history,
    bookmarks: history.some((entry) => entry.id === "c1-r3") ? ["c1-r3"] : [],
    ...extra,
  };
}

// Every figure a profile or a cycle reports, compared as a whole.
const figures = (state) => ({
  account: accountStats(state),
  cycle: cycleStats(state),
});

test("bulk delete takes entries out of the log, but none of their figures out of the profile", () => {
  const state = saveWith(richLog());
  const before = figures(state);
  // A finished cycle goes whole, then the oldest entries go in a block that is
  // large enough to reach into the cycle in play.
  const cut = applyProgress(state, {
    type: "history-prune",
    mode: "cycle",
    marker: "reb1",
  });
  const trimmed = applyProgress(cut, {
    type: "history-prune",
    mode: "oldest",
    count: 300,
  });
  expect(figures(cut)).toEqual(before);
  expect(figures(trimmed)).toEqual(before);
  // Only the markers and the bookmarked roll are left in the log: the block
  // took everything else, the running cycle included.
  expect(trimmed.history.map((entry) => entry.id)).toEqual([
    "reb1",
    "c1-r3",
    "reb2",
    "reb3",
  ]);
});

test("the totals survive a save and a load, and the figures read back the same", () => {
  const cut = applyProgress(saveWith(richLog()), {
    type: "history-prune",
    mode: "oldest",
    count: 500,
  });
  const { progress, repairs } = parseAndRepairProgress(JSON.stringify(cut));
  expect(repairs).toEqual([]);
  expect(progress.removedTotals).toEqual(cut.removedTotals);
  expect(figures(progress)).toEqual(figures(cut));
});

test("the first cycle still starts when its first entries have been removed", () => {
  // No rebirth yet, and no profile creation date to fall back on.
  const state = saveWith(
    richLog().filter((entry) => !isCycleMarker(entry)),
    {
      profile: { id: "p", username: "LuckyTester" },
    },
  );
  const started = cycleStats(state).startedAt;
  const cut = applyProgress(state, {
    type: "history-prune",
    mode: "oldest",
    count: 10,
  });
  expect(cut.history[0].id).not.toBe(state.history[0].id);
  expect(cycleStats(cut).startedAt).toBe(started);
  expect(started).toBe(at(1));
});

test("when the cap trims the oldest entries, the best roll and the counts stay", () => {
  // The oldest entry is the best roll the account has, and it is the first to go.
  const history = [
    roll({ id: "best", minutes: 1, tier: "godly", number: 999999 }),
    ...Array.from({ length: HISTORY_LIMIT - 1 }, (_, i) =>
      roll({ id: `f${i}`, minutes: i + 2, tier: "common", number: i }),
    ),
  ];
  expect(history).toHaveLength(HISTORY_LIMIT);
  const state = saveWith(history, { bookmarks: [] });
  const before = accountStats(state);
  let next = state;
  for (let i = 0; i < 3; i++)
    next = applyProgress(next, {
      type: "complete",
      id: `new-${i}`,
      at: at(100000 + i),
      cooldownUntil: 0,
      result: { number: 7, totalEP: 2500, tier: "common", badges: [] },
    });
  expect(next.history).toHaveLength(HISTORY_LIMIT);
  expect(next.history.some((entry) => entry.id === "best")).toBe(false);
  const after = accountStats(next);
  expect(after.rolls).toBe(before.rolls + 3);
  expect(after.onlineRolls).toBe(before.onlineRolls + 3);
  expect(after.bestRoll).toMatchObject({ number: 999999, tier: "godly" });
  expect(after.firstEventAt).toBe(at(1));
});

test("a tie for the favourite tier still goes to the tier seen first, after its entries leave", () => {
  const history = [
    roll({ id: "a", minutes: 1, tier: "rare", number: 1 }),
    roll({ id: "b", minutes: 2, tier: "godly", number: 2 }),
    roll({ id: "c", minutes: 3, tier: "godly", number: 3 }),
    roll({ id: "d", minutes: 4, tier: "rare", number: 4 }),
    roll({ id: "e", minutes: 5, tier: "rare", number: 5 }),
    roll({ id: "f", minutes: 6, tier: "godly", number: 6 }),
  ];
  const state = saveWith(history, { bookmarks: [] });
  expect(accountStats(state).favoriteTier).toBe("rare");
  const cut = applyProgress(state, {
    type: "history-prune",
    mode: "oldest",
    count: 1,
  });
  expect(cut.history.some((entry) => entry.id === "a")).toBe(false);
  // Rare still has three rolls once the first one is counted, so the tie stands
  // and rare, seen first, keeps the title.
  expect(accountStats(cut).favoriteTier).toBe("rare");
});

test("a stored total that cannot be read is reset and reported, and the rest of the save loads", () => {
  const cut = applyProgress(saveWith(richLog()), {
    type: "history-prune",
    mode: "cycle",
    marker: "reb1",
  });
  expect(cut.removedTotals).toHaveLength(1);
  const damaged = JSON.parse(JSON.stringify(cut));
  damaged.removedTotals[0].rolls = -4;
  const { progress, repairs } = parseAndRepairProgress(JSON.stringify(damaged));
  expect(repairs).toContain(
    "some profile totals from removed activity were unreadable, so they were reset.",
  );
  expect(progress.removedTotals).toEqual([null]);
  expect(progress.history).toEqual(cut.history);
  expect(progress.balance).toBe(cut.balance);
  expect(progress.totalEarned).toBe(cut.totalEarned);

  const notAList = {
    ...JSON.parse(JSON.stringify(cut)),
    removedTotals: "oops",
  };
  const reset = parseAndRepairProgress(JSON.stringify(notAList));
  expect(reset.progress.removedTotals).toEqual([]);
  expect(reset.repairs).toContain(
    "some profile totals from removed activity were unreadable, so they were reset.",
  );
});

test("a companion list that has to be rebuilt still includes companions whose entries were removed", () => {
  const history = [
    {
      id: "pet-moth",
      type: "pet",
      at: at(1),
      productId: "moth",
      name: "Lumen Moth",
    },
    roll({ id: "r1", minutes: 2, tier: "common", number: 1 }),
    marker(1, 3),
    roll({ id: "r2", minutes: 4, tier: "common", number: 2 }),
  ];
  const cut = applyProgress(saveWith(history, { pets: ["moth"] }), {
    type: "history-prune",
    mode: "cycle",
    marker: "reb1",
  });
  // The moth's only entry is gone from the log...
  expect(cut.history.some((entry) => entry.type === "pet")).toBe(false);
  expect(accountStats(cut).companionsFound).toBe(1);
  // ...so a rebuilt companion list must still find it there.
  const damaged = { ...JSON.parse(JSON.stringify(cut)), pets: "broken" };
  const { progress, repairs } = parseAndRepairProgress(JSON.stringify(damaged));
  expect(repairs).toContain(
    "companion list was unreadable, so it was rebuilt from your history.",
  );
  expect(progress.pets).toEqual(["moth"]);
});
