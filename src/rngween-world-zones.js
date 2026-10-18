import { RNGWEEN_ID, rngweenCalendar } from "./rngween.js";
import {
  WORLD_MINI_RULES,
  WORLD_MINI_RANGES,
  emptyWorldMini,
  parseWorldMini,
  recordWorldMini,
  scoreWorldNumber,
  worldFragmentComplete,
  worldValleyMini,
} from "./rngween-world-badges.js";

// CLEANUP Nov 4, 2026: remove zones, speed purchases and timed-roll UI/actions.
// Keep parsing/retirement and permanent Hexbound receipts. Saved fragments,
// paid keys and committed results from the earlier minigames remain valid.
export const WORLD_KEY_ID = "rngween-world-key";
export const WORLD_VALLEY_MAX = 9999;
export const WORLD_VALLEY_TARGET = 6666;
export const WORLD_REVEAL_MS = [10000, 8000, 5000, 2000];
// Only already-committed old results use these ranges. There are no new
// choice games: all new rolls use the numbered badge rules below.
export const WORLD_LEGACY_STAGES = {
  graveyard: [6, 2],
  "haunted-house": [3, 4, 3],
};
const legacyGame = (zone) => Object.hasOwn(WORLD_LEGACY_STAGES, zone?.id);
// Four fragment zones, in path order; the Valley key needs all four.
export const WORLD_FRAGMENT_ZONES = [
  "pumpkin-patch",
  "graveyard",
  "blood-moon-ridge",
  "haunted-house",
];
export const worldFragmentCount = (world) =>
  WORLD_FRAGMENT_ZONES.filter((id) => world?.fragments?.[id] === true).length;
export const worldFragmentsComplete = (world) =>
  worldFragmentCount(world) === WORLD_FRAGMENT_ZONES.length;
export const WORLD_ZONES = [
  {
    id: "pumpkin-patch",
    phase: 1,
    name: "Pumpkin Patch",
    subtitle: "The lantern path",
    detail:
      "Roll from 1 to 9 among the harvest lanterns. Nine quick reveals start your badge collection and earn the first key fragment.",
    ...WORLD_MINI_RANGES["pumpkin-patch"],
    accent: "#fbbf77",
    fragment: "pumpkin-patch",
    auraId: "jack-o-glow",
  },
  {
    id: "graveyard",
    phase: 2,
    auraId: "phantom-veil",
    name: "Graveyard",
    subtitle: "Two-digit badge hunt",
    detail:
      "Roll from 1 to 99. Collect badges and complete three objectives to earn the second key fragment.",
    ...WORLD_MINI_RANGES.graveyard,
    accent: "#b7adf0",
    fragment: "graveyard",
  },
  {
    id: "blood-moon-ridge",
    phase: 3,
    auraId: "blood-moon",
    name: "Blood Moon Ridge",
    subtitle: "The 666 climb",
    detail:
      "Roll from 1 to 666 under the red moon. Sixes, sevens and primes earn the third key fragment; 666 is the Eclipse.",
    ...WORLD_MINI_RANGES["blood-moon-ridge"],
    accent: "#f87171",
    fragment: "blood-moon-ridge",
  },
  {
    id: "haunted-house",
    phase: 4,
    auraId: "witchfire",
    name: "Haunted House",
    subtitle: "Three-digit badge hunt",
    detail:
      "Roll from 1 to 999. Build a larger collection and find rarer patterns to earn the last key fragment.",
    ...WORLD_MINI_RANGES["haunted-house"],
    accent: "#95dfa3",
    fragment: "haunted-house",
  },
  {
    id: "valley",
    phase: 5,
    auraId: "hexbound",
    name: "Valley of Horrors",
    subtitle: "The 6666 challenge",
    detail:
      "Roll from 1 to 9999 without repeats. Collect the Valley badges; 6666 alone unlocks Hexbound.",
    ...WORLD_MINI_RANGES.valley,
    accent: "#fb7185",
    fragment: null,
  },
];
export const worldZoneById = new Map(
  WORLD_ZONES.map((zone) => [zone.id, zone]),
);
export const WORLD_SPEED_ITEMS = [
  {
    id: "wisp-lantern",
    name: "Wisp Lantern",
    level: 1,
    pumpkoinPrice: 200,
    revealMS: 8000,
    icon: "lantern",
    detail: "Reduces World reveals from 10 to 8 seconds.",
  },
  {
    id: "phantom-clock",
    name: "Phantom Clock",
    level: 2,
    pumpkoinPrice: 500,
    revealMS: 5000,
    icon: "clock",
    detail: "Reduces World reveals from 8 to 5 seconds.",
  },
  {
    id: "reapers-hourglass",
    name: "Reaper's Hourglass",
    level: 3,
    pumpkoinPrice: 1000,
    revealMS: 2000,
    icon: "hourglass",
    detail: "Reduces World reveals from 5 to 2 seconds.",
  },
];
export const worldSpeedById = new Map(
  WORLD_SPEED_ITEMS.map((item) => [item.id, item]),
);
const amount = (n) => Number.isSafeInteger(n) && n >= 0;
const time = (n) => amount(n) && n <= 8640000000000000;
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export function emptyRngweenWorld(drawn = [], legacyPass = false) {
  // Fallback constructors also receive damaged older pools; never let those
  // prevent the rest of an account from loading.
  drawn = Array.isArray(drawn)
    ? [
        ...new Set(
          drawn.filter(
            (number) =>
              Number.isInteger(number) &&
              number >= 1 &&
              number <= WORLD_VALLEY_MAX,
          ),
        ),
      ]
    : [];
  return {
    fragments: Object.fromEntries(
      WORLD_FRAGMENT_ZONES.map((id) => [id, false]),
    ),
    games: { graveyard: 0, "haunted-house": 0 },
    mini: { ...emptyWorldMini(), valley: worldValleyMini(null, drawn) },
    keyForged: false,
    legacyPass: legacyPass && drawn.length > 0,
    upgrades: [],
    rounds: {
      "pumpkin-patch": 0,
      graveyard: 0,
      "blood-moon-ridge": 0,
      "haunted-house": 0,
      valley: drawn.length,
    },
    visited: drawn.length ? ["valley"] : [],
    wins: 0,
    streak: 0,
    bestStreak: 0,
    nextSerial: 1,
    pending: null,
    last: null,
  };
}
export function worldState(limited) {
  return limited?.world ?? emptyRngweenWorld(limited?.drawn ?? [], true);
}
export function worldGameStage(limited, zoneId) {
  return worldState(limited).games?.[zoneId] ?? 0;
}
export function worldSpeedLevel(limited) {
  return worldState(limited).upgrades.length;
}
export function worldRevealMS(limited) {
  return WORLD_REVEAL_MS[worldSpeedLevel(limited)];
}
export function rngweenValleyUnlocked(limited) {
  const world = worldState(limited);
  return (
    !limited?.retired &&
    (limited?.bought?.includes(WORLD_KEY_ID) === true ||
      world.keyForged ||
      world.legacyPass)
  );
}
export function requireWorldZone(zoneId) {
  const zone = worldZoneById.get(zoneId);
  if (!zone)
    throw new Error(
      "Choose Pumpkin Patch, Graveyard, Blood Moon Ridge, Haunted House or Valley of Horrors.",
    );
  return zone;
}
function legacyMatch(roll) {
  return roll.zone !== "valley" && roll.number === roll.choice;
}
function legacyRunWon(roll) {
  return (
    legacyMatch(roll) &&
    (roll.rules !== 2 ||
      roll.stage === WORLD_LEGACY_STAGES[roll.zone]?.length - 1)
  );
}
function readRoll(value, drawn, upgrades, nextSerial, pending) {
  if (value === null) return { roll: null, repaired: false };
  if (!object(value)) return { roll: null, repaired: true };
  const zone = worldZoneById.get(value.zone);
  const mini = value.rules === WORLD_MINI_RULES;
  const staged = legacyGame(zone) && value.rules === 2;
  const stageMax = staged
    ? WORLD_LEGACY_STAGES[value.zone]?.[value.stage]
    : null;
  const max = mini
    ? zone?.max
    : staged
      ? stageMax
      : legacyGame(zone)
        ? WORLD_LEGACY_STAGES[value.zone][0]
        : zone?.max;
  if (
    !zone ||
    (!legacyGame(zone) && zone.id !== "valley" && !mini) ||
    (value.rules !== undefined && !staged && !mini) ||
    (!staged && value.stage !== undefined) ||
    (staged && (!amount(value.stage) || !stageMax)) ||
    !amount(value.serial) ||
    value.serial < 1 ||
    value.serial >= nextSerial ||
    (pending && value.serial !== nextSerial - 1) ||
    value.id !== `${RNGWEEN_ID}:world:${value.serial}` ||
    !time(value.startedAt) ||
    !time(value.revealsAt) ||
    !amount(value.speedLevel) ||
    value.speedLevel > upgrades.length ||
    value.revealsAt !== value.startedAt + WORLD_REVEAL_MS[value.speedLevel] ||
    rngweenCalendar(value.startedAt).limitedPhase !== "active" ||
    value.revealsAt >= rngweenCalendar(value.startedAt).limitedEndsAt ||
    !Number.isInteger(value.number) ||
    value.number < 1 ||
    value.number > max ||
    (!mini &&
      legacyGame(zone) &&
      (!Number.isInteger(value.choice) ||
        value.choice < 1 ||
        value.choice > max)) ||
    ((mini || !legacyGame(zone)) && value.choice !== null) ||
    value.expectedCount !==
      (zone.id === "valley"
        ? pending
          ? drawn.length
          : Math.max(0, drawn.length - 1)
        : 0) ||
    (pending && zone.id === "valley" && drawn.includes(value.number)) ||
    (!pending && zone.id === "valley" && value.number !== drawn.at(-1))
  )
    return { roll: null, repaired: true };
  return {
    roll: {
      id: value.id,
      serial: value.serial,
      zone: zone.id,
      ...(mini
        ? { rules: WORLD_MINI_RULES }
        : staged
          ? { rules: 2, stage: value.stage }
          : {}),
      choice: value.choice,
      number: value.number,
      startedAt: value.startedAt,
      revealsAt: value.revealsAt,
      speedLevel: value.speedLevel,
      expectedCount: value.expectedCount,
    },
    repaired: false,
  };
}
export function parseRngweenWorld(value, drawn = []) {
  // Keep earlier fragments, keys and committed rules. Badge progress is a new
  // independent collection; old pending numbers, ranges and deadlines stay fixed.
  if (value === undefined)
    return { world: emptyRngweenWorld(drawn, true), repaired: false };
  const fallback = emptyRngweenWorld(drawn);
  if (!object(value)) return { world: fallback, repaired: true };
  let repaired = false;
  const fragments = {};
  for (const id of WORLD_FRAGMENT_ZONES) {
    fragments[id] = value.fragments?.[id] === true;
    if (typeof value.fragments?.[id] !== "boolean") repaired = true;
  }
  const upgrades = [];
  if (!Array.isArray(value.upgrades)) repaired = true;
  else
    for (const item of WORLD_SPEED_ITEMS) {
      if (!value.upgrades.includes(item.id)) break;
      upgrades.push(item.id);
    }
  if (JSON.stringify(upgrades) !== JSON.stringify(value.upgrades))
    repaired = true;
  let keyForged =
    value.keyForged === true && worldFragmentsComplete({ fragments });
  const legacyPass = value.legacyPass === true && drawn.length > 0;
  if (
    typeof value.keyForged !== "boolean" ||
    keyForged !== value.keyForged ||
    typeof value.legacyPass !== "boolean" ||
    legacyPass !== value.legacyPass
  )
    repaired = true;
  const rounds = {};
  for (const { id } of WORLD_ZONES) {
    rounds[id] = amount(value.rounds?.[id]) ? value.rounds[id] : 0;
    if (
      rounds[id] !== value.rounds?.[id] &&
      !(!legacyGame({ id }) && value.rounds?.[id] === undefined)
    )
      repaired = true;
  }
  if (rounds.valley !== drawn.length) {
    rounds.valley = drawn.length;
    repaired = true;
  }
  const visited = Array.isArray(value.visited)
    ? WORLD_ZONES.filter(
        (z) => value.visited.includes(z.id) && rounds[z.id] > 0,
      ).map((z) => z.id)
    : [];
  if (drawn.length && !visited.includes("valley")) visited.push("valley");
  if (JSON.stringify(visited) !== JSON.stringify(value.visited))
    repaired = true;
  let wins = value.wins,
    streak = value.streak,
    bestStreak = value.bestStreak;
  if (
    ![wins, streak, bestStreak].every(amount) ||
    wins > WORLD_FRAGMENT_ZONES.reduce((sum, id) => sum + rounds[id], 0) ||
    streak > bestStreak ||
    bestStreak > wins ||
    (wins === 0) !== (bestStreak === 0)
  ) {
    wins = streak = bestStreak = 0;
    repaired = true;
  }
  const games = { graveyard: 0, "haunted-house": 0 };
  if (value.games !== undefined) {
    for (const id of Object.keys(games)) {
      const stage = value.games?.[id];
      if (
        !amount(stage) ||
        stage >= WORLD_LEGACY_STAGES[id].length ||
        stage > rounds[id] ||
        stage > wins
      )
        repaired = true;
      else games[id] = stage;
    }
    if (
      !object(value.games) ||
      Object.keys(value.games).some((id) => !(id in games))
    )
      repaired = true;
  }
  const nextSerial =
    amount(value.nextSerial) && value.nextSerial >= 1 ? value.nextSerial : 1;
  if (nextSerial !== value.nextSerial) repaired = true;
  const miniRead = parseWorldMini(value.mini, rounds, nextSerial);
  const mini = miniRead.mini;
  repaired ||= miniRead.repaired;
  for (const zone of WORLD_ZONES) {
    const stats = mini[zone.id];
    if (
      zone.fragment &&
      worldFragmentComplete(zone.id, stats) &&
      !fragments[zone.id]
    ) {
      fragments[zone.id] = true;
      repaired = true;
    }
    if (zone.id === "valley")
      for (const field of ["last", "best"])
        if (stats[field] && !drawn.includes(stats[field].number)) {
          stats[field] = null;
          repaired = true;
        }
  }
  if (value.keyForged === true && worldFragmentsComplete({ fragments }))
    keyForged = true;
  const pending = readRoll(value.pending, drawn, upgrades, nextSerial, true);
  const last = readRoll(value.last, drawn, upgrades, nextSerial, false);
  if (
    pending.roll &&
    ((last.roll && pending.roll.serial <= last.roll.serial) ||
      (pending.roll.rules === 2 &&
        pending.roll.stage !== games[pending.roll.zone]))
  ) {
    pending.roll = null;
    pending.repaired = true;
  }
  if (last.roll && !rounds[last.roll.zone]) {
    last.roll = null;
    last.repaired = true;
  }
  repaired ||= pending.repaired || last.repaired;
  mini.valley = worldValleyMini(mini.valley, drawn, last.roll);
  return {
    world: {
      fragments,
      games,
      mini,
      keyForged,
      legacyPass,
      upgrades,
      rounds,
      visited,
      wins,
      streak,
      bestStreak,
      nextSerial,
      pending: pending.roll,
      last: last.roll,
    },
    repaired,
  };
}

export function recordWorldOutcome(limited, pending) {
  const previous = worldState(limited);
  const zone = requireWorldZone(pending.zone);
  const isMini = pending.rules === WORLD_MINI_RULES;
  const mini = isMini
    ? recordWorldMini(previous.mini, pending)
    : (previous.mini ?? emptyWorldMini());
  if (zone.id === "valley")
    mini.valley = worldValleyMini(
      mini.valley,
      [...(limited.drawn ?? []), pending.number],
      pending,
    );
  const won = isMini
    ? zone.fragment &&
      scoreWorldNumber(zone.id, pending.number).tier !== "common"
    : legacyMatch(pending);
  const complete = isMini
    ? worldFragmentComplete(zone.id, mini[zone.id])
    : legacyRunWon(pending);
  if (pending.rules === 2 && pending.stage !== worldGameStage(limited, zone.id))
    throw new Error(
      "The saved legacy result no longer matches its run. Reload your save.",
    );
  const games = { graveyard: 0, "haunted-house": 0, ...previous.games };
  if (legacyGame(zone))
    games[zone.id] =
      !isMini && pending.rules === 2 && won && !complete
        ? pending.stage + 1
        : 0;
  const streak = zone.fragment
    ? won
      ? previous.streak + 1
      : 0
    : previous.streak;
  const rounds = {
    ...previous.rounds,
    [zone.id]: previous.rounds[zone.id] + 1,
  };
  const wins = previous.wins + (won ? 1 : 0);
  if (![...Object.values(rounds), wins, streak].every(amount))
    throw new Error("The World's saved round limit has been reached.");
  return {
    ...previous,
    fragments: {
      ...previous.fragments,
      ...(complete && zone.fragment ? { [zone.fragment]: true } : {}),
    },
    games,
    mini,
    rounds,
    visited: WORLD_ZONES.filter(
      (z) => previous.visited.includes(z.id) || z.id === zone.id,
    ).map((z) => z.id),
    wins,
    streak,
    bestStreak: Math.max(previous.bestStreak, streak),
    pending: null,
    last: { ...pending },
  };
}
