// Tasks: small daily and weekly goals that pay EP once per reset.
//
// Progress is kept on the save rather than read back from the activity log, so
// bulk deleting history never un-finishes a task and the log can be trimmed
// freely. Each cadence remembers the period it is counting, a local calendar day
// or a local week that starts on Monday, with the tallies made inside it and the
// tasks already claimed. The first action in a new period starts from zero, so
// nothing has to run on a timer to reset.
//
// Each cadence has a pool of tasks. A period deals three of them onto the list,
// in an order that depends only on the period's key and each task's id, so every
// device shows the same three without storing them. A Task Skip swaps one open
// task on the list for the next pool task that is not on it. The swap is saved
// with the period, together with the count its new task starts from.

export const TASK_CADENCES = ["daily", "weekly"];

// What a task can count. Each settled online roll adds to these, and a task
// reads one of them against its goal.
export const TASK_METRICS = [
  "rolls",
  "rare",
  "epic",
  "multi",
  "discovered",
  "banked",
  "skills",
];

// The tiers at or above Rare, and at or above Epic, in the scoring table.
export const RARE_OR_BETTER = ["rare", "epic", "anomaly", "mythic", "godly"];
export const EPIC_OR_BETTER = ["epic", "anomaly", "mythic", "godly"];

// How many tasks a period puts on each cadence's list.
export const ACTIVE_PER_PERIOD = 3;
// A Task Skip is bought once per interval, and a save holds at most the limit.
export const SKIP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
export const SKIP_HOLD_LIMIT = 3;

export const TASKS = [
  {
    id: "daily-rolls",
    cadence: "daily",
    title: "Roll 10 numbers",
    detail: "Online rolls count, whatever they score.",
    metric: "rolls",
    goal: 10,
    reward: 10000,
  },
  {
    id: "daily-rare",
    cadence: "daily",
    title: "Roll a Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY. About one roll in four.",
    metric: "rare",
    goal: 1,
    reward: 15000,
  },
  {
    id: "daily-discover",
    cadence: "daily",
    title: "Discover 3 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 3,
    reward: 15000,
  },
  {
    id: "daily-epic",
    cadence: "daily",
    title: "Roll an Epic or better",
    detail: "Epic, Anomaly, Mythic or GODLY. A rarer hit than Rare.",
    metric: "epic",
    goal: 1,
    reward: 25000,
  },
  {
    id: "daily-multi",
    cadence: "daily",
    title: "Land a multi-number roll",
    detail: "A draw skill keeps two or more numbers on the same roll.",
    metric: "multi",
    goal: 1,
    reward: 20000,
  },
  {
    id: "daily-bank",
    cadence: "daily",
    title: "Bank 50,000 EP from rolls",
    detail: "Everything rolls pay into your wallet, bonuses included.",
    metric: "banked",
    goal: 50000,
    reward: 12000,
  },
  {
    id: "daily-skill",
    cadence: "daily",
    title: "Fire a skill once",
    detail: "Any skill that fires on a roll counts, once per roll.",
    metric: "skills",
    goal: 1,
    reward: 10000,
  },
  {
    id: "daily-spot",
    cadence: "daily",
    title: "Discover a new badge",
    detail: "Any badge you have not found yet in this cycle.",
    metric: "discovered",
    goal: 1,
    reward: 8000,
  },
  {
    id: "weekly-rolls",
    cadence: "weekly",
    title: "Roll 100 numbers",
    detail: "Online rolls count from Monday to Monday.",
    metric: "rolls",
    goal: 100,
    reward: 150000,
  },
  {
    id: "weekly-bank",
    cadence: "weekly",
    title: "Bank 1,000,000 EP from rolls",
    detail: "Everything rolls pay into your wallet, bonuses included.",
    metric: "banked",
    goal: 1000000,
    reward: 150000,
  },
  {
    id: "weekly-skills",
    cadence: "weekly",
    title: "Fire a skill on 5 rolls",
    detail: "Each roll counts once, however many skills fire on it.",
    metric: "skills",
    goal: 5,
    reward: 120000,
  },
  {
    id: "weekly-rare",
    cadence: "weekly",
    title: "Roll 5 Rare or better",
    detail: "Rare, Epic, Anomaly, Mythic or GODLY, from Monday to Monday.",
    metric: "rare",
    goal: 5,
    reward: 120000,
  },
  {
    id: "weekly-epic",
    cadence: "weekly",
    title: "Roll 2 Epic or better",
    detail: "The rarer tiers only: Epic, Anomaly, Mythic or GODLY.",
    metric: "epic",
    goal: 2,
    reward: 200000,
  },
  {
    id: "weekly-multi",
    cadence: "weekly",
    title: "Land 3 multi-number rolls",
    detail: "Each roll counts once, however many numbers it pays.",
    metric: "multi",
    goal: 3,
    reward: 160000,
  },
  {
    id: "weekly-discover",
    cadence: "weekly",
    title: "Discover 15 new badges",
    detail: "Badges you have not found yet in this cycle.",
    metric: "discovered",
    goal: 15,
    reward: 150000,
  },
  {
    id: "weekly-skills-ten",
    cadence: "weekly",
    title: "Fire a skill on 10 rolls",
    detail: "The long version: each roll counts once, from Monday to Monday.",
    metric: "skills",
    goal: 10,
    reward: 260000,
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

// Every task in a cadence's pool, in the order this period deals them out. The
// first ACTIVE_PER_PERIOD are on the list; the rest are what a skip can reach.
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
  return { period: "", counts: zeroCounts(), claimed: [], swaps: [] };
}

// `boughtAt: null` means no Task Skip has ever been bought, so the first one
// is never held back by the three-day wait.
function emptySkip() {
  return { tokens: 0, boughtAt: null };
}

export function emptyTasks() {
  return { daily: emptySlot(), weekly: emptySlot(), skip: emptySkip() };
}

// The local calendar day a moment falls on, or for a weekly cadence the Monday
// that starts its week. Both are local, so a reset happens at local midnight.
function localPeriodStart(cadence, at) {
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
  const start = localPeriodStart(cadence, at);
  const pad = (n) => String(n).padStart(2, "0");
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

// When the period a moment belongs to ends, as a timestamp in milliseconds.
export function nextReset(cadence, at) {
  const start = localPeriodStart(cadence, at);
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
    return { ...stored, swaps: stored.swaps ?? [] };
  return { period, counts: zeroCounts(), claimed: [], swaps: [] };
}

// The ids on a cadence's list at a moment: the three dealt for the period, with
// any skip of this period swapped in, in the order the swaps were made.
export function activeTaskIds(tasks, cadence, at) {
  const slot = currentSlot(tasks, cadence, at);
  const active = dealt(cadence, slot.period).slice(0, ACTIVE_PER_PERIOD);
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

// How far a task has got this period. A task swapped in by a skip counts from
// the moment it was swapped in, not from the start of the period.
function progressOf(slot, task) {
  const swap = slot.swaps.find((entry) => entry.in === task.id);
  const total = slot.counts[task.metric] ?? 0;
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

export function taskSummary(tasks, at) {
  let ready = 0;
  let claimed = 0;
  let total = 0;
  for (const cadence of TASK_CADENCES)
    for (const task of activeTasks(tasks, cadence, at)) {
      total++;
      const { state } = taskProgress(tasks, task, at);
      if (state === "claimable") ready++;
      if (state === "claimed") claimed++;
    }
  return { ready, claimed, total };
}

// The Task Skips a save holds right now, and how long until the next one can be
// bought. Both read the save alone, so every tab says the same thing.
export function skipStatus(tasks, at) {
  const stored = tasks?.skip ?? emptySkip();
  return {
    tokens: Math.min(SKIP_HOLD_LIMIT, stored.tokens ?? 0),
    limit: SKIP_HOLD_LIMIT,
    waitMs:
      stored.boughtAt == null
        ? 0
        : Math.max(0, stored.boughtAt + SKIP_INTERVAL_MS - at),
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
    for (const metric of TASK_METRICS)
      counts[metric] = addCapped(counts[metric], tally[metric] ?? 0);
    next[cadence] = {
      period,
      counts,
      claimed: slot.claimed,
      swaps: slot.swaps,
    };
  }
  return { ...emptyTasks(), ...tasks, ...next };
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
  const base = slot.counts[TASK_BY_ID.get(incoming).metric] ?? 0;
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
  const list = period ? dealt(cadence, period).slice(0, ACTIVE_PER_PERIOD) : [];
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
      (slot.swaps === undefined || Array.isArray(slot.swaps));
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
    };
  }
  let skip = emptySkip();
  if (value.skip !== undefined) {
    const stored = value.skip;
    const readable =
      !!stored &&
      typeof stored === "object" &&
      !Array.isArray(stored) &&
      validAmount(stored.tokens) &&
      stored.tokens <= SKIP_HOLD_LIMIT &&
      (stored.boughtAt === null || validAmount(stored.boughtAt));
    if (readable) skip = { tokens: stored.tokens, boughtAt: stored.boughtAt };
    else repaired = true;
  }
  tasks.skip = skip;
  return { tasks, repaired };
}
