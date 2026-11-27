export const WINTER_EXCLUSIVES = [
  ["lantern", "Lantern Keeper", "#451a03", "#fbbf24", "bell"],
  ["ribbon", "Ribbon Runner", "#4c0519", "#fda4af", "gift"],
  ["prism", "Ice Prism", "#172554", "#a5f3fc", "snow"],
  ["meteor", "Starfall Snow", "#312e81", "#c4b5fd", "star"],
  ["carol", "Carol Circuit", "#064e3b", "#6ee7b7", "bell"],
  ["parcel", "Northbound Parcel", "#7c2d12", "#fdba74", "gift"],
  ["midnight", "Midnight Wish", "#1e1b4b", "#f0abfc", "star"],
  ["velvet", "Velvet Noel", "#4c0519", "#fbbf24", "gift"],
  ["aurora", "Aurora Postcard", "#042f2e", "#67e8f9", "snow"],
  ["crown", "Solstice Crown", "#312e81", "#fde68a", "star"],
].map(([key, name, a, b, art]) => ({
  id: `rngmas-${key}`,
  name,
  kind: "aura",
  family: "rngmas",
  eventOnly: true,
  limited: true,
  swatch: [a, b],
  icon: "star",
  winterArt: art,
  description: `An exclusive RNGmas 2026 aura. ${name} stays in your collection after winter ends.`,
}));

export const WINTER_SPECIAL_TASKS = [
  {
    id: "lantern-run",
    name: "Keep the lanterns lit",
    description: "Settle 150 main online rolls during RNGmas.",
    metric: "rolls",
    goal: 150,
    reward: "rngmas-lantern",
    coins: 15,
  },
  {
    id: "ribbon-hunt",
    name: "Find the lucky ribbons",
    description: "Roll 25 main online numbers containing a 7.",
    metric: "seven",
    goal: 25,
    reward: "rngmas-ribbon",
    coins: 20,
  },
  {
    id: "prism-set",
    name: "Build the ice prism",
    description: "Collect all ten final digits across your main online rolls.",
    metric: "digits",
    goal: 10,
    reward: "rngmas-prism",
    coins: 25,
  },
];
export const WINTER_LIVE_EVENTS = [
  {
    id: "meteor-watch",
    name: "Meteor watch",
    description:
      "Catch 30 even-numbered main online rolls while the sky is open.",
    metric: "even",
    goal: 30,
    start: Date.UTC(2026, 11, 4, 18),
    end: Date.UTC(2026, 11, 7),
    reward: "rngmas-meteor",
    coins: 20,
  },
  {
    id: "bell-relay",
    name: "Bell relay",
    description: "Tune eight different final digits during this live window.",
    metric: "digits",
    goal: 8,
    start: Date.UTC(2026, 11, 11, 18),
    end: Date.UTC(2026, 11, 14),
    reward: "rngmas-carol",
    coins: 25,
  },
  {
    id: "gift-drive",
    name: "Northbound gift drive",
    description:
      "Send four parcels. Each parcel costs 5 Snowcoins; donations cannot be refunded.",
    metric: "donations",
    goal: 4,
    start: Date.UTC(2026, 11, 18, 18),
    end: Date.UTC(2026, 11, 21),
    reward: "rngmas-parcel",
    coins: 0,
  },
  {
    id: "midnight-wishes",
    name: "Midnight wishes",
    description:
      "Land ten main online rolls of 500,000 or more before the window closes.",
    metric: "high",
    goal: 10,
    start: Date.UTC(2026, 11, 31, 18),
    end: Date.UTC(2027, 0, 1, 2),
    reward: "rngmas-midnight",
    coins: 35,
  },
];
const CURRENT_REWARDS = {
  "lantern-run": { reward: "winter-lantern-moth" },
  "ribbon-hunt": { reward: null, boost: "boost-spark", charges: 2 },
  "prism-set": { reward: null, boost: "boost-surge", charges: 1 },
  "meteor-watch": { reward: null, boost: "boost-overdrive", charges: 1 },
  "bell-relay": { reward: null, boost: "boost-surge", charges: 1 },
  "gift-drive": { reward: "winter-parcel-kit" },
  "midnight-wishes": { reward: "rngmas-midnight" },
};
for (const mission of [...WINTER_SPECIAL_TASKS, ...WINTER_LIVE_EVENTS]) {
  mission.legacyReward = mission.reward;
  Object.assign(mission, CURRENT_REWARDS[mission.id]);
}

const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;
const digits = (value) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter((n) => Number.isInteger(n) && n >= 0 && n <= 9),
        ),
      ].sort((a, b) => a - b)
    : [];
export function emptyWinterFestival() {
  return {
    rolls: 0,
    seven: 0,
    digits: [],
    claimed: [],
    rewardClaims: [],
    live: Object.fromEntries(
      WINTER_LIVE_EVENTS.map((event) => [
        event.id,
        { count: 0, digits: [], claimed: false },
      ]),
    ),
  };
}
export function parseWinterFestival(value, owned = []) {
  const base = emptyWinterFestival();
  const all = [...WINTER_SPECIAL_TASKS, ...WINTER_LIVE_EVENTS];
  base.rewardClaims = all
    .filter(
      (mission) =>
        (Array.isArray(value?.rewardClaims) &&
          value.rewardClaims.includes(mission.id)) ||
        (mission.reward && owned.includes(mission.reward)),
    )
    .map((mission) => mission.id);
  base.rolls = Math.min(150, count(value?.rolls));
  base.seven = Math.min(25, count(value?.seven));
  base.digits = digits(value?.digits);
  base.claimed = WINTER_SPECIAL_TASKS.filter(
    (task) =>
      (Array.isArray(value?.claimed) && value.claimed.includes(task.id)) ||
      (task.reward && owned.includes(task.reward)) ||
      owned.includes(task.legacyReward),
  ).map((task) => task.id);
  for (const event of WINTER_LIVE_EVENTS) {
    const stored = value?.live?.[event.id];
    base.live[event.id] = {
      count: Math.min(event.goal, count(stored?.count)),
      digits: digits(stored?.digits),
      claimed:
        stored?.claimed === true ||
        (event.reward && owned.includes(event.reward)) ||
        owned.includes(event.legacyReward),
    };
  }
  return base;
}
export function winterFestivalCount(record, mission) {
  const stats = record?.festival ?? emptyWinterFestival();
  const entry = mission.start ? stats.live[mission.id] : stats;
  return mission.metric === "digits"
    ? (entry?.digits?.length ?? 0)
    : mission.start
      ? (entry?.count ?? 0)
      : (stats[mission.metric] ?? 0);
}
export function recordWinterFestival(record, result, at) {
  const stats = record.festival ?? emptyWinterFestival();
  const last = result.number % 10;
  const next = {
    ...stats,
    rolls: Math.min(150, stats.rolls + 1),
    seven: Math.min(
      25,
      stats.seven + (String(result.number).includes("7") ? 1 : 0),
    ),
    digits: [...new Set([...stats.digits, last])],
    live: { ...stats.live },
  };
  for (const event of WINTER_LIVE_EVENTS) {
    if (at < event.start || at >= event.end || event.metric === "donations")
      continue;
    const entry = stats.live[event.id];
    next.live[event.id] = {
      ...entry,
      count: Math.min(
        event.goal,
        entry.count +
          (event.metric === "even"
            ? Number(result.number % 2 === 0)
            : event.metric === "high"
              ? Number(result.number >= 500000)
              : 0),
      ),
      digits:
        event.metric === "digits"
          ? [...new Set([...entry.digits, last])]
          : entry.digits,
    };
  }
  return { ...record, festival: next };
}
