// Tasks: small daily and weekly goals that pay EP once per reset.
//
// Progress is kept on the save rather than read back from the activity log, so
// bulk deleting history never un-finishes a task and the log can be trimmed
// freely. Each cadence remembers the period it is counting, a local calendar day
// or a local week that starts on Monday, with the tallies made inside it and the
// tasks already claimed. The first action in a new period starts from zero, so
// nothing has to run on a timer to reset.

export const TASK_CADENCES = ["daily", "weekly"];

// What a task can count. Each settled online roll adds to these, and a task
// reads one of them against its goal.
export const TASK_METRICS = ["rolls", "rare", "discovered", "banked", "skills"];

// The tiers at or above Rare in the scoring table.
export const RARE_OR_BETTER = ["rare", "epic", "anomaly", "mythic", "godly"];

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

function zeroCounts() {
  return Object.fromEntries(TASK_METRICS.map((metric) => [metric, 0]));
}

function emptySlot() {
  return { period: "", counts: zeroCounts(), claimed: [] };
}

export function emptyTasks() {
  return { daily: emptySlot(), weekly: emptySlot() };
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
  if (stored?.period === period) return stored;
  return { period, counts: zeroCounts(), claimed: [] };
}

// Where a task stands right now: how far along it is, and whether it is still
// open, ready to claim, or already claimed for this reset.
export function taskProgress(tasks, task, at) {
  const slot = currentSlot(tasks, task.cadence, at);
  const count = slot.counts[task.metric] ?? 0;
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
  for (const task of TASKS) {
    const { state } = taskProgress(tasks, task, at);
    if (state === "claimable") ready++;
    if (state === "claimed") claimed++;
  }
  return { ready, claimed, total: TASKS.length };
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
    next[cadence] = { period, counts, claimed: slot.claimed };
  }
  return next;
}

// Marks a task as claimed for the current reset. The caller credits the reward;
// this only refuses a claim that is not earned or was already taken.
export function claimTask(tasks, task, at) {
  const slot = currentSlot(tasks, task.cadence, at);
  if (slot.claimed.includes(task.id))
    throw new Error("This task is already claimed for this reset.");
  if ((slot.counts[task.metric] ?? 0) < task.goal)
    throw new Error("Finish this task before claiming it.");
  return {
    ...emptyTasks(),
    ...tasks,
    [task.cadence]: {
      period: periodKey(task.cadence, at),
      counts: slot.counts,
      claimed: [...slot.claimed, task.id],
    },
  };
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
      Array.isArray(slot.claimed);
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
    tasks[cadence] = {
      period: slot.period,
      counts,
      claimed: [...new Set(slot.claimed.filter((id) => ids.includes(id)))],
    };
  }
  return { tasks, repaired };
}
