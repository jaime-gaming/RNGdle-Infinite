// What the activity log adds up to, kept per cycle so that entries can leave the
// log without taking their share of the profile with them.
//
// The profile and the Rebirth page read the log, and bulk delete or the cap
// removes entries from it. Each removed entry is first folded into a tally for
// the cycle it belonged to. A tally holds exactly what those pages read: the
// counts, the best roll, the badges found, companions, skills, and the first and
// last times. Every figure is then the entries still in the log plus the tallies,
// so removing entries never changes what the profile shows.
//
// Cycles are numbered by the rebirth markers before them. Markers are never
// removed, so an entry's cycle number never changes.

import { isCycleMarker } from "./history-log.js";
import { allBadgeMetadata } from "./infinite-badges.js";
import { petById } from "./pets.js";

export const TIERS = [
  "trash",
  "common",
  "uncommon",
  "rare",
  "epic",
  "anomaly",
  "mythic",
  "godly",
];

const BADGE_IDS = new Set(allBadgeMetadata.map((badge) => badge.id));
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;
const validTime = (n) => validAmount(n) && n <= 8640000000000000;
const earliest = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));
const latest = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));

function emptyTiers() {
  return Object.fromEntries(
    TIERS.map((tier) => [tier, { count: 0, since: null }]),
  );
}

export function emptyTally() {
  return {
    rolls: 0,
    offlineRolls: 0,
    // How many rolls landed in each tier, and when the first of them did. A tie
    // for the favourite tier goes to the tier seen first.
    tiers: emptyTiers(),
    best: null,
    // Every badge a roll or a discovery named...
    badges: [],
    // ...and the ones a discovery found, which is what the Rebirth page counts.
    discovered: [],
    spent: 0,
    // How many companion discoveries were logged, and which companions were
    // found or bought. The ids are what a rebuilt companion list is made from.
    companions: 0,
    pets: [],
    skills: 0,
    boosts: 0,
    first: null,
    last: null,
  };
}

// The better of two best rolls: the higher score. On a tie the one logged first
// wins, as the profile has always chosen.
function bestOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (b.ep > a.ep) return b;
  if (a.ep > b.ep) return a;
  return b.at < a.at ? b : a;
}

const unionIds = (a, b) => [...new Set([...a, ...b])];

// Adds two tallies together. Neither argument is changed.
export function mergeTallies(a, b) {
  const tiers = emptyTiers();
  for (const tier of TIERS) {
    const left = a.tiers[tier];
    const right = b.tiers[tier];
    tiers[tier] = {
      count: left.count + right.count,
      since: earliest(left.since, right.since),
    };
  }
  return {
    rolls: a.rolls + b.rolls,
    offlineRolls: a.offlineRolls + b.offlineRolls,
    tiers,
    best: bestOf(a.best, b.best),
    badges: unionIds(a.badges, b.badges),
    discovered: unionIds(a.discovered, b.discovered),
    spent: a.spent + b.spent,
    companions: a.companions + b.companions,
    pets: unionIds(a.pets, b.pets),
    skills: a.skills + b.skills,
    boosts: a.boosts + b.boosts,
    first: earliest(a.first, b.first),
    last: latest(a.last, b.last),
  };
}

// The tally of a list of log entries. Entries of every kind count towards the
// first and last times, as the profile has always counted them.
export function tallyEntries(entries = []) {
  const tally = emptyTally();
  const badges = new Set();
  const discovered = new Set();
  const pets = new Set();
  for (const entry of entries) {
    if (!entry || !validTime(entry.at)) continue;
    tally.first = earliest(tally.first, entry.at);
    tally.last = latest(tally.last, entry.at);
    if (entry.type === "roll") {
      tally.rolls++;
      if (entry.source === "offline") tally.offlineRolls++;
      const row = tally.tiers[entry.tier];
      if (row) {
        row.count++;
        row.since = earliest(row.since, entry.at);
      }
      tally.best = bestOf(tally.best, {
        number: entry.number,
        ep: entry.ep,
        tier: entry.tier,
        at: entry.at,
      });
      if ((entry.skills ?? []).length) tally.skills++;
      if (entry.flywheel === "boost") tally.boosts++;
      for (const id of entry.badges ?? [])
        if (BADGE_IDS.has(id)) badges.add(id);
    } else if (entry.type === "unlock") {
      for (const id of entry.badges ?? [])
        if (BADGE_IDS.has(id)) {
          badges.add(id);
          discovered.add(id);
        }
    } else if (entry.type === "purchase") {
      tally.spent += entry.ep ?? 0;
      if (petById.has(entry.productId)) pets.add(entry.productId);
    } else if (entry.type === "pet") {
      tally.companions++;
      if (petById.has(entry.productId)) pets.add(entry.productId);
    }
  }
  tally.badges = [...badges];
  tally.discovered = [...discovered];
  tally.pets = [...pets];
  return tally;
}

// Folds entries that have just left the log into the tallies of the cycles they
// belonged to, and returns the new list. `history` is the log as it was before
// they left, which says which cycle each entry was in.
export function archiveRemoved(totals = [], history = [], removed = []) {
  if (!removed.length) return totals;
  const cycleOf = new Map();
  let cycle = 0;
  for (const entry of history) {
    if (isCycleMarker(entry)) cycle++;
    else cycleOf.set(entry, cycle);
  }
  const grouped = new Map();
  for (const entry of removed) {
    const index = cycleOf.get(entry) ?? 0;
    grouped.set(index, [...(grouped.get(index) ?? []), entry]);
  }
  const length = Math.max(
    totals.length,
    ...[...grouped.keys()].map((index) => index + 1),
  );
  const next = Array.from({ length }, (_, index) => totals[index] ?? null);
  for (const [index, entries] of grouped)
    next[index] = mergeTallies(
      next[index] ?? emptyTally(),
      tallyEntries(entries),
    );
  // Trailing cycles with nothing in them are not kept.
  while (next.length && next.at(-1) === null) next.pop();
  return next;
}

// One stored tally, checked field by field. Anything that does not read back
// exactly is refused, so a damaged record is reset rather than trusted.
function readTally(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const amounts = [
    value.rolls,
    value.offlineRolls,
    value.spent,
    value.companions,
    value.skills,
    value.boosts,
  ];
  if (!amounts.every(validAmount)) return null;
  if (!value.tiers || typeof value.tiers !== "object") return null;
  const tiers = emptyTiers();
  for (const tier of TIERS) {
    const row = value.tiers[tier];
    if (!row || typeof row !== "object" || !validAmount(row.count)) return null;
    // A tier has a first time exactly when it has rolls.
    const hasRolls = row.count > 0;
    if (hasRolls !== (row.since !== null)) return null;
    if (hasRolls && !validTime(row.since)) return null;
    tiers[tier] = { count: row.count, since: row.since };
  }
  let best = null;
  if (value.best !== null) {
    const roll = value.best;
    if (
      !roll ||
      typeof roll !== "object" ||
      !validAmount(roll.number) ||
      roll.number > 1000000 ||
      !validAmount(roll.ep) ||
      !TIERS.includes(roll.tier) ||
      !validTime(roll.at)
    )
      return null;
    best = { number: roll.number, ep: roll.ep, tier: roll.tier, at: roll.at };
  }
  const ids = (list) => {
    if (!Array.isArray(list) || !list.every((id) => typeof id === "string"))
      return null;
    return [...new Set(list)].filter((id) => BADGE_IDS.has(id));
  };
  const badges = ids(value.badges);
  const discovered = ids(value.discovered);
  if (!badges || !discovered) return null;
  if (!Array.isArray(value.pets)) return null;
  if (!value.pets.every((id) => typeof id === "string")) return null;
  const pets = [...new Set(value.pets)].filter((id) => petById.has(id));
  if (value.first !== null && !validTime(value.first)) return null;
  if (value.last !== null && !validTime(value.last)) return null;
  return {
    rolls: value.rolls,
    offlineRolls: value.offlineRolls,
    tiers,
    best,
    badges,
    discovered,
    spent: value.spent,
    companions: value.companions,
    pets,
    skills: value.skills,
    boosts: value.boosts,
    first: value.first,
    last: value.last,
  };
}

// The stored tallies, one per cycle (null where a cycle has none). A value that
// is not a list is dropped; a single unreadable tally is reset to nothing. The
// result says whether anything had to be reset, so the caller can report it.
export function parseRemovedTotals(value) {
  if (value == null) return { totals: [], repaired: false };
  if (!Array.isArray(value)) return { totals: [], repaired: true };
  let repaired = false;
  const totals = value.map((item) => {
    if (item == null) return null;
    const tally = readTally(item);
    if (!tally) repaired = true;
    return tally;
  });
  return { totals, repaired };
}

// The tier most rolls landed in, or null with no rolls. A tie goes to the tier
// seen first.
export function favoriteTier(tally) {
  let top = null;
  for (const tier of TIERS) {
    const row = tally.tiers[tier];
    if (!row.count) continue;
    if (
      !top ||
      row.count > top.count ||
      (row.count === top.count && row.since < top.since)
    )
      top = { tier, count: row.count, since: row.since };
  }
  return top?.tier ?? null;
}
