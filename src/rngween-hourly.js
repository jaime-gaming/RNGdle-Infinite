import { RNGWEEN_ID, rngweenCalendar } from "./rngween.js";
import {
  WORLD_MINI_RULES,
  WORLD_BADGES,
  scoreWorldNumber,
  worldMiniSummary,
} from "./rngween-world-badges.js";
import {
  WORLD_ZONES,
  worldState,
  WORLD_LEGACY_STAGES,
  worldZoneById,
  rngweenValleyUnlocked,
} from "./rngween-world-zones.js";

// CLEANUP Nov 4, 2026: remove dealing, tallies and commissions/UI/action
// wiring. Keep the task registry/parser for old receipts; retirement removes
// the board and all temporary currency.
export const RNGWEEN_HOURLY_MS = 60 * 60 * 1000;
export const RNGWEEN_HOURLY_SLOTS = 4;
const main = (id, title, detail, metric, goal, pumpkoins, mode = "sum") => ({
  id: `main-${id}`,
  title,
  detail,
  source: "main",
  metric,
  goal,
  pumpkoins,
  mode,
});
const world = (id, title, detail, metric, goal, pumpkoins, mode = "sum") => ({
  id: `world-${id}`,
  title,
  detail,
  source: "world",
  metric,
  goal,
  pumpkoins,
  mode,
});
export const RNGWEEN_HOURLY_TASKS = [
  main(
    "lantern-laps",
    "Lantern laps",
    "Finish 5 online rolls.",
    "rolls",
    5,
    20,
  ),
  main(
    "ghost-patrol",
    "Ghost patrol",
    "Finish 9 online rolls.",
    "rolls",
    9,
    30,
  ),
  main(
    "night-watch",
    "Night watch",
    "Finish 12 online rolls.",
    "rolls",
    12,
    40,
  ),
  main(
    "long-haunt",
    "The long haunt",
    "Finish 18 online rolls.",
    "rolls",
    18,
    55,
  ),
  main(
    "evening-spirits",
    "Evening spirits",
    "Roll 2 even numbers.",
    "even",
    2,
    15,
  ),
  main(
    "balanced-bones",
    "Balanced bones",
    "Roll 4 even numbers.",
    "even",
    4,
    25,
  ),
  main("odd-company", "Odd company", "Roll 2 odd numbers.", "odd", 2, 15),
  main("crooked-count", "A crooked count", "Roll 4 odd numbers.", "odd", 4, 25),
  main(
    "tower-watch",
    "Tower watch",
    "Roll 3 numbers of 500,000 or more.",
    "high",
    3,
    25,
  ),
  main(
    "cellar-watch",
    "Cellar watch",
    "Roll 3 numbers below 500,000.",
    "low",
    3,
    25,
  ),
  main(
    "last-light",
    "The last light",
    "Roll a number ending in 0.",
    "ends0",
    1,
    25,
  ),
  main(
    "five-fangs",
    "Five little fangs",
    "Roll a number ending in 5.",
    "ends5",
    1,
    25,
  ),
  main(
    "sixth-bell",
    "The sixth bell",
    "Roll a number ending in 6.",
    "ends6",
    1,
    25,
  ),
  main(
    "hollow-ring",
    "A hollow ring",
    "Roll 3 numbers containing a 0.",
    "contains0",
    3,
    25,
  ),
  main(
    "one-candle",
    "One more candle",
    "Roll 3 numbers containing a 1.",
    "contains1",
    3,
    25,
  ),
  main(
    "three-ravens",
    "Three ravens",
    "Roll 3 numbers containing a 3.",
    "contains3",
    3,
    25,
  ),
  main(
    "six-sigils",
    "Six spectral sigils",
    "Roll 3 numbers containing a 6.",
    "contains6",
    3,
    25,
  ),
  main(
    "lucky-broom",
    "The lucky broom",
    "Roll 3 numbers containing a 7.",
    "contains7",
    3,
    25,
  ),
  main(
    "nine-lives",
    "Nine ghost lives",
    "Roll 3 numbers containing a 9.",
    "contains9",
    3,
    25,
  ),
  main(
    "twin-candles",
    "Twin candles",
    "Roll 3 numbers with a repeated digit.",
    "repeated",
    3,
    25,
  ),
  main(
    "loud-hex",
    "A loud little hex",
    "Roll 2 numbers whose digits add to 30 or more.",
    "sumHigh",
    2,
    30,
  ),
  main(
    "quiet-hex",
    "A quiet little hex",
    "Roll a number whose digits add to 15 or less.",
    "sumLow",
    1,
    30,
  ),
  main(
    "three-knocks",
    "Three knocks",
    "Roll 3 multiples of 3.",
    "divisible3",
    3,
    25,
  ),
  main(
    "five-knocks",
    "Five knocks",
    "Roll 2 multiples of 5.",
    "divisible5",
    2,
    30,
  ),
  main(
    "seven-knocks",
    "Seven knocks",
    "Roll a multiple of 7.",
    "divisible7",
    1,
    25,
  ),
  main(
    "eleven-knocks",
    "Eleven knocks",
    "Roll a multiple of 11.",
    "divisible11",
    1,
    30,
  ),
  main(
    "upstairs",
    "Who is upstairs?",
    "Roll 2 numbers with adjacent digits going up by one.",
    "ascending",
    2,
    25,
  ),
  main(
    "downstairs",
    "Who is downstairs?",
    "Roll 2 numbers with adjacent digits going down by one.",
    "descending",
    2,
    25,
  ),
  main(
    "ribbon-maker",
    "Ribbon maker",
    "Roll 2 numbers with at least 12 badges each.",
    "badges12",
    2,
    25,
  ),
  main(
    "costume-parade",
    "Costume parade",
    "Roll a number with at least 18 badges.",
    "badges18",
    1,
    40,
  ),
  main(
    "rare-sighting",
    "A rare sighting",
    "Roll a Rare or better.",
    "rare",
    1,
    25,
  ),
  main("spirit-party", "Spirit party", "Roll 3 Rare or better.", "rare", 3, 45),
  main(
    "epic-eclipse",
    "An epic eclipse",
    "Roll an Epic or better.",
    "epic",
    1,
    45,
  ),
  main(
    "pumpkin-fund",
    "Pumpkin fund",
    "Bank 50,000 EP from online rolls. Task rewards and exchanges do not count.",
    "banked",
    50000,
    25,
  ),
  main(
    "lantern-fund",
    "Lantern fund",
    "Bank 150,000 EP from online rolls. Task rewards and exchanges do not count.",
    "banked",
    150000,
    45,
  ),
  main(
    "eight-legged",
    "Eight-legged guests",
    "Roll 3 numbers containing an 8.",
    "contains8",
    3,
    25,
  ),
  main(
    "bookends",
    "Haunted bookends",
    "Roll a number with the same first and last digit.",
    "bookends",
    1,
    30,
  ),
  main(
    "grand-finale",
    "A grand finale",
    "Reach 15,000 base EP on one roll, before wallet bonuses.",
    "peakEP",
    15000,
    40,
    "peak",
  ),
  world(
    "footsteps",
    "Footsteps in the mist",
    "Finish 6 World rounds in any zone.",
    "rolls",
    6,
    20,
  ),
  world(
    "expedition",
    "A little expedition",
    "Finish 12 World rounds in any zone.",
    "rolls",
    12,
    30,
  ),
  world(
    "even-echoes",
    "Even echoes",
    "Reveal 4 even world numbers.",
    "even",
    4,
    20,
  ),
  world(
    "odd-echoes",
    "Odd echoes",
    "Reveal 4 odd world numbers.",
    "odd",
    4,
    20,
  ),
  world(
    "high-road",
    "The high road",
    "Reveal 4 numbers in the upper half of their World zone.",
    "high",
    4,
    20,
  ),
  world(
    "low-road",
    "The low road",
    "Reveal 4 numbers in the lower half of their World zone.",
    "low",
    4,
    20,
  ),
  world(
    "sixes-whisper",
    "The sixes whisper",
    "Reveal 3 world numbers containing a 6.",
    "contains6",
    3,
    25,
  ),
  world(
    "curio-courier",
    "Badge courier",
    "Roll Uncommon or better 5 times in the World.",
    "curios",
    5,
    25,
  ),
  world(
    "cabinet-hunt",
    "Two new badges",
    "Collect 2 World badges that are new to your collection.",
    "newCurios",
    2,
    35,
  ),
  world(
    "unwalked-paths",
    "Unwalked paths",
    "Finish rounds in 2 World zones you have never visited.",
    "newPlaces",
    2,
    35,
  ),
  world(
    "ghosts-gambit",
    "Rare sightings",
    "Roll Rare or better 3 times in the World.",
    "hits",
    3,
    25,
  ),
  world(
    "three-in-a-row",
    "Three in a row",
    "Roll Uncommon or better 3 times in a row in any zone before the Valley. Common results reset this task.",
    "streak",
    3,
    40,
    "streak",
  ),
];
export const hourlyTaskById = new Map(
  RNGWEEN_HOURLY_TASKS.map((task) => [task.id, task]),
);
const amount = (n) => Number.isSafeInteger(n) && n >= 0;
const timestamp = (n) => amount(n) && n <= 8640000000000000;

export function parseRngweenHourly(value) {
  if (value === undefined) return { board: null, repaired: false };
  const invalid = () => ({ board: null, repaired: true });
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !["opening", "farewell"].includes(value.window) ||
    !amount(value.nextSerial) ||
    value.nextSerial < 5 ||
    !amount(value.completed) ||
    !amount(value.earned) ||
    value.earned < value.completed * 15 ||
    value.earned > value.completed * 55 ||
    value.completed >= value.nextSerial ||
    !Array.isArray(value.dealt) ||
    value.dealt.length > RNGWEEN_HOURLY_TASKS.length ||
    value.dealt.some((id) => !hourlyTaskById.has(id)) ||
    new Set(value.dealt).size !== value.dealt.length ||
    !Array.isArray(value.slots) ||
    value.slots.length !== RNGWEEN_HOURLY_SLOTS
  )
    return invalid();
  const ids = new Set();
  const serials = new Set();
  const slots = [];
  for (const slot of value.slots) {
    const task = hourlyTaskById.get(slot?.taskId);
    if (
      !task ||
      ids.has(task.id) ||
      !amount(slot.serial) ||
      slot.serial < 1 ||
      slot.serial >= value.nextSerial ||
      serials.has(slot.serial) ||
      !timestamp(slot.startedAt) ||
      !timestamp(slot.expiresAt) ||
      // A replacement dealt after a claim keeps the claimed slot's deadline,
      // so it can start later than one hour before it expires; never earlier.
      slot.expiresAt > slot.startedAt + RNGWEEN_HOURLY_MS ||
      slot.expiresAt <= slot.startedAt ||
      rngweenCalendar(slot.startedAt).hourlyWindow !== value.window ||
      !amount(slot.count) ||
      slot.count > task.goal ||
      (slot.completedAt !== undefined &&
        (!timestamp(slot.completedAt) ||
          slot.completedAt < slot.startedAt ||
          slot.completedAt >= slot.expiresAt)) ||
      slot.count >= task.goal !== (slot.completedAt !== undefined)
    )
      return invalid();
    ids.add(task.id);
    serials.add(slot.serial);
    slots.push({
      taskId: task.id,
      serial: slot.serial,
      startedAt: slot.startedAt,
      expiresAt: slot.expiresAt,
      count: slot.count,
      ...(slot.completedAt !== undefined
        ? { completedAt: slot.completedAt }
        : {}),
    });
  }
  return {
    board: {
      window: value.window,
      nextSerial: value.nextSerial,
      completed: value.completed,
      earned: value.earned,
      dealt: [...value.dealt],
      slots,
    },
    repaired: false,
  };
}

export function eligibleHourlyTasks(
  state,
  worldUnlocked = !state.rngweenLimited?.retired,
) {
  const world = worldState(state.rngweenLimited);
  const availableZones = WORLD_ZONES.filter(
    (zone) =>
      zone.id !== "valley" ||
      (rngweenValleyUnlocked(state.rngweenLimited) &&
        (state.rngweenLimited?.drawn?.length ?? 0) < 9999),
  );
  const undiscovered = availableZones.filter(
    (zone) =>
      !world.visited.includes(zone.id) && world.pending?.zone !== zone.id,
  ).length;
  const newBadges = availableZones.reduce((remaining, zone) => {
    const pending =
      world.pending?.zone === zone.id &&
      (world.pending.rules === WORLD_MINI_RULES || zone.id === "valley")
        ? scoreWorldNumber(zone.id, world.pending.number).badges
        : [];
    // Already committed numbers cannot credit a later assignment; reserve
    // their discoveries instead of dealing an impossible finite collection.
    return (
      remaining +
      WORLD_BADGES[zone.id].filter(
        (badge) =>
          !world.mini?.[zone.id]?.counts?.[badge.id] &&
          !pending.some((result) => result.id === badge.id),
      ).length
    );
  }, 0);
  // The three public badge phases always allow fair repeats. Exhausting the Valley never
  // leaves a player with impossible errands or removes the public badge phases.
  return RNGWEEN_HOURLY_TASKS.filter(
    (task) =>
      task.source === "main" ||
      (worldUnlocked &&
        (task.metric !== "newPlaces" || undiscovered >= task.goal) &&
        (task.metric !== "newCurios" || newBadges >= task.goal)),
  );
}

function hash(text) {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}
function deal(board, state, at, worldUnlocked, avoid = null, expiresAt = null) {
  const active = new Set([
    ...board.slots.map((slot) => slot.taskId),
    ...(avoid ? [avoid] : []),
  ]);
  const pool = eligibleHourlyTasks(state, worldUnlocked).filter(
    (task) => !active.has(task.id),
  );
  let choices = pool.filter((task) => !board.dealt.includes(task.id));
  if (!choices.length) {
    board.dealt = [...active];
    choices = pool;
  }
  // World entry is public. Reserve the next vacant slot for a badge-hunt errand
  // if none is active; never overwrite an older saved main assignment.
  if (
    worldUnlocked &&
    !board.slots.some(
      (slot) => hourlyTaskById.get(slot.taskId)?.source === "world",
    )
  ) {
    let worldChoices = choices.filter((task) => task.source === "world");
    if (!worldChoices.length && pool.some((task) => task.source === "world")) {
      board.dealt = board.dealt.filter(
        (id) => hourlyTaskById.get(id)?.source !== "world" || active.has(id),
      );
      worldChoices = pool.filter((task) => task.source === "world");
    }
    if (worldChoices.length) choices = worldChoices;
  }
  // Task ordering, not roll RNG: deterministic for a saved profile/serial and
  // recorded once under the account writer lock, so linked devices agree.
  choices.sort(
    (a, b) =>
      hash(`${state.profile.id}:${board.window}:${board.nextSerial}:${a.id}`) -
        hash(
          `${state.profile.id}:${board.window}:${board.nextSerial}:${b.id}`,
        ) || a.id.localeCompare(b.id),
  );
  const task = choices[0];
  if (!task || !amount(board.nextSerial + 1))
    throw new Error("The commission board could not be refreshed.");
  board.dealt.push(task.id);
  return {
    taskId: task.id,
    serial: board.nextSerial++,
    startedAt: at,
    expiresAt: expiresAt ?? at + RNGWEEN_HOURLY_MS,
    count: 0,
  };
}
export function hourlyNeedsRefresh(state, at) {
  if (
    !state.profile ||
    state.rngweenLimited?.retired ||
    rngweenCalendar(at).hourlyPhase !== "active"
  )
    return false;
  const board = state.rngweenLimited?.hourly;
  return (
    !board ||
    board.window !== rngweenCalendar(at).hourlyWindow ||
    board.slots.some((slot) => slot.expiresAt <= at)
  );
}
export function refreshRngweenHourly(
  state,
  at,
  worldUnlocked = !state.rngweenLimited?.retired,
) {
  const calendar = rngweenCalendar(at);
  if (
    !state.profile ||
    state.rngweenLimited?.retired ||
    calendar.hourlyPhase !== "active"
  )
    return state;
  const previous = state.rngweenLimited?.hourly;
  // Recovery uses a roll's original verified UTC. It must not rewind a newer
  // board, including the November phase that another device already saved.
  if (
    previous?.window !== calendar.hourlyWindow &&
    previous?.slots.some((slot) => slot.startedAt > at)
  )
    return state;
  if (!hourlyNeedsRefresh(state, at)) return state;
  const board = {
    window: calendar.hourlyWindow,
    // A repaired board must not reuse an extant reward receipt's serial.
    nextSerial:
      previous?.nextSerial ??
      1 +
        Math.max(
          0,
          ...state.history
            .filter((row) => row.type === "rngween-hourly")
            .map((row) => Number(row.id.split(":").at(-1)) || 0),
        ),
    completed: previous?.completed ?? 0,
    earned: previous?.earned ?? 0,
    dealt:
      previous?.window === calendar.hourlyWindow ? [...previous.dealt] : [],
    slots:
      previous?.window === calendar.hourlyWindow
        ? previous.slots.map((slot) => ({ ...slot }))
        : [],
  };
  // Retain every unexpired assignment. Completing, expiry and the phase change
  // are the only replacements: buying a key or reloading is never a skip.
  const expired = board.slots
    .map((slot, index) => (slot.expiresAt <= at ? index : -1))
    .filter((index) => index >= 0);
  for (const index of expired) {
    const old = board.slots[index];
    board.slots.splice(index, 1);
    const next = deal(board, state, at, worldUnlocked, old.taskId);
    if (next.taskId === old.taskId)
      throw new Error("A completed assignment cannot replace itself.");
    board.slots.splice(index, 0, next);
  }
  while (board.slots.length < RNGWEEN_HOURLY_SLOTS)
    board.slots.push(deal(board, state, at, worldUnlocked));
  return {
    ...state,
    rngweenLimited: { ...state.rngweenLimited, hourly: board },
  };
}
export function hourlyView(state, at) {
  const calendar = rngweenCalendar(at);
  const board = state.rngweenLimited?.hourly;
  const active =
    calendar.hourlyPhase === "active" && !state.rngweenLimited?.retired;
  return {
    active,
    phase: calendar.hourlyPhase,
    endsAt: calendar.hourlyEndsAt,
    completed: board?.completed ?? 0,
    earned: board?.earned ?? 0,
    slots:
      active && board?.window === calendar.hourlyWindow
        ? board.slots.map((slot) => ({
            ...slot,
            task: hourlyTaskById.get(slot.taskId),
            key: `${RNGWEEN_ID}:${board.window}:${slot.serial}`,
            complete: slot.completedAt !== undefined,
            claimable:
              slot.completedAt !== undefined &&
              at < Math.min(slot.expiresAt, calendar.hourlyEndsAt),
            remaining: Math.max(
              0,
              Math.min(slot.expiresAt, calendar.hourlyEndsAt) - at,
            ),
          }))
        : [],
  };
}

export function mainHourlyTally(result, { banked = 0 } = {}) {
  const number = result.number;
  const digits = String(number);
  const sum = [...digits].reduce((total, digit) => total + Number(digit), 0);
  const tier = result.tier;
  return {
    rolls: 1,
    banked,
    even: number % 2 === 0 ? 1 : 0,
    odd: number % 2 === 1 ? 1 : 0,
    high: number >= 500000 ? 1 : 0,
    low: number < 500000 ? 1 : 0,
    ends0: number % 10 === 0 ? 1 : 0,
    ends5: number % 10 === 5 ? 1 : 0,
    ends6: number % 10 === 6 ? 1 : 0,
    ...Object.fromEntries(
      [0, 1, 3, 6, 7, 8, 9].map((digit) => [
        `contains${digit}`,
        digits.includes(String(digit)) ? 1 : 0,
      ]),
    ),
    repeated: new Set(digits).size < digits.length ? 1 : 0,
    sumHigh: sum >= 30 ? 1 : 0,
    sumLow: sum <= 15 ? 1 : 0,
    ...Object.fromEntries(
      [3, 5, 7, 11].map((n) => [`divisible${n}`, number % n === 0 ? 1 : 0]),
    ),
    ascending: [...digits].some(
      (digit, i) => i > 0 && Number(digit) === Number(digits[i - 1]) + 1,
    )
      ? 1
      : 0,
    descending: [...digits].some(
      (digit, i) => i > 0 && Number(digit) === Number(digits[i - 1]) - 1,
    )
      ? 1
      : 0,
    badges12: result.badges.length >= 12 ? 1 : 0,
    badges18: result.badges.length >= 18 ? 1 : 0,
    rare: ["rare", "epic", "anomaly", "mythic", "godly"].includes(tier) ? 1 : 0,
    epic: ["epic", "anomaly", "mythic", "godly"].includes(tier) ? 1 : 0,
    bookends: digits[0] === digits.at(-1) ? 1 : 0,
    peakEP: result.totalEP,
  };
}
export function worldHourlyTally(previous, next, number, zoneId = "valley") {
  const before = worldState(previous);
  const after = worldState(next);
  const zone = worldZoneById.get(zoneId);
  const wins = Math.max(0, after.wins - before.wins);
  const mini = after.last?.rules === WORLD_MINI_RULES;
  const legacyMax =
    after.last?.rules === 2
      ? WORLD_LEGACY_STAGES[zoneId]?.[after.last.stage]
      : WORLD_LEGACY_STAGES[zoneId]
        ? WORLD_LEGACY_STAGES[zoneId][0]
        : zone.max;
  const high = number >= Math.floor((mini ? zone.max : legacyMax) / 2) + 1;
  const result = mini ? scoreWorldNumber(zoneId, number) : null;
  const quality = mini ? Number(result.tier !== "common") : wins;
  const rare = mini
    ? Number(["rare", "epic", "legendary"].includes(result.tier))
    : wins;
  const newBadges = mini
    ? worldMiniSummary(zoneId, after.mini?.[zoneId]).unique -
      worldMiniSummary(zoneId, before.mini?.[zoneId]).unique
    : wins;
  return {
    rolls: 1,
    even: number % 2 === 0 ? 1 : 0,
    odd: number % 2 === 1 ? 1 : 0,
    high: high ? 1 : 0,
    low: high ? 0 : 1,
    contains6: String(number).includes("6") ? 1 : 0,
    // Stable IDs preserve assigned tasks; only newly settled event badges count.
    curios: quality,
    newCurios: Math.max(0, newBadges),
    newPlaces: after.visited.length - before.visited.length,
    hits: rare,
    ...(zone.fragment ? { streak: quality } : {}),
  };
}
export function recordRngweenHourly(
  state,
  source,
  tally,
  at,
  worldUnlocked = !state.rngweenLimited?.retired,
  startedAt = at,
) {
  if (source === "world" && !worldUnlocked) return state;
  const calendar = rngweenCalendar(at);
  if (
    !state.profile ||
    state.rngweenLimited?.retired ||
    calendar.hourlyPhase !== "active"
  )
    return state;
  const before = state.rngweenLimited?.hourly;
  const current = refreshRngweenHourly(state, at, worldUnlocked);
  const board = current.rngweenLimited.hourly;
  if (board.window !== calendar.hourlyWindow) return current;
  const previousIds = new Set(
    before?.window === calendar.hourlyWindow
      ? before.slots
          .filter((slot) => slot.startedAt <= at && slot.expiresAt > at)
          .map((slot) => slot.serial)
      : [],
  );
  const next = {
    ...board,
    dealt: [...board.dealt],
    slots: board.slots.map((slot) => ({ ...slot })),
  };
  for (let index = 0; index < next.slots.length; index++) {
    const slot = next.slots[index];
    const task = hourlyTaskById.get(slot.taskId);
    const value = tally?.[task.metric];
    if (
      !previousIds.has(slot.serial) ||
      slot.startedAt > startedAt ||
      task.source !== source ||
      !amount(value) ||
      (!value && task.mode !== "streak")
    )
      continue;
    const count =
      task.mode === "streak"
        ? value
          ? slot.count + 1
          : 0
        : task.mode === "peak"
          ? Math.max(slot.count, value)
          : slot.count + value;
    if (count < task.goal) {
      next.slots[index] = { ...slot, count };
      continue;
    }
    // Done. The reward waits for the player's claim until this slot's hour
    // ends; nothing is paid or replaced on its own.
    next.slots[index] = { ...slot, count: task.goal, completedAt: at };
  }
  if (JSON.stringify(next) === JSON.stringify(board)) return current;
  return {
    ...current,
    rngweenLimited: { ...current.rngweenLimited, hourly: next },
  };
}

// The player collects a finished commission. It pays its Pumpkoins, is written
// to history once, and its slot immediately receives a new task that runs
// until the same hour mark the old one had.
export function claimRngweenHourly(
  state,
  serial,
  at,
  worldUnlocked = !state.rngweenLimited?.retired,
) {
  const calendar = rngweenCalendar(at);
  if (!state.profile) throw new Error("Create a saved profile first.");
  if (state.rngweenLimited?.retired || calendar.hourlyPhase !== "active")
    throw new Error("Commissions are not running right now.");
  const board = state.rngweenLimited?.hourly;
  if (!board || board.window !== calendar.hourlyWindow)
    throw new Error("That commission is no longer on the board.");
  const index = board.slots.findIndex((slot) => slot.serial === serial);
  const slot = board.slots[index];
  if (!slot) throw new Error("That commission is no longer on the board.");
  if (slot.completedAt === undefined)
    throw new Error("Finish the commission before claiming it.");
  if (at >= Math.min(slot.expiresAt, calendar.hourlyEndsAt))
    throw new Error("That commission's hour is over; its reward has expired.");
  const id = `rngween-hourly:${calendar.hourlyWindow}:${slot.serial}`;
  if (state.history.some((row) => row.id === id))
    throw new Error("That commission was already claimed.");
  const task = hourlyTaskById.get(slot.taskId);
  const next = {
    ...board,
    dealt: [...board.dealt],
    slots: board.slots.map((entry) => ({ ...entry })),
    completed: board.completed + 1,
    earned: board.earned + task.pumpkoins,
  };
  next.slots.splice(index, 1);
  next.slots.splice(
    index,
    0,
    deal(next, state, at, worldUnlocked, slot.taskId, slot.expiresAt),
  );
  const coins = state.rngweenLimited.pumpkoins + task.pumpkoins;
  if (![coins, next.completed, next.earned].every(amount))
    throw new Error("Pumpkoin balance limit reached.");
  return {
    ...state,
    rngweenLimited: { ...state.rngweenLimited, pumpkoins: coins, hourly: next },
    history: [
      ...state.history,
      {
        id,
        type: "rngween-hourly",
        at,
        taskId: task.id,
        name: task.title,
        pumpkoins: task.pumpkoins,
      },
    ],
  };
}
