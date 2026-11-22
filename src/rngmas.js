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
export const ADVENT_CATCH_UP_DAYS = 3;

export const GOLEM_SMASH_COST = 25000;
export const GOLEM_SMASH_BASE_DAMAGE = 20000;

export const RNGMAS_FAMILY = {
  id: "rngmas",
  label: "RNGmas 2026",
  blurb: "Winter lights, advent doors and the golems of the season.",
  font: '"Space Mono", monospace',
  tracking: "0.12em",
  casing: "uppercase",
  weight: 700,
  eventOnly: true,
};

export const RNGMAS_COSMETICS = [
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
      "The Frost Golem's reward: deep ice with a bright frost rim. Kept forever, never sold.",
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
      "The Ember Golem's reward: coal black with a warm ember glow. Kept forever, never sold.",
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
      "The Hollow Golem's reward: a cold teal shell around an empty centre. Kept forever, never sold.",
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
      "The RNGmas Golem's reward: dark stone with a golden core. Kept forever, never sold.",
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
      "The New Year Golem's reward: midnight blue with a violet spark. Kept forever, never sold.",
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

export const RNGMAS_COSMETICS_BY_ID = new Map(
  RNGMAS_COSMETICS.map((item) => [item.id, item]),
);

export const ADVENT_DOORS = [
  { day: 1, ep: 25000 },
  { day: 2, ep: 50000 },
  { day: 3, ep: 75000 },
  { day: 4, ep: 100000 },
  { day: 5, ep: 150000 },
  { day: 6, ep: 200000 },
  { day: 7, ep: 250000 },
  { day: 8, ep: 300000 },
  { day: 9, ep: 350000 },
  { day: 10, ep: 400000 },
  { day: 11, ep: 450000 },
  { day: 12, ep: 500000 },
  { day: 13, ep: 600000 },
  { day: 14, ep: 700000 },
  { day: 15, ep: 800000 },
  { day: 16, ep: 900000 },
  { day: 17, ep: 1000000 },
  { day: 18, ep: 1100000 },
  { day: 19, ep: 1200000 },
  { day: 20, ep: 1300000 },
  { day: 21, ep: 1400000 },
  { day: 22, ep: 1500000 },
  { day: 23, ep: 1750000 },
  { day: 24, aura: "rngmas-gingerbread" },
];

export const ADVENT_FINALE = { day: 25, aura: "rngmas-star" };

export const RNGMAS_WEEKS = [
  {
    index: 1,
    id: "frost",
    start: Date.UTC(2026, 11, 1),
    end: Date.UTC(2026, 11, 8),
    name: "Frost Golem",
    blurb: "A frozen giant wakes with the first door.",
    hp: 750000,
    reward: "rngmas-frost",
    accent: "#7dd3fc",
  },
  {
    index: 2,
    id: "ember",
    start: Date.UTC(2026, 11, 8),
    end: Date.UTC(2026, 11, 15),
    name: "Ember Golem",
    blurb: "A coal-black giant carries the second week.",
    hp: 1500000,
    reward: "rngmas-ember",
    accent: "#fb923c",
  },
  {
    index: 3,
    id: "hollow",
    start: Date.UTC(2026, 11, 15),
    end: Date.UTC(2026, 11, 22),
    name: "Hollow Golem",
    blurb: "An empty shell of ice guards the third week.",
    hp: 3000000,
    reward: "rngmas-hollow",
    accent: "#5eead4",
  },
  {
    index: 4,
    id: "golem",
    start: Date.UTC(2026, 11, 22),
    end: Date.UTC(2026, 11, 29),
    name: "RNGmas Golem",
    blurb: "The golden giant of Christmas week.",
    hp: 6000000,
    reward: "rngmas-golem",
    accent: "#fbbf24",
  },
  {
    index: 5,
    id: "newyear",
    start: Date.UTC(2026, 11, 29),
    end: Date.UTC(2027, 0, 2),
    name: "New Year Golem",
    blurb: "A midnight giant closes the season.",
    hp: 10000000,
    reward: "rngmas-newyear",
    accent: "#f0abfc",
  },
];

export const RNGMAS_TEMPORARY_THEMES = [
  {
    id: "rngmas-lights",
    label: "RNGmas Lights",
    blurb: "Warm lights, red ribbon and gold.",
  },
  {
    id: "rngmas-frost",
    label: "Frostfall",
    blurb: "Blue ice and white snow.",
  },
];

const STRIKE_TABLE = [
  { chance: 0.5, multiplier: 1, tier: "common", label: "Chip" },
  { chance: 0.25, multiplier: 2, tier: "uncommon", label: "Crack" },
  { chance: 0.12, multiplier: 3, tier: "rare", label: "Break" },
  { chance: 0.07, multiplier: 5, tier: "epic", label: "Shatter" },
  { chance: 0.035, multiplier: 10, tier: "anomaly", label: "Smash" },
  { chance: 0.015, multiplier: 25, tier: "mythic", label: "Crushing blow" },
  { chance: 0.008, multiplier: 50, tier: "godly", label: "Golem breaker" },
  { chance: 0.002, multiplier: 100, tier: "godly", label: "RNGmas miracle" },
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
  const closes = open + ADVENT_CATCH_UP_DAYS * DAY_MS;
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
    closes: RNGMAS_END,
    openNow: now >= open && now < RNGMAS_END,
    upcoming: now < open,
    missed: now >= RNGMAS_END,
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

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

export function golemStrikeFor(seedKey, strikeIndex) {
  const seed = hashString(`${seedKey}:${strikeIndex}`);
  const roll = (seed % 1000000) / 1000000;
  let cursor = 0;
  let chosen = STRIKE_TABLE.at(-1);
  for (const entry of STRIKE_TABLE) {
    cursor += entry.chance;
    if (roll < cursor) {
      chosen = entry;
      break;
    }
  }
  return {
    multiplier: chosen.multiplier,
    tier: chosen.tier,
    label: chosen.label,
    damage: GOLEM_SMASH_BASE_DAMAGE * chosen.multiplier,
    roll,
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
    golems: Object.fromEntries(
      RNGMAS_WEEKS.map((week) => [
        week.id,
        { damage: 0, defeated: false, strikes: 0 },
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
      defeated:
        record.defeated === true ||
        damage >= week.hp ||
        owned.includes(week.reward),
    };
  }
  return { id: RNGMAS_ID, claimed, finale, golems };
}

export function rngmasRewardIds(record) {
  const ids = [];
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
