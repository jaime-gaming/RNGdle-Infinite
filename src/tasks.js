// Tasks: small daily and weekly goals that pay EP once per reset.
//
// Progress is kept on the save rather than read back from the activity log, so
// bulk deleting history never un-finishes a task and the log can be trimmed
// freely. Each cadence remembers its current day or Monday-start week, along
// with its tallies, claimed tasks and list-bonus state. The first action in a
// new period starts from zero, so nothing has to run on a timer to reset.
//
// Each cadence has a pool of tasks. A period deals a fixed number onto the list
// (three Daily, four Weekly), in an order that depends only on the period's key
// and each task's id, so every device shows the same ones without storing them. A Task Skip swaps one open
// task on the list for the next pool task that is not on it. The swap is saved
// with the period, together with the running count its new task starts from; a
// peak task reads the best roll of the period instead, as it always does.
//
// Finishing every task on a list unlocks a bonus once more, on top of the
// rewards. The player collects the bonus with its own button.

export const TASK_CADENCES = ["daily", "weekly"];

// What a task can count. Each settled online roll adds to these, and a task
// reads one of them against its goal. Peak metrics keep the best single roll of
// the period instead of a running total.
export const TASK_METRICS = [
  "rolls",
  "rare",
  "epic",
  "mythic",
  "multi",
  "discovered",
  "banked",
  "skills",
  "pets",
  "peakEP",
  "peakBadges",
];
export const PEAK_METRICS = ["peakEP", "peakBadges"];

// The tiers at or above Rare, Epic, and Mythic, in the scoring table.
export const RARE_OR_BETTER = ["rare", "epic", "anomaly", "mythic", "godly"];
export const EPIC_OR_BETTER = ["epic", "anomaly", "mythic", "godly"];
export const MYTHIC_OR_BETTER = ["mythic", "godly"];

// How many tasks a period puts on each cadence's list.
export const ACTIVE_PER_PERIOD = { daily: 3, weekly: 4 };
// A Task Skip can be bought once a day, and no more than SKIP_WINDOW_LIMIT in
// any SKIP_WINDOW_MS. A save holds at most SKIP_HOLD_LIMIT unused ones.
export const SKIP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const SKIP_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
export const SKIP_WINDOW_LIMIT = 3;
export const SKIP_HOLD_LIMIT = 3;
// The bonus for claiming every task on a list in one period.
export const LIST_BONUS = { daily: 100000, weekly: 500000 };

// The limited R4ND0MN3S5 transmission keeps its mission progress in the save,
// independent of Daily and Weekly resets. Its matching auras are claimed by the
// player and remain part of the collection across rebirths.
export const AURA_EVENT_ID = "randomness-signal-2026";
export const AURA_EVENT_START_AT = new Date(2026, 9, 11, 0, 0, 0, 0).getTime();
export const AURA_EVENT_END_AT = new Date(2026, 9, 26, 0, 0, 0, 0).getTime();
export const AURA_EVENT_MISSIONS = [
  {
    id: "static",
    auraId: "static",
    title: "Roll 20 numbers",
    detail: "Complete online rolls while the event is live.",
    metric: "rolls",
    goal: 20,
  },
  {
    id: "bitstorm",
    auraId: "bitstorm",
    title: "Roll 5 Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic and GODLY results count.",
    metric: "rare",
    goal: 5,
  },
  {
    id: "scramble",
    auraId: "scramble",
    title: "Bank 400,000 EP",
    detail: "EP from online rolls counts toward this goal.",
    metric: "banked",
    goal: 400000,
  },
  {
    id: "hexdump",
    auraId: "hexdump",
    title: "Claim 6 tasks",
    detail: "Daily and weekly task rewards both count.",
    metric: "taskClaims",
    goal: 6,
  },
];

export const TASKS = [
  // ---- Daily: nineteen tasks, three on the list each day -----------------
  {
    id: "daily-rolls",
    cadence: "daily",
    title: "Roll 10 numbers",
    detail: "Online rolls count, whatever they score.",
    metric: "rolls",
    goal: 10,
    reward: 20000,
  },
  {
    id: "daily-rare",
    cadence: "daily",
    title: "Roll a Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY. About one roll in four.",
    metric: "rare",
    goal: 1,
    reward: 25000,
  },
  {
    id: "daily-epic",
    cadence: "daily",
    title: "Roll an Epic or better",
    detail: "Epic, Anomaly, Mythic or GODLY. About one roll in ten.",
    metric: "epic",
    goal: 1,
    reward: 50000,
  },
  {
    id: "daily-mythic",
    cadence: "daily",
    title: "Roll a Mythic or GODLY",
    detail: "The top two tiers. About one roll in a hundred.",
    metric: "mythic",
    goal: 1,
    reward: 150000,
  },
  {
    id: "daily-discover",
    cadence: "daily",
    title: "Discover 3 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 3,
    reward: 25000,
  },
  {
    id: "daily-badges",
    cadence: "daily",
    title: "Earn 22 badges on one roll",
    detail: "Every badge the number carries counts, found before or not.",
    metric: "peakBadges",
    goal: 22,
    reward: 80000,
  },
  {
    id: "daily-bank",
    cadence: "daily",
    title: "Bank 50,000 EP from rolls",
    detail: "Everything rolls pay into your wallet, bonuses included.",
    metric: "banked",
    goal: 50000,
    reward: 20000,
  },
  {
    id: "daily-bank-big",
    cadence: "daily",
    title: "Bank 250,000 EP from rolls",
    detail: "The same wallet count, at a bigger pace.",
    metric: "banked",
    goal: 250000,
    reward: 60000,
  },
  {
    id: "daily-peak",
    cadence: "daily",
    title: "Land a roll worth 200,000 EP",
    detail: "The number's own EP, before any bonus. About one roll in 120.",
    metric: "peakEP",
    goal: 200000,
    reward: 100000,
  },
  {
    id: "daily-multi",
    cadence: "daily",
    title: "Land a multi-number roll",
    detail: "A draw skill keeps two or more numbers on the same roll.",
    metric: "multi",
    goal: 1,
    reward: 50000,
  },
  {
    id: "daily-skill",
    cadence: "daily",
    title: "Fire a skill once",
    detail: "Any skill that fires on a roll counts, once per roll.",
    metric: "skills",
    goal: 1,
    reward: 15000,
  },
  {
    id: "daily-pet",
    cadence: "daily",
    title: "Find a companion",
    detail: "Companions turn up on about one roll in 250.",
    metric: "pets",
    goal: 1,
    reward: 100000,
  },
  {
    id: "daily-rolls-20",
    cadence: "daily",
    title: "Roll 20 numbers",
    detail: "Online rolls count, whatever they score.",
    metric: "rolls",
    goal: 20,
    reward: 40000,
  },
  {
    id: "daily-rare-2",
    cadence: "daily",
    title: "Roll 2 Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY.",
    metric: "rare",
    goal: 2,
    reward: 50000,
  },
  {
    id: "daily-epic-2",
    cadence: "daily",
    title: "Roll 2 Epic or better",
    detail: "Epic, Anomaly, Mythic or GODLY.",
    metric: "epic",
    goal: 2,
    reward: 100000,
  },
  {
    id: "daily-discover-5",
    cadence: "daily",
    title: "Discover 5 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 5,
    reward: 50000,
  },
  {
    id: "daily-bank-100k",
    cadence: "daily",
    title: "Bank 100,000 EP from rolls",
    detail: "Everything rolls pay into your wallet, bonuses included.",
    metric: "banked",
    goal: 100000,
    reward: 30000,
  },
  {
    id: "daily-multi-2",
    cadence: "daily",
    title: "Land 2 multi-number rolls",
    detail: "Each roll counts once, however many numbers it pays.",
    metric: "multi",
    goal: 2,
    reward: 75000,
  },
  {
    id: "daily-skills-3",
    cadence: "daily",
    title: "Fire a skill on 3 rolls",
    detail: "Each roll counts once, however many skills fire on it.",
    metric: "skills",
    goal: 3,
    reward: 40000,
  },
  // ---- Weekly: twenty-one tasks, four on the list each week --------------
  {
    id: "weekly-rolls",
    cadence: "weekly",
    title: "Roll 100 numbers",
    detail: "Online rolls count from Monday to Monday.",
    metric: "rolls",
    goal: 100,
    reward: 200000,
  },
  {
    id: "weekly-rare",
    cadence: "weekly",
    title: "Roll 5 Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY, from Monday to Monday.",
    metric: "rare",
    goal: 5,
    reward: 150000,
  },
  {
    id: "weekly-epic",
    cadence: "weekly",
    title: "Roll 2 Epic or better",
    detail: "The rarer tiers only: Epic, Anomaly, Mythic or GODLY.",
    metric: "epic",
    goal: 2,
    reward: 300000,
  },
  {
    id: "weekly-mythic",
    cadence: "weekly",
    title: "Roll 10 Mythic or GODLY",
    detail: "The top two tiers, from Monday to Monday. A long shot.",
    metric: "mythic",
    goal: 10,
    reward: 900000,
  },
  {
    id: "weekly-discover",
    cadence: "weekly",
    title: "Discover 15 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 15,
    reward: 200000,
  },
  {
    id: "weekly-bank",
    cadence: "weekly",
    title: "Bank 1,000,000 EP from rolls",
    detail: "Everything rolls pay into your wallet, bonuses included.",
    metric: "banked",
    goal: 1000000,
    reward: 200000,
  },
  {
    id: "weekly-bank-big",
    cadence: "weekly",
    title: "Bank 5,000,000 EP from rolls",
    detail: "The long haul: five million banked from Monday to Monday.",
    metric: "banked",
    goal: 5000000,
    reward: 600000,
  },
  {
    id: "weekly-peak",
    cadence: "weekly",
    title: "Land a roll worth 500,000 EP",
    detail: "The number's own EP. About one roll in 500.",
    metric: "peakEP",
    goal: 500000,
    reward: 500000,
  },
  {
    id: "weekly-multi",
    cadence: "weekly",
    title: "Land 3 multi-number rolls",
    detail: "Each roll counts once, however many numbers it pays.",
    metric: "multi",
    goal: 3,
    reward: 250000,
  },
  {
    id: "weekly-skills",
    cadence: "weekly",
    title: "Fire a skill on 10 rolls",
    detail: "Each roll counts once, however many skills fire on it.",
    metric: "skills",
    goal: 10,
    reward: 300000,
  },
  {
    id: "weekly-pets",
    cadence: "weekly",
    title: "Find 2 companions",
    detail: "Companions turn up on about one roll in 250.",
    metric: "pets",
    goal: 2,
    reward: 500000,
  },
  {
    id: "weekly-badges",
    cadence: "weekly",
    title: "Earn 25 badges on one roll",
    detail: "The biggest numbers carry the most badges.",
    metric: "peakBadges",
    goal: 25,
    reward: 600000,
  },
  {
    id: "weekly-rolls-250",
    cadence: "weekly",
    title: "Roll 250 numbers",
    detail: "Online rolls count from Monday to Monday.",
    metric: "rolls",
    goal: 250,
    reward: 500000,
  },
  {
    id: "weekly-rare-10",
    cadence: "weekly",
    title: "Roll 10 Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY, from Monday to Monday.",
    metric: "rare",
    goal: 10,
    reward: 300000,
  },
  {
    id: "weekly-epic-5",
    cadence: "weekly",
    title: "Roll 5 Epic or better",
    detail: "The rarer tiers only: Epic, Anomaly, Mythic or GODLY.",
    metric: "epic",
    goal: 5,
    reward: 600000,
  },
  {
    id: "weekly-discover-30",
    cadence: "weekly",
    title: "Discover 30 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 30,
    reward: 400000,
  },
  {
    id: "weekly-bank-2500k",
    cadence: "weekly",
    title: "Bank 2,500,000 EP from rolls",
    detail: "Everything rolls pay into your wallet, bonuses included.",
    metric: "banked",
    goal: 2500000,
    reward: 350000,
  },
  {
    id: "weekly-multi-5",
    cadence: "weekly",
    title: "Land 5 multi-number rolls",
    detail: "Each roll counts once, however many numbers it pays.",
    metric: "multi",
    goal: 5,
    reward: 400000,
  },
  {
    id: "weekly-skills-25",
    cadence: "weekly",
    title: "Fire a skill on 25 rolls",
    detail: "Each roll counts once, however many skills fire on it.",
    metric: "skills",
    goal: 25,
    reward: 700000,
  },
  {
    id: "weekly-pets-3",
    cadence: "weekly",
    title: "Find 3 companions",
    detail: "Companions turn up on about one roll in 250.",
    metric: "pets",
    goal: 3,
    reward: 1000000,
  },
  {
    id: "weekly-mythic-20",
    cadence: "weekly",
    title: "Roll 20 Mythic or GODLY",
    detail: "The top two tiers, from Monday to Monday.",
    metric: "mythic",
    goal: 20,
    reward: 1200000,
  },
];

const TASK_BY_ID = new Map(TASKS.map((task) => [task.id, task]));
export function taskById(id) {
  return TASK_BY_ID.get(id) ?? null;
}

export const CADENCE_NAME = { daily: "Daily", weekly: "Weekly" };

const PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;
const validAmount = (n) => Number.isSafeInteger(n) && n >= 0;
const addCapped = (total, amount) =>
  Math.min(Number.MAX_SAFE_INTEGER, (total ?? 0) + amount);
const isPoolId = (cadence, id) => TASK_BY_ID.get(id)?.cadence === cadence;
const isPeak = (metric) => PEAK_METRICS.includes(metric);

// A small, stable string hash (FNV-1a). Every device runs the same arithmetic,
// so a period deals the same tasks everywhere without storing them.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Every task in a cadence's pool, in the order this period deals them out.
// The active portion goes on the list; the rest are available to Task Skip.
function dealt(cadence, period) {
  return TASKS.filter((task) => task.cadence === cadence)
    .map((task) => ({ id: task.id, rank: hash(`${period}|${task.id}`) }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1))
    .map((entry) => entry.id);
}

function zeroCounts() {
  return Object.fromEntries(TASK_METRICS.map((metric) => [metric, 0]));
}

function emptySlot() {
  return {
    period: "",
    counts: zeroCounts(),
    claimed: [],
    swaps: [],
    bonus: false,
  };
}

// `bought` holds the times of the last few Task Skips bought, oldest first. It
// is all the wait needs: one a day, and a fourth only once the oldest of the
// last three has left the window. An empty list never holds a purchase back.
function emptySkip() {
  return { tokens: 0, bought: [] };
}

const AURA_EVENT_METRICS = [
  ...new Set(AURA_EVENT_MISSIONS.map((mission) => mission.metric)),
];
const AURA_EVENT_LIMITS = Object.fromEntries(
  AURA_EVENT_METRICS.map((metric) => [
    metric,
    Math.max(
      ...AURA_EVENT_MISSIONS.filter((mission) => mission.metric === metric).map(
        (mission) => mission.goal,
      ),
    ),
  ]),
);
const AURA_EVENT_MISSION_IDS = new Set(
  AURA_EVENT_MISSIONS.map((mission) => mission.id),
);

function emptyAuraEvent() {
  return {
    id: AURA_EVENT_ID,
    counts: Object.fromEntries(AURA_EVENT_METRICS.map((metric) => [metric, 0])),
    earned: [],
  };
}

function auraEventSlot(tasks) {
  const stored = tasks?.event;
  const counts = Object.fromEntries(
    AURA_EVENT_METRICS.map((metric) => [
      metric,
      validAmount(stored?.counts?.[metric])
        ? Math.min(stored.counts[metric], AURA_EVENT_LIMITS[metric])
        : 0,
    ]),
  );
  const earned = Array.isArray(stored?.earned)
    ? [...new Set(stored.earned.filter((id) => AURA_EVENT_MISSION_IDS.has(id)))]
    : [];
  return { id: AURA_EVENT_ID, counts, earned };
}

function auraEventPhase(at) {
  if (at < AURA_EVENT_START_AT) return "upcoming";
  return at < AURA_EVENT_END_AT ? "active" : "ended";
}

function advanceAuraEvent(tasks, tally, at) {
  const event = auraEventSlot(tasks);
  if (auraEventPhase(at) !== "active") return event;
  const counts = { ...event.counts };
  for (const metric of AURA_EVENT_METRICS) {
    const amount = tally?.[metric] ?? 0;
    if (validAmount(amount))
      counts[metric] = Math.min(
        AURA_EVENT_LIMITS[metric],
        addCapped(counts[metric], amount),
      );
  }
  return { ...event, counts };
}

// Event missions use the same verified online-roll tally as Daily and Weekly
// tasks. Only individual task claims add to the event's task-claim objective.
export function recordEventTaskClaim(tasks, at) {
  return {
    ...emptyTasks(),
    ...tasks,
    event: advanceAuraEvent(tasks, { taskClaims: 1 }, at),
  };
}

// Completing a mission unlocks a free aura, but the player must collect it on
// the Tasks page. Collected mission IDs are the receipts that let those looks
// survive rebirth and be restored if a save ever drops an owned-list entry.
export function claimAuraEvent(tasks, id) {
  const mission = AURA_EVENT_MISSIONS.find((entry) => entry.id === id);
  if (!mission) throw new Error("That event mission does not exist.");
  const event = auraEventSlot(tasks);
  if (event.counts[mission.metric] < mission.goal)
    throw new Error("Complete the mission before collecting its aura.");
  if (event.earned.includes(mission.id))
    throw new Error("That event aura has already been collected.");
  return {
    ...emptyTasks(),
    ...tasks,
    event: { ...event, earned: [...event.earned, mission.id] },
  };
}

// The wardrobe keeps a normal aura entry; its collected mission is the receipt
// for restoring it after rebirth or save repair.
export function auraEventAuraIds(tasks) {
  const collected = new Set(auraEventSlot(tasks).earned);
  return AURA_EVENT_MISSIONS.filter((mission) => collected.has(mission.id)).map(
    (mission) => mission.auraId,
  );
}

// The Tasks page reads one source of truth for the event banner, mission
// progress and each aura's manual collection state.
export function auraEventState(tasks, at) {
  const event = auraEventSlot(tasks);
  const phase = auraEventPhase(at);
  const collected = new Set(event.earned);
  const missions = AURA_EVENT_MISSIONS.map((mission) => {
    const complete = event.counts[mission.metric] >= mission.goal;
    const isCollected = collected.has(mission.id);
    return {
      ...mission,
      count: Math.min(event.counts[mission.metric] ?? 0, mission.goal),
      complete,
      collected: isCollected,
      claimable: complete && !isCollected,
    };
  });
  return {
    id: AURA_EVENT_ID,
    phase,
    startsAt: AURA_EVENT_START_AT,
    endsAt: AURA_EVENT_END_AT,
    missions,
    complete: missions.filter((mission) => mission.complete).length,
    collected: missions.filter((mission) => mission.collected).length,
    total: missions.length,
  };
}

// The purchase times the wait reads, sanitized. Never more than the window
// counts, so a long-running save cannot grow this list.
function skipPurchases(tasks) {
  const bought = tasks?.skip?.bought;
  if (!Array.isArray(bought)) return [];
  return bought
    .filter((at) => validAmount(at))
    .sort((a, b) => a - b)
    .slice(-SKIP_WINDOW_LIMIT);
}

export function emptyTasks() {
  return {
    daily: emptySlot(),
    weekly: emptySlot(),
    skip: emptySkip(),
    event: emptyAuraEvent(),
  };
}

// The day a moment falls on, or for a weekly cadence the Monday that starts
// its week.
function periodStart(cadence, at) {
  const date = new Date(at);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (cadence !== "weekly") return day;
  const sinceMonday = (day.getDay() + 6) % 7;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() - sinceMonday,
  );
}

// A stable key for the period a moment belongs to: "2026-10-08" for a daily
// period, the Monday of the week for a weekly one. Keys sort chronologically.
export function periodKey(cadence, at) {
  const start = periodStart(cadence, at);
  const pad = (n) => String(n).padStart(2, "0");
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

// When the period a moment belongs to ends, as a timestamp in milliseconds.
export function nextReset(cadence, at) {
  const start = periodStart(cadence, at);
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + (cadence === "weekly" ? 7 : 1),
  ).getTime();
}

// The slot a cadence counts in at a given moment. A slot from an earlier period
// is treated as empty, which is what makes every reset happen lazily.
function currentSlot(tasks, cadence, at) {
  const period = periodKey(cadence, at);
  const stored = tasks?.[cadence];
  if (stored?.period === period)
    return {
      ...stored,
      swaps: stored.swaps ?? [],
      bonus: stored.bonus === true,
    };
  return { period, counts: zeroCounts(), claimed: [], swaps: [], bonus: false };
}

// The ids on a cadence's list at a moment: the ones dealt for the period, with
// any skip of this period swapped in, in the order the swaps were made.
export function activeTaskIds(tasks, cadence, at) {
  const slot = currentSlot(tasks, cadence, at);
  const active = dealt(cadence, slot.period).slice(
    0,
    ACTIVE_PER_PERIOD[cadence],
  );
  for (const swap of slot.swaps) {
    const index = active.indexOf(swap.out);
    if (index !== -1) active[index] = swap.in;
  }
  return active;
}

// The same list as task objects, in the order the page shows them.
export function activeTasks(tasks, cadence, at) {
  return activeTaskIds(tasks, cadence, at).map((id) => TASK_BY_ID.get(id));
}

// How far a task has got this period. A running total counts from the moment a
// task was swapped in; a peak keeps the best roll of the period, whenever it was.
function progressOf(slot, task) {
  const total = slot.counts[task.metric] ?? 0;
  if (isPeak(task.metric)) return total;
  const swap = slot.swaps.find((entry) => entry.in === task.id);
  return Math.max(0, total - (swap?.base ?? 0));
}

// Where a task stands right now: how far along it is, and whether it is still
// open, ready to claim, or already claimed for this reset.
export function taskProgress(tasks, task, at) {
  const slot = currentSlot(tasks, task.cadence, at);
  const count = progressOf(slot, task);
  const claimed = slot.claimed.includes(task.id);
  const complete = count >= task.goal;
  return {
    count,
    goal: task.goal,
    complete,
    claimed,
    state: claimed ? "claimed" : complete ? "claimable" : "open",
  };
}

// The ids of a cadence's list that are finished and not yet claimed.
export function claimableIds(tasks, cadence, at) {
  return activeTaskIds(tasks, cadence, at).filter(
    (id) => taskProgress(tasks, TASK_BY_ID.get(id), at).state === "claimable",
  );
}

// Where the list bonus of a cadence stands: how many of its tasks are claimed,
// and whether the bonus itself is open, ready to claim, or taken.
export function listBonusState(tasks, cadence, at) {
  const slot = currentSlot(tasks, cadence, at);
  const list = activeTaskIds(tasks, cadence, at);
  const done = list.filter((id) => slot.claimed.includes(id)).length;
  const state = slot.bonus
    ? "claimed"
    : done === list.length
      ? "claimable"
      : "open";
  return {
    reward: LIST_BONUS[cadence],
    done,
    total: list.length,
    state,
  };
}

export function taskSummary(tasks, at) {
  let ready = 0;
  let claimed = 0;
  let total = 0;
  for (const cadence of TASK_CADENCES) {
    for (const task of activeTasks(tasks, cadence, at)) {
      total++;
      const { state } = taskProgress(tasks, task, at);
      if (state === "claimable") ready++;
      if (state === "claimed") claimed++;
    }
    if (listBonusState(tasks, cadence, at).state === "claimable") ready++;
  }
  return { ready, claimed, total };
}

// The Task Skips a save holds right now, and how long until the next one can be
// bought. Both read the save alone, so every tab says the same thing.
export function skipStatus(tasks, at) {
  const stored = tasks?.skip ?? emptySkip();
  const bought = skipPurchases(tasks);
  // One a day. And once three were bought in the window, the oldest of them has
  // to leave it before another can be bought.
  const daily = bought.length ? bought.at(-1) + SKIP_INTERVAL_MS - at : 0;
  const windowed =
    bought.length >= SKIP_WINDOW_LIMIT ? bought[0] + SKIP_WINDOW_MS - at : 0;
  return {
    tokens: Math.min(SKIP_HOLD_LIMIT, stored.tokens ?? 0),
    limit: SKIP_HOLD_LIMIT,
    waitMs: Math.max(0, daily, windowed),
  };
}

// The Task Skip save after one purchase at `at`: one more token, and the time
// goes on the record the window reads. The caller has already checked the wait
// and the hold limit.
export function boughtSkip(tasks, at) {
  const stored = tasks?.skip ?? emptySkip();
  return {
    tokens: Math.min(SKIP_HOLD_LIMIT, stored.tokens ?? 0) + 1,
    bought: [...skipPurchases(tasks), at].slice(-SKIP_WINDOW_LIMIT),
  };
}

// A wait in words short enough for a button: "2d 4h", "5h 10m", "12m".
export function waitText(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

// What one settled online roll adds to each cadence. A settlement from an
// earlier period (a roll replayed after a failed save) never reopens that
// period, because the stored one is already further along.
export function recordTally(tasks, tally, at) {
  const next = {};
  for (const cadence of TASK_CADENCES) {
    const stored = tasks?.[cadence];
    const period = periodKey(cadence, at);
    if (stored?.period > period) {
      next[cadence] = stored;
      continue;
    }
    const slot = currentSlot(tasks, cadence, at);
    const counts = { ...slot.counts };
    for (const metric of TASK_METRICS) {
      const amount = tally[metric] ?? 0;
      counts[metric] = isPeak(metric)
        ? Math.max(counts[metric] ?? 0, amount)
        : addCapped(counts[metric], amount);
    }
    next[cadence] = {
      period,
      counts,
      claimed: slot.claimed,
      swaps: slot.swaps,
      bonus: slot.bonus,
    };
  }
  return {
    ...emptyTasks(),
    ...tasks,
    ...next,
    event: advanceAuraEvent(tasks, tally, at),
  };
}

// Marks a task as claimed for the current reset. The caller credits the reward;
// this only refuses a claim that is not earned, not on the list, or taken.
export function claimTask(tasks, task, at) {
  const slot = currentSlot(tasks, task.cadence, at);
  if (slot.claimed.includes(task.id))
    throw new Error("This task is already claimed for this reset.");
  if (!activeTaskIds(tasks, task.cadence, at).includes(task.id))
    throw new Error("This task is not on your list for this reset.");
  if (progressOf(slot, task) < task.goal)
    throw new Error("Finish this task before claiming it.");
  return {
    ...emptyTasks(),
    ...tasks,
    [task.cadence]: {
      ...slot,
      period: periodKey(task.cadence, at),
      claimed: [...slot.claimed, task.id],
    },
  };
}

// Marks a cadence's list bonus as taken for the current reset. The caller
// credits the reward. The reducer calls this when the player collects a finished
// list's bonus; it refuses a bonus that is not earned or is already taken.
export function claimListBonus(tasks, cadence, at) {
  const bonus = listBonusState(tasks, cadence, at);
  if (bonus.state === "claimed")
    throw new Error("This list bonus is already claimed for this reset.");
  if (bonus.state !== "claimable")
    throw new Error("Claim every task on the list first.");
  const slot = currentSlot(tasks, cadence, at);
  return {
    ...emptyTasks(),
    ...tasks,
    [cadence]: { ...slot, period: periodKey(cadence, at), bonus: true },
  };
}

// A Task Skip: one open task on the list is swapped for the next pool task that
// is not on the list and was not skipped this period, and one token is used. The
// new task starts at zero from this moment. A claimed task is already paid for,
// and a finished one is ready to claim, so neither can be skipped.
export function skipTask(tasks, task, at) {
  const status = skipStatus(tasks, at);
  if (status.tokens < 1)
    throw new Error("You have no Task Skip. Buy one in the Shop.");
  const slot = currentSlot(tasks, task.cadence, at);
  const active = activeTaskIds(tasks, task.cadence, at);
  if (!active.includes(task.id))
    throw new Error("This task is not on your list for this reset.");
  if (slot.claimed.includes(task.id))
    throw new Error("A claimed task cannot be skipped.");
  if (progressOf(slot, task) >= task.goal)
    throw new Error("Claim a finished task instead of skipping it.");
  const used = new Set(slot.swaps.map((swap) => swap.out));
  const incoming = dealt(task.cadence, slot.period).find(
    (id) => !active.includes(id) && !used.has(id),
  );
  if (!incoming) throw new Error("No other task is left for this reset.");
  // A peak counts from the best roll of the period, so it has no base to pass.
  const incomingTask = TASK_BY_ID.get(incoming);
  const base = isPeak(incomingTask.metric)
    ? 0
    : (slot.counts[incomingTask.metric] ?? 0);
  return {
    ...emptyTasks(),
    ...tasks,
    [task.cadence]: {
      ...slot,
      swaps: [...slot.swaps, { out: task.id, in: incoming, base }],
    },
    skip: { ...(tasks?.skip ?? emptySkip()), tokens: status.tokens - 1 },
  };
}

// A swap is kept only if it could have happened: it takes a task that was on the
// list for that period out, and brings in a pool task that was not on it and
// had not been skipped before. Anything else is dropped, and reported.
function sanitizeSwaps(cadence, period, swaps) {
  const kept = [];
  const list = period
    ? dealt(cadence, period).slice(0, ACTIVE_PER_PERIOD[cadence])
    : [];
  for (const swap of swaps) {
    const readable =
      !!swap &&
      typeof swap === "object" &&
      !Array.isArray(swap) &&
      isPoolId(cadence, swap.out) &&
      isPoolId(cadence, swap.in) &&
      validAmount(swap.base) &&
      list.includes(swap.out) &&
      !list.includes(swap.in) &&
      !kept.some((entry) => entry.out === swap.in);
    if (!readable) continue;
    list[list.indexOf(swap.out)] = swap.in;
    kept.push({ out: swap.out, in: swap.in, base: swap.base });
  }
  return kept;
}

// The tasks read back from a save. Anything unreadable is reset to an empty
// slot rather than failing the whole load, and the caller is told when it was.
export function parseTasks(value) {
  if (value == null) return { tasks: emptyTasks(), repaired: false };
  if (typeof value !== "object" || Array.isArray(value))
    return { tasks: emptyTasks(), repaired: true };
  let repaired = false;
  const tasks = {};
  for (const cadence of TASK_CADENCES) {
    const slot = value[cadence];
    if (slot === undefined) {
      tasks[cadence] = emptySlot();
      continue;
    }
    const readable =
      !!slot &&
      typeof slot === "object" &&
      !Array.isArray(slot) &&
      (slot.period === "" || PERIOD_RE.test(slot.period)) &&
      !!slot.counts &&
      typeof slot.counts === "object" &&
      Array.isArray(slot.claimed) &&
      (slot.swaps === undefined || Array.isArray(slot.swaps)) &&
      (slot.bonus === undefined || typeof slot.bonus === "boolean");
    if (!readable) {
      repaired = true;
      tasks[cadence] = emptySlot();
      continue;
    }
    const counts = {};
    for (const metric of TASK_METRICS) {
      const amount = slot.counts[metric];
      if (amount === undefined) counts[metric] = 0;
      else if (validAmount(amount)) counts[metric] = amount;
      else {
        counts[metric] = 0;
        repaired = true;
      }
    }
    const ids = TASKS.filter((task) => task.cadence === cadence).map(
      (task) => task.id,
    );
    const stored = slot.swaps ?? [];
    const swaps = sanitizeSwaps(cadence, slot.period, stored);
    if (swaps.length !== stored.length) repaired = true;
    tasks[cadence] = {
      period: slot.period,
      counts,
      claimed: [...new Set(slot.claimed.filter((id) => ids.includes(id)))],
      swaps,
      bonus: slot.bonus === true,
    };
  }
  let skip = emptySkip();
  if (value.skip !== undefined) {
    const stored = value.skip;
    // A save from before the window kept only its last purchase.
    const bought = Array.isArray(stored?.bought)
      ? stored.bought
      : stored?.boughtAt == null
        ? []
        : [stored.boughtAt];
    const readable =
      !!stored &&
      typeof stored === "object" &&
      !Array.isArray(stored) &&
      validAmount(stored.tokens) &&
      stored.tokens <= SKIP_HOLD_LIMIT &&
      bought.every((at) => validAmount(at));
    if (readable)
      skip = {
        tokens: stored.tokens,
        bought: [...bought].sort((a, b) => a - b).slice(-SKIP_WINDOW_LIMIT),
      };
    else repaired = true;
  }
  tasks.skip = skip;
  const storedEvent = value.event;
  if (storedEvent === undefined) {
    // Saves from before the transmission simply start with an empty event slot.
    tasks.event = emptyAuraEvent();
  } else {
    const readable =
      !!storedEvent &&
      typeof storedEvent === "object" &&
      !Array.isArray(storedEvent) &&
      storedEvent.id === AURA_EVENT_ID &&
      !!storedEvent.counts &&
      typeof storedEvent.counts === "object" &&
      !Array.isArray(storedEvent.counts) &&
      Array.isArray(storedEvent.earned);
    if (!readable) {
      repaired = true;
      tasks.event = emptyAuraEvent();
    } else {
      const counts = {};
      for (const metric of AURA_EVENT_METRICS) {
        const amount = storedEvent.counts[metric];
        if (amount === undefined) {
          counts[metric] = 0;
          repaired = true;
        } else if (validAmount(amount)) {
          counts[metric] = Math.min(amount, AURA_EVENT_LIMITS[metric]);
          if (counts[metric] !== amount) repaired = true;
        } else {
          counts[metric] = 0;
          repaired = true;
        }
      }
      const earned = [];
      for (const id of storedEvent.earned) {
        const mission = AURA_EVENT_MISSIONS.find((entry) => entry.id === id);
        if (
          !mission ||
          earned.includes(id) ||
          counts[mission.metric] < mission.goal
        ) {
          repaired = true;
          continue;
        }
        earned.push(id);
      }
      tasks.event = { id: AURA_EVENT_ID, counts, earned };
    }
  }
  return { tasks, repaired };
}
