import { rngweenCalendar } from "./rngween.js";

// CLEANUP Nov 4, 2026: retire the mini-RNGdle and its collection. Keep save
// migration and permanent cosmetic receipts; these points never become EP.
export const WORLD_MINI_RULES = 3;
export const WORLD_MINI_RANGES = {
  "pumpkin-patch": { max: 9, digits: 1 },
  graveyard: { max: 99, digits: 2 },
  "haunted-house": { max: 999, digits: 3 },
  // 666 is the top of the Ridge: the zone's own "hex" face.
  "blood-moon-ridge": { max: 666, digits: 3 },
  valley: { max: 9999, digits: 4 },
};
export const WORLD_BADGE_TIERS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

const badge = (id, name, detail, tier, points, pattern, icon = "ghost") => ({
  id,
  name,
  detail,
  tier,
  points,
  pattern,
  icon,
});
export const WORLD_BADGES = {
  "pumpkin-patch": [
    badge(
      "harvest-even",
      "Even Harvest",
      "Roll an even number.",
      "common",
      1,
      "even",
      "pumpkin",
    ),
    badge(
      "lantern-odd",
      "Lantern Watch",
      "Roll an odd number.",
      "common",
      1,
      "odd",
      "candle",
    ),
    badge(
      "first-spark",
      "First Spark",
      "Roll a prime: 2, 3, 5 or 7.",
      "uncommon",
      3,
      "smallPrime",
      "candle",
    ),
    badge(
      "crooked-vine",
      "Crooked Vine",
      "Roll a square: 1, 4 or 9.",
      "uncommon",
      4,
      "smallSquare",
      "stairs",
    ),
    badge(
      "lone-lantern",
      "Lone Lantern",
      "Roll exactly 1.",
      "rare",
      10,
      "one",
      "candle",
    ),
    badge(
      "pumpkin-six",
      "Carved Six",
      "Roll exactly 6.",
      "rare",
      12,
      "six",
      "skull",
    ),
    badge(
      "lucky-crow",
      "Lucky Crow",
      "Roll exactly 7.",
      "epic",
      20,
      "seven",
      "crow",
    ),
    badge(
      "last-lantern",
      "Last Lantern",
      "Roll exactly 9.",
      "epic",
      25,
      "nine",
      "pumpkin",
    ),
    badge(
      "low-vines",
      "Low Vines",
      "Roll 1, 2 or 3.",
      "common",
      2,
      "low",
      "stairs",
    ),
    badge(
      "tall-stalks",
      "Tall Stalks",
      "Roll 7, 8 or 9.",
      "uncommon",
      3,
      "high",
      "stairs",
    ),
    badge(
      "five-candles",
      "Five Candles",
      "Roll exactly 5.",
      "rare",
      10,
      "five",
      "candle",
    ),
    badge(
      "fat-gourd",
      "Fat Gourd",
      "Roll exactly 8.",
      "rare",
      12,
      "eight",
      "pumpkin",
    ),
  ],
  graveyard: [
    badge(
      "cold-stone",
      "Cold Stone",
      "Roll an even number.",
      "common",
      1,
      "even",
      "moon",
    ),
    badge(
      "night-watch",
      "Night Watch",
      "Roll an odd number.",
      "common",
      1,
      "odd",
      "moon",
    ),
    badge(
      "six-mark",
      "Six Mark",
      "Find a 6 in either digit.",
      "uncommon",
      5,
      "six",
      "skull",
    ),
    badge(
      "empty-grave",
      "Empty Grave",
      "Find a 0 in either digit.",
      "uncommon",
      5,
      "zero",
      "ghost",
    ),
    badge(
      "twin-bones",
      "Twin Bones",
      "Roll two identical digits.",
      "rare",
      15,
      "same",
      "bones",
    ),
    badge(
      "grave-steps",
      "Grave Steps",
      "Roll two digits in ascending or descending order.",
      "rare",
      12,
      "steps",
      "stairs",
    ),
    badge(
      "thirteen",
      "Thirteen",
      "Roll digits whose sum is 13.",
      "rare",
      20,
      "sum13",
      "candle",
    ),
    badge(
      "black-cat",
      "Black Cat",
      "Roll exactly 13.",
      "epic",
      50,
      "cat13",
      "cat",
    ),
    badge(
      "raven-seven",
      "Raven Seven",
      "Find a 7 in either digit.",
      "uncommon",
      5,
      "hasSeven",
      "crow",
    ),
    badge(
      "cursed-prime",
      "Cursed Prime",
      "Roll a prime number.",
      "rare",
      12,
      "prime",
      "candle",
    ),
    badge(
      "last-plot",
      "Last Plot",
      "Roll exactly 99.",
      "epic",
      60,
      "top",
      "door",
    ),
    badge(
      "double-hex",
      "Double Hex",
      "Roll exactly 66.",
      "legendary",
      100,
      "hex",
      "hex",
    ),
  ],
  "haunted-house": [
    badge(
      "locked-room",
      "Locked Room",
      "Roll an even number.",
      "common",
      1,
      "even",
      "door",
    ),
    badge(
      "candlelight",
      "Candlelight",
      "Roll an odd number.",
      "common",
      1,
      "odd",
      "candle",
    ),
    badge(
      "haunted-six",
      "Haunted Six",
      "Find at least one 6.",
      "uncommon",
      8,
      "six",
      "skull",
    ),
    badge(
      "broken-window",
      "Broken Window",
      "Find at least one 0.",
      "uncommon",
      8,
      "zero",
      "ghost",
    ),
    badge(
      "doppelganger",
      "Doppelganger",
      "Roll a repeated digit.",
      "uncommon",
      10,
      "repeat",
      "bones",
    ),
    badge(
      "portrait",
      "Portrait",
      "Roll a three-digit palindrome.",
      "rare",
      35,
      "palindrome",
      "mirror",
    ),
    badge(
      "staircase",
      "Staircase",
      "Roll three digits in ascending or descending order.",
      "rare",
      45,
      "steps",
      "stairs",
    ),
    badge(
      "witching-hour",
      "Witching Hour",
      "Roll digits whose sum is 13.",
      "rare",
      25,
      "sum13",
      "candle",
    ),
    badge(
      "room-thirteen",
      "Room 13",
      "Roll a number ending in 13.",
      "rare",
      40,
      "ends13",
      "door",
    ),
    badge(
      "triple-echo",
      "Triple Echo",
      "Roll three identical digits.",
      "epic",
      100,
      "same",
      "ghost",
    ),
    badge(
      "sealed-door",
      "Sealed Door",
      "Roll a prime number.",
      "rare",
      30,
      "prime",
      "door",
    ),
    badge(
      "infernal",
      "Infernal",
      "Roll exactly 666. This badge does not award Hexbound.",
      "legendary",
      500,
      "hex",
      "hex",
    ),
  ],
  "blood-moon-ridge": [
    badge(
      "moonrise",
      "Moonrise",
      "Roll an even number.",
      "common",
      1,
      "even",
      "moon",
    ),
    badge(
      "moonset",
      "Moonset",
      "Roll an odd number.",
      "common",
      1,
      "odd",
      "moon",
    ),
    badge(
      "red-six",
      "Red Six",
      "Find at least one 6.",
      "uncommon",
      8,
      "six",
      "skull",
    ),
    badge(
      "blind-moon",
      "Blind Moon",
      "Find at least one 0.",
      "uncommon",
      8,
      "zero",
      "moon",
    ),
    badge(
      "twin-bats",
      "Twin Bats",
      "Roll a repeated digit.",
      "uncommon",
      10,
      "repeat",
      "bones",
    ),
    badge(
      "seventh-night",
      "Seventh Night",
      "Find at least one 7.",
      "uncommon",
      10,
      "hasSeven",
      "crow",
    ),
    badge(
      "blood-mirror",
      "Blood Mirror",
      "Roll a three-digit palindrome.",
      "rare",
      35,
      "palindrome",
      "mirror",
    ),
    badge(
      "cliff-steps",
      "Cliff Steps",
      "Roll three digits in ascending or descending order.",
      "rare",
      45,
      "steps",
      "stairs",
    ),
    badge(
      "thirteen-drops",
      "Thirteen Drops",
      "Roll digits whose sum is 13.",
      "rare",
      25,
      "sum13",
      "candle",
    ),
    badge(
      "blood-prime",
      "Blood Prime",
      "Roll a prime number.",
      "rare",
      30,
      "prime",
      "door",
    ),
    badge(
      "triple-howl",
      "Triple Howl",
      "Roll three identical digits.",
      "epic",
      100,
      "same",
      "ghost",
    ),
    badge(
      "eclipse",
      "Eclipse",
      "Roll exactly 666, the top of the Ridge. This badge does not award Hexbound.",
      "legendary",
      500,
      "hex",
      "hex",
    ),
  ],
  valley: [
    badge(
      "valley-watch",
      "Valley Watch",
      "Roll an even number.",
      "common",
      1,
      "even",
      "moon",
    ),
    badge(
      "nightfall",
      "Nightfall",
      "Roll an odd number.",
      "common",
      1,
      "odd",
      "moon",
    ),
    badge(
      "red-mark",
      "Red Mark",
      "Find at least one 6.",
      "uncommon",
      10,
      "six",
      "skull",
    ),
    badge(
      "fogged-zero",
      "Fogged Zero",
      "Find at least one 0.",
      "uncommon",
      10,
      "zero",
      "ghost",
    ),
    badge(
      "echo",
      "Echo",
      "Roll a repeated digit.",
      "uncommon",
      15,
      "repeat",
      "bones",
    ),
    badge(
      "mirror-gate",
      "Mirror Gate",
      "Roll a four-digit palindrome.",
      "rare",
      60,
      "palindrome",
      "mirror",
    ),
    badge(
      "lost-steps",
      "Lost Steps",
      "Roll four digits in ascending or descending order.",
      "epic",
      100,
      "steps",
      "stairs",
    ),
    badge(
      "thirteen-sigils",
      "Thirteen Sigils",
      "Roll digits whose sum is 13.",
      "rare",
      35,
      "sum13",
      "candle",
    ),
    badge(
      "triple-six",
      "Triple Six",
      "Find at least three 6s.",
      "epic",
      200,
      "triple6",
      "skull",
    ),
    badge(
      "sealed-quartet",
      "Sealed Quartet",
      "Roll four identical digits.",
      "epic",
      400,
      "same",
      "ghost",
    ),
    badge(
      "valley-prime",
      "Valley Prime",
      "Roll a prime number.",
      "rare",
      50,
      "prime",
      "candle",
    ),
    badge(
      "hexbound",
      "Hexbound",
      "Roll exactly 6666 to earn the permanent skin.",
      "legendary",
      2000,
      "hex",
      "hex",
    ),
  ],
};
// Every fragment zone asks for about half its collection plus one zone
// flavour goal: enough to see the badges, short enough to stay fun.
export const WORLD_FRAGMENT_GOALS = {
  "pumpkin-patch": [
    {
      id: "collection",
      name: "Collect 6 different badges",
      metric: "unique",
      goal: 6,
    },
    {
      id: "points",
      name: "Earn 60 Pumpkin Patch points",
      metric: "score",
      goal: 60,
    },
    { id: "rolls", name: "Reveal 9 numbers", metric: "rolls", goal: 9 },
  ],
  graveyard: [
    {
      id: "collection",
      name: "Collect 6 different badges",
      metric: "unique",
      goal: 6,
    },
    {
      id: "points",
      name: "Earn 150 Graveyard points",
      metric: "score",
      goal: 150,
    },
    { id: "sixes", name: "Get Six Mark 3 times", metric: "six", goal: 3 },
  ],
  "haunted-house": [
    {
      id: "collection",
      name: "Collect 7 different badges",
      metric: "unique",
      goal: 7,
    },
    {
      id: "points",
      name: "Earn 600 Haunted House points",
      metric: "score",
      goal: 600,
    },
    {
      id: "rares",
      name: "Roll Rare or better 6 times",
      metric: "rareRolls",
      goal: 6,
    },
  ],
  "blood-moon-ridge": [
    {
      id: "collection",
      name: "Collect 6 different badges",
      metric: "unique",
      goal: 6,
    },
    {
      id: "points",
      name: "Earn 500 Blood Moon Ridge points",
      metric: "score",
      goal: 500,
    },
    { id: "sixes", name: "Get Red Six 4 times", metric: "six", goal: 4 },
  ],
};
// Phase objectives are collection milestones, never aura missions. The four
// fragment zones award key fragments; auras keep their original trials.
export const WORLD_PHASE_GOALS = {
  ...WORLD_FRAGMENT_GOALS,
  valley: [
    {
      id: "collection",
      name: "Collect 8 different badges",
      metric: "unique",
      goal: 8,
    },
    {
      id: "points",
      name: "Earn 3,000 Valley points",
      metric: "score",
      goal: 3000,
    },
    {
      id: "rares",
      name: "Roll Rare or better 10 times",
      metric: "rareRolls",
      goal: 10,
    },
  ],
};
const amount = (value) => Number.isSafeInteger(value) && value >= 0;
const object = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
const rank = (tier) => WORLD_BADGE_TIERS.indexOf(tier);

export function scoreWorldNumber(zone, number) {
  const range = Object.hasOwn(WORLD_MINI_RANGES, zone)
    ? WORLD_MINI_RANGES[zone]
    : null;
  if (!range || !Number.isInteger(number) || number < 1 || number > range.max)
    throw new Error("This World zone needs a number within its own range.");
  // The fixed-width face is also the scoring face: 7 means 07 / 007 / 0007.
  const text = String(number).padStart(range.digits, "0");
  const digits = [...text].map(Number);
  const same = digits.every((digit) => digit === digits[0]);
  const steps = [1, -1].some((direction) =>
    digits
      .slice(1)
      .every((digit, index) => digit === digits[index] + direction),
  );
  const prime =
    number > 1 &&
    Array.from(
      { length: Math.floor(Math.sqrt(number)) - 1 },
      (_, i) => i + 2,
    ).every((divisor) => number % divisor !== 0);
  const matches = {
    even: number % 2 === 0,
    low: number <= 3,
    high: number >= 7,
    five: number === 5,
    eight: number === 8,
    hasSeven: text.includes("7"),
    prime,
    top: number === range.max,
    odd: number % 2 !== 0,
    six: text.includes("6"),
    zero: text.includes("0"),
    same,
    repeat: new Set(digits).size < digits.length,
    steps,
    palindrome: text === [...text].reverse().join(""),
    sum13: digits.reduce((sum, digit) => sum + digit, 0) === 13,
    cat13: number === 13,
    ends13: number % 100 === 13,
    triple6: digits.filter((digit) => digit === 6).length >= 3,
    hex: number === Number("6".repeat(range.digits)),
    smallPrime: [2, 3, 5, 7].includes(number),
    smallSquare: [1, 4, 9].includes(number),
    one: number === 1,
    seven: number === 7,
    nine: number === 9,
  };
  const badges = WORLD_BADGES[zone].filter((entry) => matches[entry.pattern]);
  const tier = badges.reduce(
    (best, entry) => (rank(entry.tier) > rank(best) ? entry.tier : best),
    "common",
  );
  return {
    zone,
    number,
    text,
    badges,
    points: badges.reduce((sum, entry) => sum + entry.points, 0),
    tier,
  };
}

export function emptyWorldMini() {
  return Object.fromEntries(
    Object.keys(WORLD_MINI_RANGES).map((zone) => [
      zone,
      {
        rolls: 0,
        counts: {},
        rareRolls: 0,
        last: null,
        best: null,
      },
    ]),
  );
}
const SIX_BADGE = {
  "pumpkin-patch": "pumpkin-six",
  graveyard: "six-mark",
  "haunted-house": "haunted-six",
  "blood-moon-ridge": "red-six",
  valley: "red-mark",
};
export function worldMiniSummary(zone, stats) {
  const counts = stats?.counts ?? {};
  const badges = WORLD_BADGES[zone] ?? [];
  const score = badges.reduce(
    (sum, entry) => sum + (counts[entry.id] ?? 0) * entry.points,
    0,
  );
  return {
    rolls: stats?.rolls ?? 0,
    score,
    unique: badges.filter((entry) => (counts[entry.id] ?? 0) > 0).length,
    total: badges.length,
    rareRolls: stats?.rareRolls ?? 0,
    six: counts[SIX_BADGE[zone]] ?? 0,
  };
}
export function worldFragmentGoals(zone, stats) {
  const summary = worldMiniSummary(zone, stats);
  return (WORLD_FRAGMENT_GOALS[zone] ?? []).map((goal) => ({
    ...goal,
    count: summary[goal.metric],
    complete: summary[goal.metric] >= goal.goal,
  }));
}
export function worldFragmentComplete(zone, stats) {
  const goals = worldFragmentGoals(zone, stats);
  return goals.length > 0 && goals.every((goal) => goal.complete);
}

export function worldPhaseGoals(zone, stats) {
  const summary = worldMiniSummary(zone, stats);
  return (WORLD_PHASE_GOALS[zone] ?? []).map((goal) => ({
    ...goal,
    count: summary[goal.metric],
    complete: summary[goal.metric] >= goal.goal,
  }));
}
export function worldPhaseComplete(zone, stats) {
  const goals = worldPhaseGoals(zone, stats);
  return goals.length > 0 && goals.every((goal) => goal.complete);
}

// The unseen pool is a receipt for every settled Valley number, including
// older saves. Its badges/points are reconstructible without paying anything.
export function worldValleyMini(stats, drawn, roll = null) {
  const counts = {};
  let rareRolls = 0,
    bestNumber = null,
    bestPoints = -1;
  for (const number of drawn) {
    const scored = scoreWorldNumber("valley", number);
    for (const badge of scored.badges)
      counts[badge.id] = (counts[badge.id] ?? 0) + 1;
    if (rank(scored.tier) >= rank("rare")) rareRolls++;
    if (scored.points > bestPoints) {
      bestNumber = number;
      bestPoints = scored.points;
    }
  }
  const lastNumber = drawn.at(-1);
  const last =
    lastNumber === undefined
      ? null
      : roll?.zone === "valley" && roll.number === lastNumber
        ? { serial: roll.serial, number: lastNumber, at: roll.revealsAt }
        : stats?.last?.number === lastNumber
          ? stats.last
          : { serial: null, number: lastNumber, at: null };
  const best =
    bestNumber === null
      ? null
      : stats?.best &&
          drawn.includes(stats.best.number) &&
          scoreWorldNumber("valley", stats.best.number).points === bestPoints
        ? stats.best
        : last && scoreWorldNumber("valley", last.number).points === bestPoints
          ? last
          : { serial: null, number: bestNumber, at: null };
  return { rolls: drawn.length, counts, rareRolls, last, best };
}

function readResult(value, zone, nextSerial) {
  if (value === null) return { result: null, repaired: false };
  const poolReceipt =
    zone === "valley" &&
    object(value) &&
    value.serial === null &&
    value.at === null;
  const valid =
    object(value) &&
    (poolReceipt ||
      (amount(value.serial) &&
        value.serial >= 1 &&
        value.serial < nextSerial &&
        amount(value.at) &&
        value.at <= 8640000000000000 &&
        value.at >= rngweenCalendar(value.at).limitedStartsAt + 2000 &&
        rngweenCalendar(value.at).limitedPhase === "active")) &&
    Number.isInteger(value.number) &&
    value.number >= 1 &&
    value.number <= WORLD_MINI_RANGES[zone].max;
  return {
    result: valid
      ? { serial: value.serial, number: value.number, at: value.at }
      : null,
    repaired: !valid,
  };
}
export function parseWorldMini(value, rounds, nextSerial) {
  const mini = emptyWorldMini();
  if (value === undefined) return { mini, repaired: false };
  if (!object(value)) return { mini, repaired: true };
  let repaired = Object.keys(value).some(
    (zone) => !Object.hasOwn(WORLD_MINI_RANGES, zone),
  );
  for (const zone of Object.keys(mini)) {
    const saved = value[zone];
    if (zone === "pumpkin-patch" && saved === undefined) continue;
    if (!object(saved)) {
      repaired = true;
      continue;
    }
    const rolls =
      amount(saved.rolls) && saved.rolls <= rounds[zone] ? saved.rolls : 0;
    repaired ||= rolls !== saved.rolls;
    const counts = {};
    if (!object(saved.counts)) repaired = true;
    else {
      const allowed = new Set(WORLD_BADGES[zone].map((entry) => entry.id));
      for (const [id, count] of Object.entries(saved.counts)) {
        if (allowed.has(id) && amount(count) && count > 0 && count <= rolls)
          counts[id] = count;
        else repaired = true;
      }
    }
    const rareCounts = WORLD_BADGES[zone]
      .filter((entry) => rank(entry.tier) >= rank("rare"))
      .map((entry) => counts[entry.id] ?? 0);
    const minimumRare = Math.max(0, ...rareCounts);
    const maximumRare = Math.min(
      rolls,
      rareCounts.reduce((sum, count) => sum + count, 0),
    );
    const rareRolls =
      amount(saved.rareRolls) &&
      saved.rareRolls >= minimumRare &&
      saved.rareRolls <= maximumRare
        ? saved.rareRolls
        : minimumRare;
    repaired ||= rareRolls !== saved.rareRolls;
    const last = readResult(saved.last, zone, nextSerial),
      best = readResult(saved.best, zone, nextSerial);
    repaired ||= last.repaired || best.repaired;
    if (!rolls && (last.result || best.result)) {
      last.result = best.result = null;
      repaired = true;
    }
    if (last.result && best.result && best.result.serial > last.result.serial) {
      best.result = last.result;
      repaired = true;
    }
    if (
      last.result &&
      best.result &&
      scoreWorldNumber(zone, last.result.number).points >
        scoreWorldNumber(zone, best.result.number).points
    ) {
      best.result = last.result;
      repaired = true;
    }
    mini[zone] = {
      rolls,
      counts,
      rareRolls,
      last: last.result,
      best: best.result,
    };
    if (!amount(worldMiniSummary(zone, mini[zone]).score)) {
      mini[zone] = { ...mini[zone], counts: {}, rareRolls: 0 };
      repaired = true;
    }
  }
  return { mini, repaired };
}
export function recordWorldMini(mini, roll) {
  const previous = mini?.[roll.zone] ?? emptyWorldMini()[roll.zone];
  const result = scoreWorldNumber(roll.zone, roll.number);
  const counts = { ...previous.counts };
  for (const entry of result.badges)
    counts[entry.id] = (counts[entry.id] ?? 0) + 1;
  const last = { serial: roll.serial, number: roll.number, at: roll.revealsAt };
  const best =
    !previous.best ||
    result.points > scoreWorldNumber(roll.zone, previous.best.number).points
      ? last
      : previous.best;
  const next = {
    rolls: previous.rolls + 1,
    counts,
    rareRolls: previous.rareRolls + (rank(result.tier) >= rank("rare") ? 1 : 0),
    last,
    best,
  };
  if (
    ![
      next.rolls,
      next.rareRolls,
      ...Object.values(counts),
      worldMiniSummary(roll.zone, next).score,
    ].every(amount)
  )
    throw new Error("The World's saved badge limit has been reached.");
  return { ...emptyWorldMini(), ...mini, [roll.zone]: next };
}

const odds = new Map();
export function worldBadgeOdds(zone) {
  if (!Object.hasOwn(WORLD_MINI_RANGES, zone))
    throw new Error("Unknown World zone.");
  if (!odds.has(zone)) {
    const max = WORLD_MINI_RANGES[zone].max;
    const counts = Object.fromEntries(
      WORLD_BADGES[zone].map((entry) => [entry.id, 0]),
    );
    for (let number = 1; number <= max; number++)
      for (const entry of scoreWorldNumber(zone, number).badges)
        counts[entry.id]++;
    odds.set(
      zone,
      Object.fromEntries(
        Object.entries(counts).map(([id, count]) => [
          id,
          { count, total: max },
        ]),
      ),
    );
  }
  return odds.get(zone);
}
