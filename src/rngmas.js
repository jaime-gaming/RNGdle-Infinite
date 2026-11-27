import { WINTER_COMPANION_SKINS } from "./winter-companions.js";
import {
  WINTER_EXCLUSIVES,
  emptyWinterFestival,
  parseWinterFestival,
  recordWinterFestival,
  winterFestivalCount,
  WINTER_SPECIAL_TASKS,
  WINTER_LIVE_EVENTS,
} from "./winter-festival.js";
import { gameNow } from "./game-clock.js";

export const RNGMAS_ID = "rngmas-2026";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RNGMAS_DAY_MS = DAY_MS;

export const RNGMAS_START = Date.UTC(2026, 11, 1, 0, 0, 0);
export const RNGMAS_END = Date.UTC(2027, 0, 2, 0, 0, 0);
// The shelf and its notice only appear once the event is close enough to talk
// about; earlier dates keep the shop hub free of seasonal tiles.
export const RNGMAS_ANNOUNCE_DAYS = 14;
export const RNGMAS_ANNOUNCE_AT = RNGMAS_START - RNGMAS_ANNOUNCE_DAYS * DAY_MS;

export const ADVENT_DAYS = 24;
export const RNGMAS_THEME_START = RNGMAS_START;

export function rngmasThemeActive(at = gameNow()) {
  return at >= RNGMAS_THEME_START && at < RNGMAS_END;
}

export const GOLEM_SMASH_COST = 100000;

export const RNGMAS_FAMILY = {
  id: "rngmas",
  label: "RNGmas 2026",
  blurb: "Winter lights, advent doors and weekly activities.",
  font: '"Space Mono", monospace',
  tracking: "0.12em",
  casing: "uppercase",
  weight: 700,
  eventOnly: true,
};

export const RNGMAS_COSMETICS = [
  ...WINTER_EXCLUSIVES,
  {
    id: "rngmas-frost",
    kind: "aura",
    name: "Frostbound",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    golemReward: true,
    swatch: ["#082f49", "#a5f3fc"],
    icon: "frost",
    description:
      "The Snowcoin exchange's reward: deep ice with a bright frost rim. Kept forever, never sold.",
  },
  {
    id: "rngmas-ember",
    kind: "aura",
    name: "Emberlight",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    golemReward: true,
    swatch: ["#431407", "#fdba74"],
    icon: "ember",
    description:
      "The Christmas market's reward: coal black with a warm ember glow. Kept forever, never sold.",
  },
  {
    id: "rngmas-hollow",
    kind: "aura",
    name: "Hollow Frost",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    golemReward: true,
    swatch: ["#042f2e", "#5eead4"],
    icon: "hollow",
    description:
      "Golem Smash's reward: a cold teal shell around an empty centre. Kept forever, never sold.",
  },
  {
    id: "rngmas-golem",
    kind: "aura",
    name: "Golem Core",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    golemReward: true,
    swatch: ["#1c1410", "#fbbf24"],
    icon: "golem",
    description:
      "The Gift workshop's reward: dark stone with a golden core. Kept forever, never sold.",
  },
  {
    id: "rngmas-newyear",
    kind: "aura",
    name: "New Year Spark",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    golemReward: true,
    swatch: ["#1e1b4b", "#f0abfc"],
    icon: "spark",
    description:
      "Midnight countdown's reward: midnight blue with a violet spark. Kept forever, never sold.",
  },
  {
    id: "rngmas-gingerbread",
    kind: "aura",
    name: "Gingerbread",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    adventReward: true,
    swatch: ["#3b1d0f", "#fcd34d"],
    icon: "gingerbread",
    description:
      "The last advent door: baked brown with a icing-white rim. Kept forever, never sold.",
  },
  {
    id: "rngmas-star",
    kind: "aura",
    name: "RNGmas Star",
    family: "rngmas",
    eventOnly: true,
    limited: true,
    adventReward: true,
    finaleReward: true,
    swatch: ["#3f1d0b", "#fef08a"],
    icon: "star",
    description:
      "The Christmas Day star: gold light with a red ribbon glow. Kept forever, never sold.",
  },
];

export const ACTIVE_RNGMAS_AURAS = RNGMAS_COSMETICS.filter(
  (item) =>
    !WINTER_EXCLUSIVES.some((extra) => extra.id === item.id) ||
    item.id === "rngmas-midnight",
);
export const RNGMAS_REWARDS = [
  ...ACTIVE_RNGMAS_AURAS,
  ...WINTER_COMPANION_SKINS,
];
export const RNGMAS_COSMETICS_BY_ID = new Map(
  [...RNGMAS_COSMETICS, ...WINTER_COMPANION_SKINS].map((item) => [
    item.id,
    item,
  ]),
);

export const ADVENT_DOORS = [
  { day: 1, ep: 2500 },
  { day: 2, ep: 5000 },
  { day: 3, ep: 7500 },
  { day: 4, ep: 10000 },
  { day: 5, ep: 15000 },
  { day: 6, ep: 20000 },
  { day: 7, ep: 25000 },
  { day: 8, ep: 30000 },
  { day: 9, ep: 35000 },
  { day: 10, ep: 40000 },
  { day: 11, ep: 45000 },
  { day: 12, ep: 50000 },
  { day: 13, ep: 60000 },
  { day: 14, ep: 70000 },
  { day: 15, ep: 80000 },
  { day: 16, ep: 90000 },
  { day: 17, ep: 100000 },
  { day: 18, ep: 110000 },
  { day: 19, ep: 120000 },
  { day: 20, ep: 130000 },
  { day: 21, ep: 140000 },
  { day: 22, ep: 150000 },
  { day: 23, ep: 175000 },
  { day: 24, aura: "rngmas-gingerbread" },
];

export const ADVENT_FINALE = { day: 25, aura: "rngmas-star" };

export const SNOWCOIN_CAP = 1000000;
export const SNOWCOIN_EXCHANGE_EP = 10000;
export const SNOWCOIN_EXCHANGE_CAP = 200;
export const WINTER_MARKET = [
  {
    id: "snow-spark",
    name: "Spark Injector",
    price: 10,
    boost: "boost-spark",
  },
  {
    id: "snow-surge",
    name: "Surge Capacitor",
    price: 15,
    boost: "boost-surge",
  },
  {
    id: "snow-overdrive",
    name: "Overdrive Cell",
    price: 20,
    boost: "boost-overdrive",
  },
  {
    id: "snow-surge-bundle",
    name: "Surge bundle",
    price: 40,
    legacyPrice: 60,
    boost: "boost-surge",
    charges: 3,
  },
  {
    id: "snow-overdrive-bundle",
    name: "Overdrive bundle",
    price: 55,
    legacyPrice: 90,
    boost: "boost-overdrive",
    charges: 3,
  },
  {
    id: "snow-velvet",
    retired: true,
    name: "Velvet Noel",
    price: 60,
    aura: "rngmas-velvet",
  },
  {
    id: "snow-aurora",
    retired: true,
    name: "Aurora Postcard",
    price: 100,
    aura: "rngmas-aurora",
  },
  {
    id: "snow-crown",
    retired: true,
    name: "Solstice Crown",
    price: 140,
    aura: "rngmas-crown",
  },
  {
    id: "snow-polar-axolotl",
    name: "Polar Axolotl",
    price: 100,
    cosmetic: "winter-polar-axolotl",
  },
];

export const ACTIVE_WINTER_MARKET = WINTER_MARKET.filter(
  (item) => !item.retired,
);

export const RNGMAS_WEEKS = [
  {
    index: 1,
    id: "hollow",
    start: RNGMAS_START,
    end: Date.UTC(2026, 11, 8),
    name: "Golem Smash",
    blurb: "Prepare a strike, then roll normally. Your number is the damage.",
    metric: "damage",
    goal: 25000000,
    hp: 25000000,
    ep: 0,
    reward: "rngmas-hollow",
    boost: "boost-overdrive",
    charges: 2,
    coins: 50,
    accent: "#5eead4",
  },
  {
    index: 2,
    id: "ember",
    start: Date.UTC(2026, 11, 8),
    end: Date.UTC(2026, 11, 15),
    name: "Christmas market",
    blurb:
      "Buy from any three winter stalls this week to earn Emberlight. The market stays open until January 2.",
    metric: "purchases",
    goal: 3,
    hp: 1000000,
    ep: 0,
    reward: "rngmas-ember",
    boost: "boost-spark",
    charges: 2,
    coins: 15,
    accent: "#fb923c",
  },
  {
    index: 3,
    id: "frost",
    start: Date.UTC(2026, 11, 15),
    end: Date.UTC(2026, 11, 22),
    name: "Snowcoin exchange",
    blurb:
      "Exchange EP for 100 Snowcoins to earn Frostbound. Conversion is one-way and capped at 200 coins.",
    metric: "exchanged",
    goal: 100,
    hp: 1000000,
    ep: 0,
    reward: "rngmas-frost",
    boost: "boost-surge",
    charges: 2,
    coins: 25,
    accent: "#7dd3fc",
  },
  {
    index: 4,
    id: "golem",
    start: Date.UTC(2026, 11, 22),
    end: Date.UTC(2026, 11, 29),
    name: "Gift workshop",
    blurb: "Finish 80 online rolls containing a 0.",
    metric: "contains0",
    goal: 80,
    hp: 1000000,
    ep: 150000,
    reward: "rngmas-golem",
    boost: "boost-surge",
    charges: 2,
    coins: 35,
    accent: "#fbbf24",
  },
  {
    index: 5,
    id: "newyear",
    start: Date.UTC(2026, 11, 29),
    end: RNGMAS_END,
    name: "Midnight countdown",
    blurb: "Finish 100 online rolls before the year-end event closes.",
    metric: "rolls",
    goal: 100,
    hp: 1000000,
    ep: 200000,
    reward: "rngmas-newyear",
    boost: "boost-overdrive",
    charges: 3,
    coins: 50,
    accent: "#f0abfc",
  },
];

export const RNGMAS_TEMPORARY_THEMES = [
  {
    id: "rngmas-frost",
    label: "Frostfall",
    blurb: "Blue ice, white snow and winter light.",
  },
];

function rngmasNow(at) {
  return Number.isFinite(at) ? at : gameNow();
}

export function rngmasActive(at = gameNow()) {
  const now = rngmasNow(at);
  return now >= RNGMAS_START && now < RNGMAS_END;
}

export function rngmasWeekAt(at = gameNow()) {
  const now = rngmasNow(at);
  return (
    RNGMAS_WEEKS.find((week) => now >= week.start && now < week.end) ?? null
  );
}

export function rngmasWeekById(id) {
  return RNGMAS_WEEKS.find((week) => week.id === id) ?? null;
}

export function adventDoorAt(day, at = gameNow()) {
  const now = rngmasNow(at);
  const open = RNGMAS_START + (day - 1) * DAY_MS;
  const closes = open + DAY_MS;
  return {
    day,
    open,
    closes,
    openNow: now >= open && now < closes,
    upcoming: now < open,
    missed: now >= closes,
  };
}

export function adventFinaleAt(at = gameNow()) {
  const now = rngmasNow(at);
  const open = RNGMAS_START + ADVENT_DAYS * DAY_MS;
  return {
    day: ADVENT_FINALE.day,
    open,
    closes: open + DAY_MS,
    openNow: now >= open && now < open + DAY_MS,
    upcoming: now < open,
    missed: now >= open + DAY_MS,
  };
}

export function rngmasStatus(at = gameNow()) {
  const now = rngmasNow(at);
  const active = now >= RNGMAS_START && now < RNGMAS_END;
  return {
    id: RNGMAS_ID,
    active,
    upcoming: now < RNGMAS_START,
    over: now >= RNGMAS_END,
    shown: now >= RNGMAS_ANNOUNCE_AT && now < RNGMAS_END,
    startsInMs: Math.max(0, RNGMAS_START - now),
    endsInMs: active ? Math.max(0, RNGMAS_END - now) : 0,
    start: RNGMAS_START,
    end: RNGMAS_END,
    now,
    week: rngmasWeekAt(now),
  };
}

export function rngmasDateLabel(timestamp, options = {}) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  });
}

export function rngmasRangeLabel() {
  return `${rngmasDateLabel(RNGMAS_START)} – ${rngmasDateLabel(RNGMAS_END, {
    year: "numeric",
  })}`;
}

export function golemStrikeFor(number) {
  if (!Number.isInteger(number) || number < 0 || number > 1000000)
    throw new Error("Invalid strike number");
  return {
    number,
    damage: number,
    multiplier: 1,
    tier: "common",
    label: "Number strike",
  };
}

export function winterRollTally(result) {
  const number = result.number;
  const digits = String(number);
  return {
    rolls: 1,
    even: number % 2 === 0 ? 1 : 0,
    ends5: number % 10 === 5 ? 1 : 0,
    contains0: digits.includes("0") ? 1 : 0,
  };
}

export function recordWinterRoll(record, result, at) {
  const week = rngmasWeekAt(at);
  if (!week) return record;
  record = recordWinterFestival(record, result, at);
  record = {
    ...record,
    snowcoins: Math.min(SNOWCOIN_CAP, (record.snowcoins ?? 0) + 1),
    snowcoinsEarned: Math.min(
      Number.MAX_SAFE_INTEGER,
      (record.snowcoinsEarned ?? 0) + 1,
    ),
  };
  const previous = record.golems[week.id];
  if (previous.defeated) return record;
  if (week.metric === "damage") {
    if (!previous.armed) return record;
    return {
      ...record,
      golems: {
        ...record.golems,
        [week.id]: {
          ...previous,
          armed: false,
          damage: Math.min(
            week.hp,
            previous.damage + golemStrikeFor(result.number).damage,
          ),
          strikes: previous.strikes + 1,
          lastNumber: result.number,
        },
      },
    };
  }
  const count = Math.min(
    week.goal,
    (previous.count ?? 0) + (winterRollTally(result)[week.metric] ?? 0),
  );
  return {
    ...record,
    golems: { ...record.golems, [week.id]: { ...previous, count } },
  };
}

export function golemWeekForAction(action) {
  return rngmasWeekById(action?.golemId) ?? null;
}

export function emptyRngmas() {
  return {
    id: RNGMAS_ID,
    claimed: [],
    finale: false,
    snowcoins: 0,
    festival: emptyWinterFestival(),
    snowcoinsEarned: 0,
    snowcoinsExchanged: 0,
    marketPurchases: [],
    golems: Object.fromEntries(
      RNGMAS_WEEKS.map((week) => [
        week.id,
        {
          damage: 0,
          defeated: false,
          strikes: 0,
          count: 0,
          armed: false,
          lastNumber: null,
        },
      ]),
    ),
  };
}

const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

export function parseRngmas(value, receipts = {}) {
  const owned = Array.isArray(receipts.owned) ? receipts.owned : [];
  const stored = !!value && typeof value === "object" && !Array.isArray(value);
  const claimed =
    stored && Array.isArray(value.claimed)
      ? [
          ...new Set(
            value.claimed.filter(
              (day) => Number.isInteger(day) && day >= 1 && day <= ADVENT_DAYS,
            ),
          ),
        ].sort((a, b) => a - b)
      : [];
  const finale =
    (stored && value.finale === true) ||
    owned.includes(RNGMAS_COSMETICS_BY_ID.get(ADVENT_FINALE.aura)?.id);
  const golems = {};
  const storedGolems =
    stored && value.golems && typeof value.golems === "object"
      ? value.golems
      : {};
  for (const week of RNGMAS_WEEKS) {
    const entry = storedGolems[week.id];
    const record =
      entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    const damage = validCount(record.damage)
      ? Math.min(record.damage, week.hp)
      : 0;
    const strikes = validCount(record.strikes) ? record.strikes : 0;
    golems[week.id] = {
      damage,
      strikes,
      count: validCount(record.count)
        ? Math.min(
            record.count,
            week.id === "ember" ? Math.max(12, week.goal) : week.goal,
          )
        : 0,
      armed:
        week.metric === "damage" &&
        record.armed === true &&
        record.defeated !== true,
      lastNumber:
        validCount(record.lastNumber) && record.lastNumber <= 1000000
          ? record.lastNumber
          : null,
      defeated:
        record.defeated === true ||
        (!("count" in record) && !("armed" in record) && damage >= week.hp) ||
        owned.includes(week.reward),
    };
  }
  const snowcoinsEarned = validCount(value?.snowcoinsEarned)
    ? value.snowcoinsEarned
    : 0;
  const snowcoins = validCount(value?.snowcoins)
    ? Math.min(value.snowcoins, snowcoinsEarned, SNOWCOIN_CAP)
    : 0;
  const snowcoinsExchanged = validCount(value?.snowcoinsExchanged)
    ? Math.min(value.snowcoinsExchanged, SNOWCOIN_EXCHANGE_CAP)
    : 0;
  const marketPurchases = Array.isArray(value?.marketPurchases)
    ? [
        ...new Set(
          value.marketPurchases.filter((id) =>
            WINTER_MARKET.some((item) => item.id === id),
          ),
        ),
      ]
    : [];
  for (const item of WINTER_MARKET)
    if (
      item.aura &&
      owned.includes(item.aura) &&
      !marketPurchases.includes(item.id)
    )
      marketPurchases.push(item.id);
  return {
    id: RNGMAS_ID,
    festival: parseWinterFestival(value?.festival, owned),
    claimed,
    finale,
    golems,
    snowcoins,
    snowcoinsEarned,
    snowcoinsExchanged,
    marketPurchases,
  };
}

export function rngmasRewardIds(record) {
  const ids = [];
  for (const mission of [...WINTER_SPECIAL_TASKS, ...WINTER_LIVE_EVENTS]) {
    const claimed = mission.start
      ? record?.festival?.live?.[mission.id]?.claimed
      : record?.festival?.claimed?.includes(mission.id);
    const reward = record?.festival?.rewardClaims?.includes(mission.id)
      ? mission.reward
      : mission.legacyReward;
    if (claimed && reward) ids.push(reward);
  }
  for (const item of WINTER_MARKET)
    if (
      (item.aura || item.cosmetic) &&
      record?.marketPurchases?.includes(item.id)
    )
      ids.push(item.aura || item.cosmetic);
  for (const day of record?.claimed ?? []) {
    const door = ADVENT_DOORS.find((entry) => entry.day === day);
    if (door?.aura) ids.push(door.aura);
  }
  if (record?.finale) ids.push(ADVENT_FINALE.aura);
  for (const week of RNGMAS_WEEKS)
    if (record?.golems?.[week.id]?.defeated) ids.push(week.reward);
  return [...new Set(ids)];
}

export function adventRewardFor(day) {
  if (day === ADVENT_FINALE.day)
    return {
      day,
      aura: ADVENT_FINALE.aura,
      item: RNGMAS_COSMETICS_BY_ID.get(ADVENT_FINALE.aura),
    };
  const door = ADVENT_DOORS.find((entry) => entry.day === day);
  if (!door) return null;
  return {
    day,
    ep: door.ep ?? 0,
    aura: door.aura ?? null,
    item: door.aura ? RNGMAS_COSMETICS_BY_ID.get(door.aura) : null,
  };
}

export function adventClaimableDays(record, at = gameNow()) {
  const claimed = new Set(record?.claimed ?? []);
  const days = [];
  for (let day = 1; day <= ADVENT_DAYS; day += 1) {
    if (claimed.has(day)) continue;
    if (adventDoorAt(day, at).openNow) days.push(day);
  }
  return days;
}

export function golemProgress(record, week) {
  const entry = record?.golems?.[week.id] ?? {
    damage: 0,
    defeated: false,
    strikes: 0,
  };
  return {
    ...entry,
    damage: Math.min(entry.damage, week.hp),
    remaining: Math.max(0, week.hp - entry.damage),
    fraction: Math.min(1, entry.damage / week.hp),
  };
}

export function winterChapterCount(record, week) {
  if (week.metric === "purchases") return record?.marketPurchases?.length ?? 0;
  if (week.metric === "exchanged") return record?.snowcoinsExchanged ?? 0;
  const entry = record?.golems?.[week.id];
  return week.metric === "damage" ? (entry?.damage ?? 0) : (entry?.count ?? 0);
}

// Keep Tasks and the global ready indicator in sync with expiring event claims.
export function winterReadyCount(record, at = gameNow()) {
  const status = rngmasStatus(at);
  if (!status.active) return 0;
  const festival = record?.festival;
  let ready = [...WINTER_SPECIAL_TASKS, ...WINTER_LIVE_EVENTS].filter(
    (mission) => {
      const claimed = mission.start
        ? festival?.live?.[mission.id]?.claimed
        : festival?.claimed?.includes(mission.id);
      return (
        !claimed &&
        (!mission.start || (at >= mission.start && at < mission.end)) &&
        winterFestivalCount(record, mission) >= mission.goal
      );
    },
  ).length;
  const week = status.week;
  if (
    week &&
    !record?.golems?.[week.id]?.defeated &&
    winterChapterCount(record, week) >= week.goal
  )
    ready++;
  return ready;
}
