import { themeForStart } from "./season-config.js";

export const BATTLE_PASS_FIRST_START = Date.UTC(2026, 10, 16, 0, 0, 0);
export const BATTLE_PASS_SEASON_MS = 28 * 24 * 60 * 60 * 1000;
export const BATTLE_PASS_LEVELS = 30;
export const BPEP_PER_LEVEL = 500;
export const BATTLE_PASS_MAX_XP = BATTLE_PASS_LEVELS * BPEP_PER_LEVEL;
export const BATTLE_PASS_PREMIUM_PRICE = 2_000_000;
export const BATTLE_PASS_ARCHIVE_LIMIT = 24;

const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_AT = Number(import.meta.env?.VITE_BATTLE_PASS_PREVIEW_AT ?? 0);
const PREVIEW_OFFSET =
  import.meta.env?.DEV && Number.isFinite(PREVIEW_AT) && PREVIEW_AT > 0
    ? PREVIEW_AT - Date.now()
    : 0;

const clampIndex = (index) => {
  const value = Number.isFinite(index) ? Math.floor(index) : 1;
  return Math.max(1, value);
};

export function seasonStartFor(index) {
  return (
    BATTLE_PASS_FIRST_START + (clampIndex(index) - 1) * BATTLE_PASS_SEASON_MS
  );
}

// A season wears the theme of the month it opens in. Names come from
// season-config.js, so editing a month there renames every season that starts
// in it. The season number stays unique, so a returning name is never ambiguous.
export function passSeasonIdentity(index) {
  const number = clampIndex(index);
  const start = seasonStartFor(number);
  const theme = themeForStart(start);
  return {
    ...theme,
    number,
    month: new Date(start).getUTCMonth() + 1,
    lap: Math.ceil(number / 12),
  };
}

export function passSeasonName(index) {
  return passSeasonIdentity(index).name;
}

export const BATTLE_PASS_FAMILY = {
  id: "battle-pass",
  label: "Battle Pass",
  blurb: "Season rewards earned with BPEP. Kept forever once claimed.",
  font: '"Space Mono", monospace',
  tracking: "0.08em",
  casing: "uppercase",
  weight: 700,
  eventOnly: true,
};

export const BATTLE_PASS_VARIANT = {
  id: "pass-axolotl",
  kind: "pet-variant",
  petId: "axolotl",
  name: "Prism Axolotl",
  family: "battle-pass",
  eventOnly: true,
  passReward: true,
  price: 0,
  swatch: ["#f0abfc", "#22d3ee"],
  icon: "prism",
  description:
    "A permanent Battle Pass look for the Comet Axolotl. Cosmetic only; the companion bonus is unchanged.",
};

export const BATTLE_PASS_COSMETICS = [
  {
    id: "pass-signal",
    kind: "aura",
    name: "Signal Flare",
    family: "battle-pass",
    eventOnly: true,
    passReward: true,
    swatch: ["#7dd3fc", "#0284c7"],
    icon: "circuit",
    description:
      "A free-track season aura: a clean blue signal with a bright carrier line. Cosmetic only.",
  },
  {
    id: "pass-prism",
    kind: "aura",
    name: "Prism Circuit",
    family: "battle-pass",
    eventOnly: true,
    passReward: true,
    swatch: ["#f0abfc", "#6366f1"],
    icon: "prism",
    description:
      "The premium-track season aura: split colour through a precise circuit. Cosmetic only.",
  },
];

// Consumable boosts. Each charge runs for its own window once activated and
// multiplies banked EP from rolls; nothing else in the economy changes.
export const PASS_BOOSTS = [
  {
    id: "boost-spark",
    name: "Spark Injector",
    mult: 1.5,
    minutes: 15,
    blurb: "×1.5 banked EP for 15 minutes.",
  },
  {
    id: "boost-surge",
    name: "Surge Capacitor",
    mult: 2,
    minutes: 10,
    blurb: "×2 banked EP for 10 minutes.",
  },
  {
    id: "boost-overdrive",
    name: "Overdrive Cell",
    mult: 2.5,
    minutes: 5,
    blurb: "×2.5 banked EP for 5 minutes.",
  },
];
const BOOST_BY_ID = new Map(PASS_BOOSTS.map((boost) => [boost.id, boost]));

// A charge can also be bought with EP, one per day, so a boost is never a
// lottery only three levels can win.
export const PASS_BOOST_PRICE = 250_000;
export const PASS_BOOST_BUY_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function boostBuyStatus(boosts, at = Date.now()) {
  const last = Number.isSafeInteger(boosts?.boughtAt) ? boosts.boughtAt : 0;
  return {
    price: PASS_BOOST_PRICE,
    waitMs: Math.max(0, last + PASS_BOOST_BUY_INTERVAL_MS - at),
  };
}

export function boughtBoost(boosts, id, at = Date.now()) {
  const boost = passBoostById(id);
  if (!boost) return boosts;
  return {
    ...grantBoost(boosts, id, 1, at),
    boughtAt: at,
  };
}

export function passBoostById(id) {
  return BOOST_BY_ID.get(id) ?? null;
}

// Levels that hand out a boost charge on top of their EP. The boost is an extra
// reward, never a replacement: every level keeps the EP it always paid.
export const PASS_BOOST_GRANTS = {
  free: [
    { level: 5, id: "boost-spark", charges: 1 },
    { level: 15, id: "boost-surge", charges: 1 },
    { level: 25, id: "boost-overdrive", charges: 1 },
  ],
  premium: [
    { level: 5, id: "boost-spark", charges: 2 },
    { level: 15, id: "boost-surge", charges: 2 },
    { level: 25, id: "boost-overdrive", charges: 2 },
  ],
};

function boostGrant(track, level) {
  const entry = PASS_BOOST_GRANTS[track].find((grant) => grant.level === level);
  if (!entry) return null;
  const boost = passBoostById(entry.id);
  return {
    id: boost.id,
    name: boost.name,
    charges: entry.charges,
    minutes: boost.minutes,
    mult: boost.mult,
  };
}

const FREE_EP = [
  5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 0, 60000, 70000,
  80000, 90000, 100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000,
  180000, 190000, 200000, 210000, 220000, 230000, 240000, 250000,
];
const PREMIUM_EP = [
  15000, 25000, 40000, 55000, 70000, 85000, 100000, 120000, 140000, 160000,
  180000, 200000, 220000, 240000, 260000, 280000, 300000, 320000, 340000,
  360000, 380000, 0, 420000, 440000, 460000, 480000, 500000, 520000, 540000, 0,
];

export const BATTLE_PASS_REWARDS = Array.from(
  { length: BATTLE_PASS_LEVELS },
  (_, index) => {
    const level = index + 1;
    const free =
      level === 10
        ? {
            kind: "aura",
            id: "pass-signal",
            name: "Signal Flare",
            repeatEP: 100000,
          }
        : { kind: "ep", ep: FREE_EP[index] };
    const premium =
      level === 30
        ? {
            kind: "aura",
            id: "pass-prism",
            name: "Prism Circuit",
            repeatEP: 250000,
          }
        : level === 20
          ? {
              kind: "pet-variant",
              id: "pass-axolotl",
              name: "Prism Axolotl",
              repeatEP: 150000,
            }
          : { kind: "ep", ep: PREMIUM_EP[index] };
    // Boosts ride along with the EP, so a level never pays less than before.
    for (const [track, reward] of [
      ["free", free],
      ["premium", premium],
    ]) {
      const boost = reward.kind === "ep" ? boostGrant(track, level) : null;
      if (boost) reward.boost = boost;
    }
    return { level, free, premium };
  },
);

export const PASS_METRICS = [
  "rolls",
  "rare",
  "epic",
  "banked",
  "badges",
  "discovered",
  "skills",
  "claims",
  "high",
  "trash",
];

export const PASS_ACTIVE = { daily: 3, weekly: 2, season: 4 };
export const PASS_CADENCES = ["daily", "weekly", "season"];
export const PASS_DAILY_REROLLS = 1;

export const PASS_MISSIONS = [
  {
    id: "pass-daily-rolls",
    cadence: "daily",
    title: "Roll 5 numbers",
    detail: "Online rolls count, whatever they score.",
    metric: "rolls",
    goal: 5,
    reward: 100,
  },
  {
    id: "pass-daily-rolls-12",
    cadence: "daily",
    title: "Roll 12 numbers",
    detail: "A longer sitting, still one roll at a time.",
    metric: "rolls",
    goal: 12,
    reward: 150,
  },
  {
    id: "pass-daily-rare",
    cadence: "daily",
    title: "Roll a Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY.",
    metric: "rare",
    goal: 1,
    reward: 125,
  },
  {
    id: "pass-daily-badges",
    cadence: "daily",
    title: "Collect 100 badges across rolls",
    detail: "Every badge on every paid number counts.",
    metric: "badges",
    goal: 100,
    reward: 125,
  },
  {
    id: "pass-daily-bank",
    cadence: "daily",
    title: "Bank 25,000 EP from rolls",
    detail: "Wallet bonuses count; task and pass EP do not.",
    metric: "banked",
    goal: 25000,
    reward: 100,
  },
  {
    id: "pass-daily-skill",
    cadence: "daily",
    title: "Fire a skill once",
    detail: "Any equipped skill that fires on a roll counts.",
    metric: "skills",
    goal: 1,
    reward: 125,
  },
  {
    id: "pass-daily-high",
    cadence: "daily",
    title: "Roll 3 numbers of 900,000 or more",
    detail: "The number itself, not its EP.",
    metric: "high",
    goal: 3,
    reward: 100,
  },
  {
    id: "pass-daily-trash",
    cadence: "daily",
    title: "Roll 5 Trash numbers",
    detail: "Bad luck still moves the pass.",
    metric: "trash",
    goal: 5,
    reward: 100,
  },
  {
    id: "pass-weekly-rolls",
    cadence: "weekly",
    title: "Roll 60 numbers",
    detail: "Online rolls from Monday to Monday.",
    metric: "rolls",
    goal: 60,
    reward: 500,
  },
  {
    id: "pass-weekly-rare",
    cadence: "weekly",
    title: "Roll 5 Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY.",
    metric: "rare",
    goal: 5,
    reward: 500,
  },
  {
    id: "pass-weekly-bank",
    cadence: "weekly",
    title: "Bank 500,000 EP from rolls",
    detail: "Everything rolls pay into your wallet.",
    metric: "banked",
    goal: 500000,
    reward: 600,
  },
  {
    id: "pass-weekly-badges",
    cadence: "weekly",
    title: "Collect 400 badges across rolls",
    detail: "Found before or not, every badge counts.",
    metric: "badges",
    goal: 400,
    reward: 500,
  },
  {
    id: "pass-weekly-skills",
    cadence: "weekly",
    title: "Fire a skill on 8 rolls",
    detail: "Each roll counts once.",
    metric: "skills",
    goal: 8,
    reward: 600,
  },
  {
    id: "pass-weekly-discover",
    cadence: "weekly",
    title: "Discover 10 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 10,
    reward: 600,
  },
  {
    id: "pass-season-rolls",
    cadence: "season",
    title: "Roll 250 numbers this season",
    detail: "A season-long trail of online rolls.",
    metric: "rolls",
    goal: 250,
    reward: 1000,
  },
  {
    id: "pass-season-bank",
    cadence: "season",
    title: "Bank 5,000,000 EP this season",
    detail: "Roll income only, bonuses included.",
    metric: "banked",
    goal: 5000000,
    reward: 1500,
  },
  {
    id: "pass-season-badges",
    cadence: "season",
    title: "Collect 2,500 badges this season",
    detail: "Every badge on every paid number.",
    metric: "badges",
    goal: 2500,
    reward: 1500,
  },
  {
    id: "pass-season-discover",
    cadence: "season",
    title: "Discover 40 new badges this season",
    detail: "New discoveries across your cycles.",
    metric: "discovered",
    goal: 40,
    reward: 2000,
  },
  {
    id: "pass-season-boost",
    cadence: "season",
    title: "Finish 100 pass missions this season",
    detail: "Any cadence counts. Pays a Surge Capacitor charge.",
    metric: "claims",
    goal: 100,
    reward: 1000,
    boost: { id: "boost-surge", charges: 1 },
  },
];

const MISSION_BY_ID = new Map(
  PASS_MISSIONS.map((mission) => [mission.id, mission]),
);
const REWARD_KEYS = new Set(
  BATTLE_PASS_REWARDS.flatMap(({ level }) => [
    `free-${level}`,
    `premium-${level}`,
  ]),
);
const SEASON_RE = /^season-[1-9]\d*$/;
const PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;
const validAmount = (value) => Number.isSafeInteger(value) && value >= 0;

export function emptyBoosts() {
  return { charges: {}, active: [], boughtAt: 0 };
}

export function boostCharges(boosts, id) {
  const value = boosts?.charges?.[id];
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

// A window stays listed until the client clock passes it; saves keep their own
// copy so a slow or fast device never silently deletes a charge in progress.
export function activeBoosts(boosts, at = Date.now()) {
  const list = Array.isArray(boosts?.active) ? boosts.active : [];
  return list
    .filter(
      (entry) =>
        entry &&
        passBoostById(entry.id) &&
        Number.isSafeInteger(entry.until) &&
        entry.until > at,
    )
    .map((entry) => ({ ...passBoostById(entry.id), until: entry.until }));
}

export function boostMultiplier(boosts, at = Date.now()) {
  return activeBoosts(boosts, at).reduce(
    (total, boost) => total * boost.mult,
    1,
  );
}

// Reading a save must never throw away a window just because it is measured
// against another clock; only a window that clearly expired is dropped.
function pruneBoosts(boosts, at, keepExpired = false) {
  const active = (Array.isArray(boosts?.active) ? boosts.active : []).filter(
    (entry) =>
      entry &&
      passBoostById(entry.id) &&
      Number.isSafeInteger(entry.until) &&
      (keepExpired || entry.until > at),
  );
  return { charges: { ...(boosts?.charges ?? {}) }, active };
}

export function grantBoost(boosts, id, charges, at = Date.now()) {
  const boost = passBoostById(id);
  if (!boost || !Number.isSafeInteger(charges) || charges < 1) return boosts;
  const clean = pruneBoosts(boosts, at, true);
  return {
    ...clean,
    charges: {
      ...clean.charges,
      [id]: Math.min(99, boostCharges(clean, id) + charges),
    },
  };
}

export function activateBoost(boosts, id, at) {
  const boost = passBoostById(id);
  if (!boost) throw new Error("That boost does not exist.");
  const clean = pruneBoosts(boosts, at);
  if (boostCharges(clean, id) < 1)
    throw new Error("You have no charge of that boost.");
  const running = clean.active[0] ?? null;
  if (running && running.id !== id)
    throw new Error("A different boost is already running.");
  const charges = { ...clean.charges };
  if (boostCharges(clean, id) <= 1) delete charges[id];
  else charges[id] = boostCharges(clean, id) - 1;
  return {
    charges,
    active: [
      {
        id,
        until: (running?.until ?? at) + boost.minutes * 60 * 1000,
      },
    ],
  };
}

export function parseBoosts(value, at = Date.now()) {
  if (value == null) return { boosts: emptyBoosts(), repaired: false };
  if (typeof value !== "object" || Array.isArray(value))
    return { boosts: emptyBoosts(), repaired: true };
  let repaired = false;
  const charges = {};
  const stored = value.charges;
  if (
    stored !== undefined &&
    (typeof stored !== "object" || Array.isArray(stored))
  )
    repaired = true;
  else
    for (const [id, amount] of Object.entries(stored ?? {})) {
      if (!passBoostById(id)) {
        repaired = true;
        continue;
      }
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99) {
        if (amount !== 0) repaired = true;
        continue;
      }
      if (amount > 0) charges[id] = amount;
    }
  const active = [];
  if (value.active !== undefined && !Array.isArray(value.active))
    repaired = true;
  else
    for (const entry of value.active ?? []) {
      if (
        !entry ||
        typeof entry !== "object" ||
        !passBoostById(entry.id) ||
        !Number.isSafeInteger(entry.until) ||
        entry.until <= 0 ||
        entry.until > 8640000000000000
      ) {
        repaired = true;
        continue;
      }
      // An expired window is normal bookkeeping, not damage.
      if (active.length >= 1) {
        repaired = true;
        continue;
      }
      if (active.some((kept) => kept.id === entry.id)) {
        repaired = true;
        continue;
      }
      active.push({ id: entry.id, until: entry.until });
    }
  const boughtAt =
    Number.isSafeInteger(value.boughtAt) &&
    value.boughtAt > 0 &&
    value.boughtAt <= 8640000000000000
      ? value.boughtAt
      : 0;
  if (boughtAt !== (value.boughtAt ?? 0) && value.boughtAt !== undefined)
    repaired = true;
  return { boosts: { charges, active, boughtAt }, repaired };
}

export function passNow(at = Date.now()) {
  const value = Number.isFinite(at) ? at : Date.now();
  return PREVIEW_OFFSET ? value + PREVIEW_OFFSET : value;
}

export function battlePassSeason(at = Date.now()) {
  const now = passNow(at);
  const index = Math.max(
    0,
    Math.floor((now - BATTLE_PASS_FIRST_START) / BATTLE_PASS_SEASON_MS),
  );
  const start = BATTLE_PASS_FIRST_START + index * BATTLE_PASS_SEASON_MS;
  const end = start + BATTLE_PASS_SEASON_MS;
  const identity = passSeasonIdentity(index + 1);
  return {
    index: index + 1,
    id: `season-${index + 1}`,
    name: identity.name,
    theme: identity.theme,
    accent: identity.accent,
    month: identity.month,
    nextName: passSeasonName(index + 2),
    daysLong: BATTLE_PASS_SEASON_MS / DAY_MS,
    day: Math.min(
      BATTLE_PASS_SEASON_MS / DAY_MS,
      Math.floor((now - start) / DAY_MS) + 1,
    ),
    start,
    end,
    now,
    upcoming: now < BATTLE_PASS_FIRST_START,
    active: now >= BATTLE_PASS_FIRST_START && now < end,
    endsInMs: Math.max(0, end - now),
  };
}

export function seasonNumber(id) {
  const match = SEASON_RE.exec(String(id ?? ""));
  return match ? Number(id.slice(7)) : 0;
}

export function seasonLabel(id) {
  const number = seasonNumber(id);
  if (!number) return "Unstarted season";
  return `Season ${number} · ${passSeasonName(number)}`;
}

export function passLevelForXp(xp) {
  return Math.min(
    BATTLE_PASS_LEVELS,
    Math.floor(Math.max(0, xp) / BPEP_PER_LEVEL),
  );
}

export function passXpIntoLevel(xp) {
  const level = passLevelForXp(xp);
  return level >= BATTLE_PASS_LEVELS
    ? BPEP_PER_LEVEL
    : Math.max(0, xp) - level * BPEP_PER_LEVEL;
}

export function rewardKey(track, level) {
  return `${track}-${level}`;
}

export function passMissionById(id) {
  return MISSION_BY_ID.get(id) ?? null;
}

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function zeroCounts() {
  return Object.fromEntries(PASS_METRICS.map((metric) => [metric, 0]));
}

function emptySlot() {
  return {
    period: "",
    counts: zeroCounts(),
    claimed: [],
    swaps: [],
    rerolls: 0,
  };
}

export function emptyPassMissions() {
  return { daily: emptySlot(), weekly: emptySlot(), season: emptySlot() };
}

export function emptyBattlePass() {
  return {
    seasonId: "",
    xp: 0,
    premium: false,
    claimed: [],
    missions: emptyPassMissions(),
    boosts: emptyBoosts(),
    archive: [],
  };
}

function periodStart(cadence, at) {
  const date = new Date(at);
  let day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  if (cadence === "weekly") {
    const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
    day -= sinceMonday * DAY_MS;
  }
  return day;
}

export function passPeriodKey(cadence, at, seasonId = "") {
  if (cadence === "season") return seasonId;
  return new Date(periodStart(cadence, at)).toISOString().slice(0, 10);
}

export function passNextReset(cadence, at) {
  return periodStart(cadence, at) + (cadence === "weekly" ? 7 : 1) * DAY_MS;
}

function currentSlot(pass, cadence, at) {
  const seasonId = pass.seasonId || battlePassSeason(at).id;
  const period = passPeriodKey(cadence, at, seasonId);
  const stored = pass.missions?.[cadence];
  if (stored?.period === period) {
    return {
      ...stored,
      counts: { ...zeroCounts(), ...stored.counts },
      claimed: stored.claimed ?? [],
      swaps: stored.swaps ?? [],
      rerolls: stored.rerolls ?? 0,
    };
  }
  return { ...emptySlot(), period };
}

function dealt(pass, cadence, at) {
  const seasonId = pass.seasonId || battlePassSeason(at).id;
  const period = passPeriodKey(cadence, at, seasonId);
  return PASS_MISSIONS.filter((mission) => mission.cadence === cadence)
    .map((mission) => ({
      id: mission.id,
      rank: hash(`${seasonId}|${period}|${mission.id}`),
    }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1))
    .map((entry) => entry.id);
}

export function activePassMissionIds(pass, cadence, at) {
  const slot = currentSlot(pass, cadence, at);
  const active = dealt(pass, cadence, at).slice(0, PASS_ACTIVE[cadence]);
  for (const swap of slot.swaps) {
    const index = active.indexOf(swap.out);
    if (index !== -1) active[index] = swap.in;
  }
  return active;
}

export function activePassMissions(pass, cadence, at) {
  return activePassMissionIds(pass, cadence, at).map((id) =>
    MISSION_BY_ID.get(id),
  );
}

function progressOf(slot, mission) {
  const total = slot.counts[mission.metric] ?? 0;
  const swap = slot.swaps.find((entry) => entry.in === mission.id);
  return Math.max(0, total - (swap?.base ?? 0));
}

export function passMissionProgress(pass, mission, at) {
  const slot = currentSlot(pass, mission.cadence, at);
  const count = progressOf(slot, mission);
  const claimed = slot.claimed.includes(mission.id);
  const complete = count >= mission.goal;
  return {
    count,
    goal: mission.goal,
    complete,
    claimed,
    state: claimed ? "claimed" : complete ? "claimable" : "open",
  };
}

// Missions live on the Tasks page, so their readiness lights that tab.
export function passMissionReadyCount(pass, at) {
  if (!pass?.seasonId) return 0;
  if (pass.seasonId !== battlePassSeason(at).id) return 0;
  let ready = 0;
  for (const cadence of PASS_CADENCES) {
    for (const mission of activePassMissions(pass, cadence, at)) {
      if (passMissionProgress(pass, mission, at).state === "claimable") ready++;
    }
  }
  return ready;
}

// Rewards stay on the Pass page, so only their readiness lights that tab.
export function passReadyCount(pass, at) {
  if (!pass?.seasonId) return 0;
  let ready = 0;
  const level = passLevelForXp(pass.xp);
  for (const reward of BATTLE_PASS_REWARDS) {
    if (reward.level > level) continue;
    if (!pass.claimed.includes(rewardKey("free", reward.level))) ready++;
    if (
      pass.premium &&
      !pass.claimed.includes(rewardKey("premium", reward.level))
    )
      ready++;
  }
  return ready;
}

const addCapped = (total, amount) =>
  Math.min(Number.MAX_SAFE_INTEGER, (total ?? 0) + amount);

export function recordPassTally(pass, tally, at) {
  const season = battlePassSeason(at);
  if (!season.active || pass.seasonId !== season.id) return pass;
  const missions = { ...pass.missions };
  for (const cadence of PASS_CADENCES) {
    const stored = missions[cadence];
    const period = passPeriodKey(cadence, at, pass.seasonId);
    if (stored?.period > period) continue;
    const slot = currentSlot(pass, cadence, at);
    const counts = { ...slot.counts };
    for (const metric of PASS_METRICS)
      counts[metric] = addCapped(counts[metric], tally[metric] ?? 0);
    missions[cadence] = { ...slot, period, counts };
  }
  return { ...pass, missions };
}

export function claimPassMission(pass, id, at) {
  const mission = passMissionById(id);
  if (!mission) throw new Error("That pass mission does not exist.");
  const season = battlePassSeason(at);
  if (!season.active || pass.seasonId !== season.id)
    throw new Error("This pass season is not active.");
  if (!activePassMissionIds(pass, mission.cadence, at).includes(id))
    throw new Error("This mission is not on your pass list.");
  const slot = currentSlot(pass, mission.cadence, at);
  if (slot.claimed.includes(id))
    throw new Error("This pass mission is already claimed.");
  if (progressOf(slot, mission) < mission.goal)
    throw new Error("Finish this pass mission before claiming it.");
  // Every claim also counts towards the season's claim milestone.
  const seasonSlot = currentSlot(pass, "season", at);
  return {
    ...pass,
    xp: Math.min(BATTLE_PASS_MAX_XP, pass.xp + mission.reward),
    missions: {
      ...pass.missions,
      [mission.cadence]: { ...slot, claimed: [...slot.claimed, id] },
      season: {
        ...seasonSlot,
        counts: {
          ...seasonSlot.counts,
          claims: addCapped(seasonSlot.counts.claims ?? 0, 1),
        },
      },
    },
  };
}

export function rerollPassDaily(pass, id, at) {
  const mission = passMissionById(id);
  if (!mission || mission.cadence !== "daily")
    throw new Error("Only daily pass missions can be swapped.");
  const season = battlePassSeason(at);
  if (!season.active || pass.seasonId !== season.id)
    throw new Error("This pass season is not active.");
  const slot = currentSlot(pass, "daily", at);
  if (slot.rerolls >= PASS_DAILY_REROLLS)
    throw new Error("You already used today's free pass swap.");
  const active = activePassMissionIds(pass, "daily", at);
  if (!active.includes(id))
    throw new Error("This mission is not on your pass list.");
  if (slot.claimed.includes(id))
    throw new Error("A claimed mission cannot be swapped.");
  if (progressOf(slot, mission) >= mission.goal)
    throw new Error("Claim a finished mission instead of swapping it.");
  const used = new Set(slot.swaps.map((swap) => swap.out));
  const incoming = dealt(pass, "daily", at).find(
    (candidate) => !active.includes(candidate) && !used.has(candidate),
  );
  if (!incoming) throw new Error("No other daily pass mission is left.");
  const incomingMission = passMissionById(incoming);
  return {
    ...pass,
    missions: {
      ...pass.missions,
      daily: {
        ...slot,
        rerolls: slot.rerolls + 1,
        swaps: [
          ...slot.swaps,
          {
            out: id,
            in: incoming,
            base: slot.counts[incomingMission.metric] ?? 0,
          },
        ],
      },
    },
  };
}

export function passRewardState(pass, level, track) {
  const reward = BATTLE_PASS_REWARDS.find((entry) => entry.level === level)?.[
    track
  ];
  if (!reward) return "locked";
  const key = rewardKey(track, level);
  if (pass.claimed.includes(key)) return "claimed";
  if (track === "premium" && !pass.premium) return "premium-locked";
  if (passLevelForXp(pass.xp) < level) return "locked";
  return "claimable";
}

export function passRewardEP(reward, owned = []) {
  if (reward.kind === "ep") return reward.ep;
  return owned.includes(reward.id) ? reward.repeatEP : 0;
}

function parseSlot(value, cadence) {
  if (value == null) return { slot: emptySlot(), repaired: false };
  if (typeof value !== "object" || Array.isArray(value))
    return { slot: emptySlot(), repaired: true };
  const period =
    cadence === "season" ? String(value.period ?? "") : value.period;
  const periodOk =
    period === "" ||
    (cadence === "season" ? SEASON_RE.test(period) : PERIOD_RE.test(period));
  const readable =
    periodOk &&
    !!value.counts &&
    typeof value.counts === "object" &&
    Array.isArray(value.claimed) &&
    (value.swaps === undefined || Array.isArray(value.swaps)) &&
    (value.rerolls === undefined || validAmount(value.rerolls));
  if (!readable) return { slot: emptySlot(), repaired: true };
  let repaired = false;
  const counts = {};
  for (const metric of PASS_METRICS) {
    const amount = value.counts[metric];
    if (amount === undefined) counts[metric] = 0;
    else if (validAmount(amount)) counts[metric] = amount;
    else {
      counts[metric] = 0;
      repaired = true;
    }
  }
  const ids = PASS_MISSIONS.filter(
    (mission) => mission.cadence === cadence,
  ).map((mission) => mission.id);
  const claimed = [...new Set(value.claimed.filter((id) => ids.includes(id)))];
  if (claimed.length !== value.claimed.length) repaired = true;
  const swaps = [];
  for (const swap of value.swaps ?? []) {
    if (
      swap &&
      typeof swap === "object" &&
      ids.includes(swap.out) &&
      ids.includes(swap.in) &&
      swap.out !== swap.in &&
      validAmount(swap.base) &&
      !swaps.some((entry) => entry.out === swap.out || entry.in === swap.in)
    )
      swaps.push({ out: swap.out, in: swap.in, base: swap.base });
    else repaired = true;
  }
  const rerolls = Math.min(PASS_DAILY_REROLLS, value.rerolls ?? 0);
  if (rerolls !== (value.rerolls ?? 0)) repaired = true;
  return { slot: { period, counts, claimed, swaps, rerolls }, repaired };
}

export function parseBattlePass(value, at = Date.now()) {
  if (value == null) return { pass: emptyBattlePass(), repaired: false };
  if (typeof value !== "object" || Array.isArray(value))
    return { pass: emptyBattlePass(), repaired: true };
  let repaired = false;
  const seasonId = SEASON_RE.test(value.seasonId ?? "") ? value.seasonId : "";
  if (seasonId !== (value.seasonId ?? "")) repaired = true;
  const xp = validAmount(value.xp) ? Math.min(BATTLE_PASS_MAX_XP, value.xp) : 0;
  if (xp !== value.xp) repaired = true;
  const premium = value.premium === true;
  if (premium !== value.premium && value.premium !== undefined) repaired = true;
  const claimed = Array.isArray(value.claimed)
    ? [...new Set(value.claimed.filter((key) => REWARD_KEYS.has(key)))]
    : [];
  if (!Array.isArray(value.claimed) || claimed.length !== value.claimed.length)
    repaired = true;
  const missions = {};
  for (const cadence of PASS_CADENCES) {
    const read = parseSlot(value.missions?.[cadence], cadence);
    missions[cadence] = read.slot;
    if (read.repaired) repaired = true;
  }
  const boostRead = parseBoosts(value.boosts, at);
  if (boostRead.repaired) repaired = true;
  const archive = [];
  if (Array.isArray(value.archive)) {
    for (const entry of value.archive.slice(-BATTLE_PASS_ARCHIVE_LIMIT)) {
      if (
        entry &&
        typeof entry === "object" &&
        SEASON_RE.test(entry.seasonId ?? "") &&
        validAmount(entry.xp) &&
        typeof entry.premium === "boolean" &&
        validAmount(entry.claimed)
      )
        archive.push({
          seasonId: entry.seasonId,
          xp: Math.min(BATTLE_PASS_MAX_XP, entry.xp),
          premium: entry.premium,
          claimed: entry.claimed,
        });
      else repaired = true;
    }
  } else if (value.archive !== undefined) repaired = true;
  return {
    pass: {
      seasonId,
      xp,
      premium,
      claimed,
      missions,
      boosts: boostRead.boosts,
      archive,
    },
    repaired,
  };
}

export function passDateLabel(at) {
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
