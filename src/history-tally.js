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

function emptyTally() {
  return {
    rolls: 0,
    offlineRolls: 0,

    tiers: emptyTiers(),
    best: null,

    badges: [],

    discovered: [],
    spent: 0,

    companions: 0,
    pets: [],
    skills: 0,
    boosts: 0,
    first: null,
    last: null,
  };
}

function bestOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (b.ep > a.ep) return b;
  if (a.ep > b.ep) return a;
  return b.at < a.at ? b : a;
}

const unionIds = (a, b) => [...new Set([...a, ...b])];

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
    } else if (entry.type === "rngween-exchange") {
      tally.spent += entry.ep ?? 0;
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

  while (next.length && next.at(-1) === null) next.pop();
  return next;
}

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
