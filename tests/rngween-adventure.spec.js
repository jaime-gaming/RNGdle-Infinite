import {
  WORLD_ZONES,
  emptyRngweenWorld,
  worldState,
} from "../src/rngween-world-zones.js";
import {
  completedWorldRoll,
  revealWorld,
  withWorldPath,
} from "./helpers/world-roll.js";
import { test, expect } from "./helpers/clock.js";
import { pauseClockAt } from "./helpers/clock.js";
import { eventContext } from "./helpers/intro.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { RNGWEEN_WORLD_INTRO_KEY } from "../src/rngween-intro.js";
import { mockWorldNumbers } from "./helpers/world-random.js";
import { mockRandom } from "./helpers/random-roll.js";
import { evaluate } from "./helpers/index.js";
import {
  emptyProgress,
  applyProgress,
  parseAndRepairProgress,
  PROGRESS_KEY,
  recoverUnsavedRolls,
} from "../src/progress.js";
import { rngweenCalendar } from "../src/rngween.js";
import {
  RNGWEEN_WORLD_KEY,
  emptyRngweenLimited,
  rngweenWorldUnlocked,
} from "../src/rngween-limited.js";
import {
  RNGWEEN_HOURLY_MS,
  RNGWEEN_HOURLY_TASKS,
  hourlyTaskById,
  eligibleHourlyTasks,
  parseRngweenHourly,
  refreshRngweenHourly,
  recordRngweenHourly,
  claimRngweenHourly,
  mainHourlyTally,
  worldHourlyTally,
  hourlyView,
} from "../src/rngween-hourly.js";
import {
  WORLD_PLACES,
  WORLD_CURIOS,
  worldPlace,
  worldCurio,
  worldDiscoveries,
  worldChapters,
  worldGuessChance,
  worldGuessMatches,
  emptyWorldAdventure,
  parseWorldAdventure,
  recordWorldAdventure,
} from "../src/rngween-world-adventure.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { tallyEntries } from "../src/history-tally.js";

const opening = Date.UTC(2026, 9, 22, 12);
const trials = Date.UTC(2026, 9, 26, 12);
const farewell = Date.UTC(2026, 10, 2, 12);
const expired = Date.UTC(2026, 10, 4);
// Commission tests roll in any public zone, so the path is already walked
// (fragments only) and every zone before the Valley is open.
const account = (patch = {}) =>
  withWorldPath(
    { ...emptyProgress(), profile: testProfile, ...patch },
    "haunted-house",
  );
const keyAccount = (patch = {}) =>
  account({
    rngweenLimited: {
      ...emptyRngweenLimited(),
      bought: [RNGWEEN_WORLD_KEY.id],
    },
    ...patch,
  });
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
function withContract(id, at = opening, { world = false, count = 0 } = {}) {
  let p = refreshRngweenHourly(world ? keyAccount() : account(), at, world);
  const ids = [
    id,
    ...RNGWEEN_HOURLY_TASKS.filter(
      (task) => task.source === "main" && task.id !== id,
    )
      .slice(0, 3)
      .map((task) => task.id),
  ];
  p.rngweenLimited.hourly.dealt = [...ids];
  p.rngweenLimited.hourly.slots = ids.map((taskId, index) => ({
    taskId,
    serial: index + 1,
    startedAt: at,
    expiresAt: at + RNGWEEN_HOURLY_MS,
    count: index ? 0 : count,
  }));
  return p;
}
function mainRoll(p, number = 861456, patch = {}) {
  return applyProgress(p, {
    type: "complete",
    id: `test-main-${p.receipts.length}`,
    result: evaluate(number),
    at: opening + 1000,
    rngweenAt: opening + 1000,
    cooldownUntil: 0,
    ...patch,
  });
}
// Commissions pay on a manual claim now, so tests settle every finished
// slot the way a player would from the Tasks page.
function claimDone(p, at = opening + 1000, world = null) {
  const board = p.rngweenLimited?.hourly;
  if (!board) return p;
  return board.slots
    .filter((slot) => slot.completedAt !== undefined)
    .reduce(
      (state, slot) =>
        world === null
          ? applyProgress(state, {
              type: "claim-rngween-hourly",
              serial: slot.serial,
              at,
              rngweenAt: at,
            })
          : claimRngweenHourly(state, slot.serial, at, world),
      p,
    );
}
// Claims the first finished commission from the Commissions tab of whatever
// page is open (World) or from Tasks.
async function claimOnPage(tab, amount, { inWorld = false } = {}) {
  if (inWorld)
    await tab.getByRole("tab", { name: "Commissions", exact: true }).click();
  else await tab.goto("/tasks/rngween");
  await tab
    .getByRole("button", { name: new RegExp(`Claim \\+${amount}`) })
    .first()
    .click();
  // The card folds for 300 ms before the save; a frozen test clock must tick.
  await tab.clock.runFor(400).catch(() => {});
}
function worldRoll(p, number, prediction = "odd", at = trials) {
  return completedWorldRoll(p, {
    type: "rngween-world-roll",
    number,
    prediction,
    at,
    rngweenAt: at,
    expectedCount: p.rngweenLimited.drawn.length,
  });
}

test("event/shop/Halloween run October 21–November 3 UTC; aura week and hourly phases stay separate", () => {
  for (const [at, limitedPhase, decorated, phase, hourlyWindow] of [
    [
      Date.UTC(2026, 9, 20, 23, 59, 59, 999),
      "upcoming",
      false,
      "upcoming",
      null,
    ],
    [Date.UTC(2026, 9, 21), "active", true, "upcoming", "opening"],
    [
      Date.UTC(2026, 9, 24, 23, 59, 59, 999),
      "active",
      true,
      "upcoming",
      "opening",
    ],
    [Date.UTC(2026, 9, 25), "active", true, "active", null],
    [Date.UTC(2026, 9, 31, 23, 59, 59, 999), "active", true, "active", null],
    [Date.UTC(2026, 10, 1), "active", true, "ended", "farewell"],
    [
      Date.UTC(2026, 10, 3, 23, 59, 59, 999),
      "active",
      true,
      "ended",
      "farewell",
    ],
    [expired, "ended", false, "ended", null],
  ])
    expect(rngweenCalendar(at)).toMatchObject({
      limitedPhase,
      decorated,
      phase,
      hourlyWindow,
    });
  for (const at of [null, undefined, NaN]) {
    expect(rngweenCalendar(at).hourlyPhase).toBe("unavailable");
    expect(refreshRngweenHourly(account(), at)).toEqual(account());
  }
});

test("60 unique online commissions cover 48 main-game and 12 World tasks with bounded coin rewards", () => {
  // The catalogue is whatever it ships with; what matters is that every
  // commission is distinct and that the World keeps its own twelve.
  expect(RNGWEEN_HOURLY_TASKS).toHaveLength(60);
  expect(new Set(RNGWEEN_HOURLY_TASKS.map((t) => t.id)).size).toBe(
    RNGWEEN_HOURLY_TASKS.length,
  );
  expect(new Set(RNGWEEN_HOURLY_TASKS.map((t) => t.title)).size).toBe(
    RNGWEEN_HOURLY_TASKS.length,
  );
  expect(RNGWEEN_HOURLY_TASKS.filter((t) => t.source === "world")).toHaveLength(
    12,
  );
  expect(eligibleHourlyTasks(account()).some((t) => t.source === "world")).toBe(
    true,
  );
  for (const task of RNGWEEN_HOURLY_TASKS) {
    expect(task.goal).toBeGreaterThan(0);
    expect(task.pumpkoins).toBeGreaterThanOrEqual(15);
    expect(task.pumpkoins).toBeLessThanOrEqual(55);
    expect(Number.isSafeInteger(task.goal)).toBe(true);
  }
});

test("four unique assignments each get exactly one hour; refresh/reload/guest play never reroll them", () => {
  const p = refreshRngweenHourly(account(), opening, false);
  expect(p.rngweenLimited.hourly.slots).toHaveLength(4);
  for (const slot of p.rngweenLimited.hourly.slots)
    expect(slot.expiresAt - slot.startedAt).toBe(RNGWEEN_HOURLY_MS);
  expect(new Set(p.rngweenLimited.hourly.slots.map((s) => s.taskId)).size).toBe(
    4,
  );
  expect(refreshRngweenHourly(p, opening + 3599999)).toBe(p);
  const parsed = parseAndRepairProgress(JSON.stringify(p));
  expect(parsed.repairs).toEqual([]);
  expect(parsed.progress.rngweenLimited.hourly).toEqual(
    p.rngweenLimited.hourly,
  );
  expect(refreshRngweenHourly(emptyProgress(), opening)).toEqual(
    emptyProgress(),
  );
});

test("every catalog task pays once when claimed and immediately deals a different zero-progress task", () => {
  for (const task of RNGWEEN_HOURLY_TASKS) {
    const p = withContract(task.id, opening, {
      world: task.source === "world",
    });
    let q = p;
    for (let i = 0; i < (task.mode === "streak" ? task.goal : 1); i++)
      q = recordRngweenHourly(
        q,
        task.source,
        { [task.metric]: task.goal + 100 },
        opening + 1000,
        task.source === "world",
      );
    // Finished but unclaimed: still on the board, nothing paid yet.
    expect(q.rngweenLimited.hourly.slots[0].taskId).toBe(task.id);
    expect(q.rngweenLimited.hourly.slots[0].completedAt).toBe(opening + 1000);
    expect(q.rngweenLimited.pumpkoins).toBe(p.rngweenLimited.pumpkoins);
    q = claimDone(q);
    expect(q.rngweenLimited.hourly.slots).toHaveLength(4);
    expect(q.rngweenLimited.hourly.slots[0].taskId).not.toBe(task.id);
    expect(q.rngweenLimited.hourly.slots[0].count).toBe(0);
    expect(q.rngweenLimited.hourly.slots[0].startedAt).toBe(opening + 1000);
    const receipts = q.history.filter((row) => row.taskId === task.id);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].pumpkoins).toBe(task.pumpkoins);
    expect(q.rngweenLimited.pumpkoins).toBe(
      q.history.reduce((total, row) => total + row.pumpkoins, 0),
    );
    expect(q.balance).toBe(p.balance);
    expect(q.totalEarned).toBe(p.totalEarned);
    expect(q.tasks).toEqual(p.tasks);
    expect(parseAndRepairProgress(JSON.stringify(q)).repairs).toEqual([]);
  }
});

test("expiry pays nothing, keeps four slots, prevents late activity credit and starts fresh hour-long tasks", () => {
  const p = withContract("main-lantern-laps", opening, { count: 4 });
  const q = recordRngweenHourly(
    p,
    "main",
    { rolls: 1000 },
    opening + RNGWEEN_HOURLY_MS,
  );
  expect(q.rngweenLimited.pumpkoins).toBe(0);
  expect(q.history).toEqual([]);
  expect(q.rngweenLimited.hourly.completed).toBe(0);
  expect(
    q.rngweenLimited.hourly.slots.every(
      (slot) =>
        slot.count === 0 && slot.startedAt === opening + RNGWEEN_HOURLY_MS,
    ),
  ).toBe(true);
  expect(q.rngweenLimited.hourly.nextSerial).toBe(9);
});

test("new phases discard opening assignments, keep totals and serials, and have no progress during aura week", () => {
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  const won = mainRoll(p, 12);
  const before = structuredClone(won.rngweenLimited.hourly);
  expect(
    recordRngweenHourly(won, "main", { rolls: 100, even: 100 }, trials),
  ).toBe(won);
  expect(hourlyView(won, trials).active).toBe(false);
  const after = refreshRngweenHourly(won, farewell);
  expect(after.rngweenLimited.hourly.window).toBe("farewell");
  expect(after.rngweenLimited.hourly.completed).toBe(before.completed);
  expect(after.rngweenLimited.hourly.earned).toBe(before.earned);
  expect(
    after.rngweenLimited.hourly.slots.every(
      (s) => s.serial >= before.nextSerial && s.count === 0,
    ),
  ).toBe(true);
  expect(after.rngweenLimited.pumpkoins).toBe(won.rngweenLimited.pumpkoins);
});

test("public World commissions join future slots without a key and never skip or overwrite older main assignments", () => {
  const p = refreshRngweenHourly(account(), opening, false);
  expect(refreshRngweenHourly(p, opening + 1000, true)).toBe(p);
  const q = refreshRngweenHourly(p, opening + RNGWEEN_HOURLY_MS, true);
  expect(
    q.rngweenLimited.hourly.slots.some(
      (slot) => hourlyTaskById.get(slot.taskId).source === "world",
    ),
  ).toBe(true);
  expect(
    eligibleHourlyTasks(account()).some((task) => task.source === "world"),
  ).toBe(true);
  expect(
    eligibleHourlyTasks(account(), false).every(
      (task) => task.source === "main",
    ),
  ).toBe(true);
});

test("the commission deck varies across assignments without repeats before the available main pool cycles", () => {
  let p = refreshRngweenHourly(account(), opening, false);
  const seen = new Set(
    p.rngweenLimited.hourly.slots.map((slot) => slot.taskId),
  );
  for (let i = 0; i < 30; i++) {
    const old = p.rngweenLimited.hourly.slots[0];
    const task = hourlyTaskById.get(old.taskId);
    p = claimDone(
      recordRngweenHourly(
        p,
        "main",
        { [task.metric]: task.goal },
        opening + i + 1,
        false,
      ),
      opening + i + 1,
      false,
    );
    const next = p.rngweenLimited.hourly.slots[0];
    expect(seen.has(next.taskId)).toBe(false);
    seen.add(next.taskId);
  }
  expect(seen.size).toBe(34);
});

test("public minigame errands remain possible after Valley exhaustion; only already discovered-zone tasks leave the future deck", () => {
  const drawn = Array.from({ length: 9999 }, (_, i) => i + 1);
  const p = keyAccount({
    rngweenLimited: {
      ...emptyRngweenLimited(),
      bought: [RNGWEEN_WORLD_KEY.id],
      drawn,
      world: emptyRngweenWorld(drawn),
    },
  });
  expect(
    eligibleHourlyTasks(p).filter((task) => task.source === "world"),
  ).toHaveLength(12);
  p.rngweenLimited.world.visited = [
    "pumpkin-patch",
    "graveyard",
    "haunted-house",
    "valley",
  ];
  expect(
    eligibleHourlyTasks(p).some((task) => task.metric === "newPlaces"),
  ).toBe(false);
  expect(
    eligibleHourlyTasks(p).filter((task) => task.source === "world"),
  ).toHaveLength(11);
});

test("hourly commissions cannot use Task Skips and neither skips, refreshes, exchanges nor claims create credit", () => {
  const p = withContract("main-lantern-laps");
  for (const task of RNGWEEN_HOURLY_TASKS)
    expect(() =>
      applyProgress(p, { type: "skip-task", id: task.id, at: opening }),
    ).toThrow("cannot be skipped");
  expect(
    applyProgress(p, { type: "refresh-rngween-hourly", at: opening + 1000 }),
  ).toBe(p);
  const q = applyProgress(
    { ...p, balance: 10000, totalEarned: 10000 },
    { type: "exchange-pumpkoins", amount: 1, at: opening },
  );
  expect(q.rngweenLimited.hourly).toEqual(p.rngweenLimited.hourly);
  expect(q.rngweenLimited.pumpkoins).toBe(1);
});

test("only online committed main numbers count; extras and offline income cannot inflate commissions or replay rewards", () => {
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  const missed = mainRoll(p, 13, { extras: [{ result: evaluate(12) }] });
  expect(missed.rngweenLimited.hourly.slots[0].count).toBe(1);
  expect(missed.rngweenLimited.pumpkoins).toBe(0);
  const offline = mainRoll(p, 12, { source: "offline" });
  expect(offline.rngweenLimited.hourly).toEqual(p.rngweenLimited.hourly);
  const finished = mainRoll(p, 12);
  expect(finished.rngweenLimited.pumpkoins).toBe(0);
  expect(finished.rngweenLimited.hourly.slots[0].completedAt).toBe(
    opening + 1000,
  );
  const won = claimDone(finished);
  expect(won.rngweenLimited.pumpkoins).toBe(15);
  expect(
    won.history.filter((row) => row.type === "rngween-hourly"),
  ).toHaveLength(1);
  // A second claim of the same slot is refused.
  expect(() =>
    claimDone({ ...won, rngweenLimited: finished.rngweenLimited }),
  ).toThrow("already claimed");
  const replay = applyProgress(won, {
    type: "complete",
    id: "test-main-0",
    result: evaluate(12),
    at: opening + 1000,
    rngweenAt: opening + 1000,
    cooldownUntil: 0,
  });
  expect(replay).toBe(won);
  expect(tallyEntries(won.history).rolls).toBe(1);
  expect(tallyEntries(won.history).best.ep).toBe(evaluate(12).totalEP);
});

test("verified calendar, not a changed device date, controls assignment and progress", () => {
  const p = withContract("main-lantern-laps");
  const during = mainRoll(p, 12, {
    at: Date.UTC(2099, 0, 1),
    rngweenAt: opening + 1000,
  });
  expect(during.rngweenLimited.hourly.slots[0].count).toBe(1);
  for (const rngweenAt of [null, trials, Date.UTC(2026, 9, 20)]) {
    const q = mainRoll(p, 12, { rngweenAt });
    expect(q.rngweenLimited.hourly).toEqual(p.rngweenLimited.hourly);
    expect(q.balance).toBe(evaluate(12).totalEP);
  }
  expect(() =>
    applyProgress(p, {
      type: "refresh-rngween-hourly",
      at: opening,
      rngweenAt: null,
    }),
  ).toThrow("open October");
});

test("main and World counters remain separate even if a contract shares a metric", () => {
  const p = withContract("world-even-echoes", opening, {
    world: true,
    count: 3,
  });
  const main = mainRoll(p, 12);
  expect(main.rngweenLimited.hourly.slots[0].count).toBe(3);
  const q = claimDone(worldRoll(p, 12, "even", opening + 1000));
  expect(q.rngweenLimited.pumpkoins).toBe(20);
  for (const field of [
    "tasks",
    "balance",
    "totalEarned",
    "skills",
    "skillCharge",
    "pendingRoll",
    "pets",
    "receipts",
  ])
    expect(q[field]).toEqual(p[field]);
  expect(q.history.filter((row) => row.type === "rngween-hourly")).toHaveLength(
    1,
  );
  expect(tallyEntries(q.history).rolls).toBe(0);
  expect(q.owned).toEqual(p.owned);
  expect(worldHourlyTally(p.rngweenLimited, q.rngweenLimited, 12).hits).toBe(0);
  expect(() => worldRoll(q, 12, "even", opening + 2000)).toThrow("unseen");
});

test("rebirth, prestige, rollback, history pruning and reload preserve the board without refilling its rewards", () => {
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  const won = mainRoll(p, 12);
  const qualified = {
    ...won,
    balance: 90000000,
    totalEarned: 90000000,
    cycleEarnedEP: 90000000,
    discovered: allBadgeMetadata.map((b) => b.id),
  };
  for (const [type, values] of [
    ["rebirth", { expectedRebirths: 0 }],
    ["ultra-rebirth", { expectedUltraRebirths: 0, rebirths: 6 }],
    ["rollback", { expectedRollbacks: 0, rebirths: 6, ultraRebirths: 3 }],
  ]) {
    const q = applyProgress(
      { ...qualified, ...values },
      { type, ...values, at: opening + 2000, rngweenAt: opening + 2000 },
    );
    expect(q.rngweenLimited.hourly).toEqual(won.rngweenLimited.hourly);
    expect(q.rngweenLimited.pumpkoins).toBe(won.rngweenLimited.pumpkoins);
  }
  const cut = applyProgress(won, {
    type: "history-prune",
    mode: "oldest",
    count: 10,
    at: opening,
  });
  const parsed = parseAndRepairProgress(JSON.stringify(cut));
  expect(parsed.repairs).toEqual([]);
  expect(parsed.progress.rngweenLimited.hourly).toEqual(
    won.rngweenLimited.hourly,
  );
});

test("new temp state parses cleanly, bad boards never mint coins, and Nov 4 removes all temporary state", () => {
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  const q = claimDone(mainRoll(p, 12));
  for (const bad of [
    null,
    {},
    { ...q.rngweenLimited.hourly, slots: [] },
    {
      ...q.rngweenLimited.hourly,
      slots: q.rngweenLimited.hourly.slots.map((s) => ({
        ...s,
        count: 999999,
      })),
    },
    { ...q.rngweenLimited.hourly, nextSerial: Infinity },
  ])
    expect(parseRngweenHourly(bad).repaired).toBe(true);
  const corrupted = parseAndRepairProgress(
    JSON.stringify({
      ...q,
      rngweenLimited: { ...q.rngweenLimited, hourly: {} },
    }),
  );
  expect(corrupted.progress.rngweenLimited.pumpkoins).toBe(
    q.rngweenLimited.pumpkoins,
  );
  const refreshed = refreshRngweenHourly(corrupted.progress, opening + 10000);
  expect(refreshed.rngweenLimited.hourly.slots[0].serial).toBeGreaterThan(1);
  expect(refreshed.rngweenLimited.pumpkoins).toBe(q.rngweenLimited.pumpkoins);
  const retired = applyProgress(q, {
    type: "retire-rngween-limited",
    at: expired,
    rngweenAt: expired,
  });
  for (const field of ["hourly", "adventure", "pumpkoins", "drawn", "bought"])
    expect(retired.rngweenLimited).not.toHaveProperty(field);
  expect(retired.rngweenLimited.retired).toBe(true);
  expect(refreshRngweenHourly(retired, opening)).toBe(retired);
});

test("legacy expedition places and curios stay parseable but frozen data never changes secure numbers or awards a skin", () => {
  expect(WORLD_PLACES).toHaveLength(6);
  expect(WORLD_CURIOS).toHaveLength(8);
  const p = keyAccount();
  let limited = p.rngweenLimited;
  for (const n of [12, 1, 2, 3, 4, 5, 6, 7, 1800, 3400, 5100, 6800, 8500])
    limited = {
      ...limited,
      adventure: recordWorldAdventure(limited, n, n % 2 ? "odd" : "even"),
      drawn: [...limited.drawn, n],
    };
  delete limited.world;
  const read = parseAndRepairProgress(
    JSON.stringify({ ...p, rngweenLimited: limited }),
  );
  expect(read.repairs).toEqual([]);
  expect(worldDiscoveries(limited.drawn).places).toHaveLength(6);
  expect(worldDiscoveries(limited.drawn).curios).toHaveLength(8);
  expect(worldChapters(limited).every((c) => c.count >= c.goal)).toBe(true);
  expect(read.progress.owned).toEqual(p.owned);
  expect(read.progress.rngweenLimited.world.legacyPass).toBe(true);
  expect(read.progress.rngweenLimited.drawn).toEqual(limited.drawn);
  const q = worldRoll(read.progress, 9);
  expect(q.rngweenLimited).not.toHaveProperty("adventure");
  expect(q.owned).toEqual(p.owned);
  expect(q.tasks).toEqual(p.tasks);
  expect(parseAndRepairProgress(JSON.stringify(q)).repairs).toEqual([]);
  expect(worldPlace(0)).toBeNull();
  expect(worldPlace(10000)).toBeNull();
  expect(worldCurio(8)).toBeNull();
});

test("legacy prediction receipts remain honest and readable, but live World rolls now use minigame choices only", () => {
  let limited = { ...emptyRngweenLimited(), drawn: [] };
  for (const n of [1, 3, 5])
    limited = {
      ...limited,
      adventure: recordWorldAdventure(limited, n, "odd"),
      drawn: [...limited.drawn, n],
    };
  expect(limited.adventure).toMatchObject({
    predictions: 3,
    hits: 3,
    streak: 3,
    bestStreak: 3,
  });
  limited = {
    ...limited,
    adventure: recordWorldAdventure(limited, 2, "odd"),
    drawn: [...limited.drawn, 2],
  };
  expect(limited.adventure).toMatchObject({
    predictions: 4,
    hits: 3,
    streak: 0,
    bestStreak: 3,
  });
  expect(parseWorldAdventure(limited.adventure, limited.drawn).repaired).toBe(
    false,
  );
  expect(worldGuessMatches("low", 4999)).toBe(true);
  expect(worldGuessMatches("high", 5000)).toBe(true);
  const used = [1, 2, 3, 4999, 5000, 9999];
  for (const guess of ["odd", "even", "low", "high"]) {
    const unseen = Array.from({ length: 9999 }, (_, i) => i + 1).filter(
      (n) => !used.includes(n),
    );
    expect(worldGuessChance(used, guess)).toBe(
      unseen.filter((n) => worldGuessMatches(guess, n)).length / unseen.length,
    );
  }
  expect(
    parseWorldAdventure({ ...emptyWorldAdventure(), hits: 99 }, []).repaired,
  ).toBe(true);
  const p = keyAccount();
  const q = worldRoll(p, 6666, "force-sixes");
  expect(q.rngweenLimited).not.toHaveProperty("adventure");
  expect(q.rngweenLimited.skinEarned).toBe(true);
  expect(q.rngweenLimited.drawn).toEqual([6666]);
});

test("all 60 commissions can actually finish through scored main settlements or unseen World draws", () => {
  const sample = {
    rolls: 12,
    even: 12,
    odd: 13,
    high: 861456,
    high900: 961456,
    low: 12,
    low100k: 12345,
    ends0: 120,
    ends5: 125,
    ends6: 126,
    ends7: 127,
    repeated: 111111,
    sumHigh: 999999,
    sumLow: 12,
    divisible3: 33,
    divisible5: 50,
    divisible4: 12,
    divisible7: 77,
    divisible11: 121,
    divisible12: 24,
    ascending: 123456,
    descending: 654321,
    badges12: 861456,
    badges18: 0,
    rare: 861456,
    epic: 12,
    banked: 12,
    bookends: 12321,
    peakEP: 12,
  };
  const worldSample = {
    rolls: 1,
    even: 2,
    odd: 3,
    high: 98,
    low: 1,
    contains6: 6,
    curios: 1,
    newCurios: 1,
    newPlaces: 1,
    hits: 66,
    streak: 1,
  };
  for (const task of RNGWEEN_HOURLY_TASKS) {
    let p = withContract(task.id, opening, { world: task.source === "world" });
    if (task.source === "main") {
      const number = task.metric.startsWith("contains")
        ? Number(`121${task.metric.slice(8)}21`)
        : sample[task.metric];
      expect(Number.isInteger(number), task.id).toBe(true);
      for (
        let i = 0;
        i < Math.min(task.goal, 18) &&
        !p.history.some((r) => r.taskId === task.id);
        i++
      )
        p = claimDone(
          mainRoll(p, number, { rngweenAt: opening + 1000 + i }),
          opening + 1000 + i,
        );
    } else {
      for (let i = 0; i < task.goal * 3; i++) {
        const zone =
          task.metric === "newPlaces" && i === 1
            ? "haunted-house"
            : "graveyard";
        const number = worldSample[task.metric];
        p = claimDone(
          completedWorldRoll(p, {
            zone,
            number,
            at: opening + 1000 + i * 11000,
            rngweenAt: opening + 1000 + i * 11000,
          }),
          opening + 1000 + i * 11000,
        );
        if (p.history.some((r) => r.taskId === task.id)) break;
      }
    }

    expect(
      p.history.filter((r) => r.taskId === task.id),
      task.id,
    ).toHaveLength(1);
    expect(p.history.find((r) => r.taskId === task.id).pumpkoins, task.id).toBe(
      task.pumpkoins,
    );
    expect(
      p.rngweenLimited.hourly.slots.some((s) => s.taskId === task.id),
      task.id,
    ).toBe(false);
    expect(parseAndRepairProgress(JSON.stringify(p)).repairs, task.id).toEqual(
      [],
    );
  }
});

test("a fresh unlocked board admits World errands and exhausting their subdeck never rerolls or forgets the main assignments", () => {
  const fresh = refreshRngweenHourly(keyAccount(), opening, true);
  expect(
    fresh.rngweenLimited.hourly.slots.some(
      (s) => hourlyTaskById.get(s.taskId).source === "world",
    ),
  ).toBe(true);
  const p = withContract("main-evening-spirits", opening, {
    world: true,
    count: 1,
  });
  const board = p.rngweenLimited.hourly;
  const mainIds = board.slots.map((s) => s.taskId);
  board.dealt = [
    ...mainIds,
    ...RNGWEEN_HOURLY_TASKS.filter((t) => t.source === "world").map(
      (t) => t.id,
    ),
  ];
  const before = structuredClone(board.slots.slice(1));
  const q = claimDone(
    recordRngweenHourly(p, "main", { even: 1 }, opening + 1000, true),
  );
  expect(
    hourlyTaskById.get(q.rngweenLimited.hourly.slots[0].taskId).source,
  ).toBe("world");
  expect(q.rngweenLimited.hourly.slots.slice(1)).toEqual(before);
  expect(
    q.rngweenLimited.hourly.dealt.filter(
      (id) => hourlyTaskById.get(id).source === "main",
    ),
  ).toEqual(mainIds);
  expect(new Set(q.rngweenLimited.hourly.slots.map((s) => s.taskId)).size).toBe(
    4,
  );
});

test("one committed number can atomically pay four commissions, but never their four replacements", () => {
  const p = refreshRngweenHourly(account(), opening, false);
  const ids = [
    "main-evening-spirits",
    "main-bookends",
    "main-quiet-hex",
    "main-last-light",
  ];
  p.rngweenLimited.hourly.dealt = [...ids];
  p.rngweenLimited.hourly.slots = p.rngweenLimited.hourly.slots.map((s, i) => ({
    ...s,
    taskId: ids[i],
    count: hourlyTaskById.get(ids[i]).goal - 1,
  }));
  const done = mainRoll(p, 0);
  expect(done.rngweenLimited.pumpkoins).toBe(0);
  expect(
    done.rngweenLimited.hourly.slots.every((s) => s.completedAt !== undefined),
  ).toBe(true);
  const q = claimDone(done);
  expect(q.rngweenLimited.pumpkoins).toBe(100);
  expect(q.rngweenLimited.hourly).toMatchObject({
    completed: 4,
    earned: 100,
    nextSerial: 9,
  });
  expect(q.history.slice(-4).map((r) => r.id)).toEqual(
    ids.map((_, i) => `rngween-hourly:opening:${i + 1}`),
  );
  expect(q.rngweenLimited.hourly.slots.every((s) => s.count === 0)).toBe(true);
  expect(parseAndRepairProgress(JSON.stringify(q)).repairs).toEqual([]);
});

test("the hourly badge streak starts at assignment, breaks on a Common roll and ignores intervening Valley draws", () => {
  let p = keyAccount();
  const mini = (p, n, _unusedChoice = n, time = opening - 20000) =>
    completedWorldRoll(p, { zone: "graveyard", number: n, at: time });
  for (const n of [1, 3, 5]) p = mini(p, n);
  const coins = p.rngweenLimited.pumpkoins;
  const assigned = withContract("world-three-in-a-row", opening, {
    world: true,
  });
  p = {
    ...p,
    rngweenLimited: {
      ...p.rngweenLimited,
      hourly: assigned.rngweenLimited.hourly,
    },
  };
  p = mini(p, 1, 1, opening + 1000);
  expect(p.rngweenLimited.world.streak).toBe(4);
  expect(p.rngweenLimited.hourly.slots[0].count).toBe(1);
  expect(p.rngweenLimited.pumpkoins).toBe(coins);
  p = worldRoll(p, 12, "even", opening + 12000);
  expect(p.rngweenLimited.hourly.slots[0].count).toBe(1);
  p = mini(p, 38, 1, opening + 23000);
  expect(p.rngweenLimited.hourly.slots[0].count).toBe(0);
  for (let i = 0; i < 3; i++) p = mini(p, 1, 1, opening + 34000 + i * 11000);
  expect(p.rngweenLimited.pumpkoins).toBe(coins);
  expect(p.rngweenLimited.hourly.slots[0].completedAt).toBeGreaterThan(
    opening + 56000,
  );
  p = claimDone(p, opening + 70000);
  expect(p.rngweenLimited.pumpkoins).toBe(coins + 40);
  expect(
    p.history.filter((r) => r.taskId === "world-three-in-a-row"),
  ).toHaveLength(1);
  expect(p.rngweenLimited.hourly.slots[0].count).toBe(0);
});

test("legacy pools migrate to the Valley without losing numbers or prizes, and malformed old expedition aggregates repair safely", () => {
  const p = keyAccount();
  delete p.rngweenLimited.world;
  p.rngweenLimited.drawn = [1, 3, 5];
  const legacy = parseAndRepairProgress(JSON.stringify(p));
  expect(legacy.repairs).toEqual([]);
  expect(legacy.progress.rngweenLimited.world.legacyPass).toBe(true);
  const q = worldRoll(legacy.progress, 2);
  expect(q.rngweenLimited.world.rounds.valley).toBe(4);
  expect(q.rngweenLimited.drawn).toEqual([1, 3, 5, 2]);
  expect(worldGuessChance([], null)).toBe(0);
  for (const patch of [
    { lastGuess: "even", lastNumber: 2, predictions: 0 },
    { predictions: 1, hits: 1, bestStreak: 0 },
    { predictions: 1, lastNumber: null },
    { predictions: 1, hits: 1, streak: 1, bestStreak: 1, lastGuess: null },
    { predictions: 1, lastNumber: 2, lastGuess: "even", streak: 0 },
  ]) {
    const repaired = parseAndRepairProgress(
      JSON.stringify({
        ...q,
        rngweenLimited: {
          ...q.rngweenLimited,
          adventure: { ...emptyWorldAdventure(), ...patch },
        },
      }),
    );
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.progress.rngweenLimited.adventure).toEqual(
      emptyWorldAdventure(),
    );
    for (const key of ["drawn", "pumpkoins", "skinEarned"])
      expect(repaired.progress.rngweenLimited[key]).toEqual(
        q.rngweenLimited[key],
      );
  }
});

test("malformed commission receipts are dropped rather than reused or interpreted as larger rewards", () => {
  const p = claimDone(
    mainRoll(withContract("main-evening-spirits", opening, { count: 1 }), 12),
  );
  const receipt = p.history.find((r) => r.type === "rngween-hourly");
  for (const patch of [
    { id: "rngween-hourly:farewell:1" },
    { id: "rngween-hourly:opening:0" },
    { id: "rngween-hourly:opening:9007199254740992" },
    { id: "rngween-hourly:opening:1:extra" },
    { taskId: "missing" },
    { pumpkoins: 99999 },
    { at: trials },
  ]) {
    const read = parseAndRepairProgress(
      JSON.stringify({
        ...p,
        history: p.history.map((r) => (r === receipt ? { ...r, ...patch } : r)),
      }),
    );
    expect(read.progress.history.some((r) => r.type === "rngween-hourly")).toBe(
      false,
    );
    expect(read.progress.rngweenLimited.pumpkoins).toBe(15);
  }
  expect(
    parseRngweenHourly({ ...p.rngweenLimited.hourly, earned: 9999 }).repaired,
  ).toBe(true);
});

test("failed-write roll recovery uses the saved verified UTC even with a 2099 device date and cannot duplicate a commission", () => {
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  const temporary = mainRoll(p, 12, { at: Date.UTC(2099, 0, 1) });
  const read = parseAndRepairProgress(JSON.stringify(temporary));
  expect(read.repairs).toEqual([]);
  expect(read.progress.history.find((r) => r.type === "roll").rngweenAt).toBe(
    opening + 1000,
  );
  const recovered = recoverUnsavedRolls(
    p,
    read.progress,
    new Set(["test-main-0"]),
  );
  // The replayed roll finishes the commission; the player still claims it.
  expect(recovered.rngweenLimited.pumpkoins).toBe(0);
  expect(recovered.rngweenLimited.retired).not.toBe(true);
  expect(recovered.rngweenLimited.hourly.slots).toEqual(
    temporary.rngweenLimited.hourly.slots,
  );
  expect(
    recoverUnsavedRolls(recovered, read.progress, new Set(["test-main-0"])),
  ).toBe(recovered);
  const claimed = claimDone(recovered);
  expect(claimed.rngweenLimited.pumpkoins).toBe(15);
  expect(
    claimed.history.filter((r) => r.type === "rngween-hourly"),
  ).toHaveLength(1);
});

test("recovering old or legacy rolls cannot advance tasks that started later, rewind November's board or fabricate calendar proof", () => {
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  const temporary = mainRoll(p, 12, { at: Date.UTC(2099, 0, 1) });
  for (const at of [opening + RNGWEEN_HOURLY_MS + 1, farewell]) {
    const newer = refreshRngweenHourly(p, at);
    const recovered = recoverUnsavedRolls(
      newer,
      temporary,
      new Set(["test-main-0"]),
    );
    expect(recovered.rngweenLimited.hourly).toEqual(
      newer.rngweenLimited.hourly,
    );
    expect(recovered.rngweenLimited.pumpkoins).toBe(0);
    expect(recovered.balance).toBe(evaluate(12).totalEP);
  }
  const legacy = {
    ...temporary,
    history: temporary.history.map(({ rngweenAt, ...row }) => row),
  };
  const recovered = recoverUnsavedRolls(p, legacy, new Set(["test-main-0"]));
  expect(recovered.rngweenLimited.hourly).toEqual(p.rngweenLimited.hourly);
  expect(recovered.rngweenLimited.pumpkoins).toBe(0);
  expect(recovered.rngweenLimited.retired).not.toBe(true);
});

// Real browser flows use trusted HTTP dates, the real writer and real workers.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("four public main/World commissions are visible before the trials, persist and have no claim/skip/refresh control", async ({
  page,
}) => {
  await mockSeasonClock(page, opening);
  await seedProgress(page);
  await page.goto("/tasks/rngween");
  const board = page.locator("[data-hourly-board]");
  await expect(board.locator("[data-hourly-task]")).toHaveCount(4);
  expect(await board.locator('[data-source="world"]').count()).toBeGreaterThan(
    0,
  );
  await expect(
    board.getByRole("button", { name: /Skip|Claim|Refresh|Replace/ }),
  ).toHaveCount(0);
  await expect(board).toContainText("No skips");
  await expect(page.locator(".rngween-event")).toHaveCount(0);
  const before = (await saved(page)).rngweenLimited.hourly;
  await page.reload();
  await expect(board.locator("[data-hourly-task]")).toHaveCount(4);
  expect((await saved(page)).rngweenLimited.hourly).toEqual(before);
  await page.clock.setFixedTime(new Date("2099-01-01T00:00:00Z"));
  expect((await saved(page)).rngweenLimited.hourly).toEqual(before);
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
});

test("a real online main roll finishes its commission; the Tasks claim button pays it and deals a replacement", async ({
  page,
}) => {
  await mockSeasonClock(page, opening);
  await mockRandom(page, [12]);
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  await seedProgress(page, p);
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await page.clock.runFor(45000);
  await expect
    .poll(
      async () =>
        (await saved(page)).rngweenLimited.hourly.slots[0].completedAt,
    )
    .toBeTruthy();
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await page.goto("/tasks/rngween");
  await page.getByRole("button", { name: /Claim \+15/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.pumpkoins)
    .toBe(15);
  const after = await saved(page);
  expect(after.rngweenLimited.hourly.slots).toHaveLength(4);
  expect(after.rngweenLimited.hourly.slots[0].taskId).not.toBe(
    "main-evening-spirits",
  );
  expect(after.rngweenLimited.hourly.slots[0].count).toBe(0);
  expect(after.tasks.rngween.counts.rolls).toBe(0);
  await page.goto("/history");
  await expect(
    page.locator('[data-event-type="rngween-hourly"]'),
  ).toContainText("+15 Pumpkoins");
});

test("idle exact-hour expiry replaces assignments without a reload, payout or device clock input", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(opening));
  await mockSeasonClock(page, opening);
  const p = withContract(
    "main-lantern-laps",
    opening - RNGWEEN_HOURLY_MS + 1000,
    { count: 4 },
  );
  await seedProgress(page, p);
  await page.goto("/tasks/rngween");
  await expect(page.locator("[data-hourly-task]")).toHaveCount(4);
  await page.clock.runFor(1000);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.hourly.nextSerial)
    .toBe(9);
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await expect(page.locator("[data-hourly-task]")).toHaveCount(4);
});

test("the event page appears at the trials without a reload and lists the four aura missions", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(Date.UTC(2026, 9, 24, 23, 59, 59)));
  await mockSeasonClock(page, Date.UTC(2026, 9, 24, 23, 59, 59));
  await seedProgress(page);
  await page.goto("/tasks");
  // A second before the trials there is no event page at all.
  await expect(page.locator(".tasks-switch")).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await page.getByRole("tab", { name: /RNGween/ }).click();
  await expect(page).toHaveURL(/\/tasks\/rngween$/);
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Auras", exact: true }).click();
  await expect(page.locator("[data-event-mission]")).toHaveCount(4);
});

test("a public World badge commission can pay Pumpkoins after reveal but never ordinary EP, tasks or skill charge", async ({
  page,
}) => {
  await mockSeasonClock(page, opening);
  await mockWorldNumbers(page, { graveyard: [2] });
  const p = withContract("world-even-echoes", opening, {
    world: true,
    count: 3,
  });
  p.rngweenLimited.bought = [];
  await seedProgress(page, p);
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="graveyard"]').click();
  await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await revealWorld(page);
  await expect(
    page.getByLabel("World number 2", { exact: true }),
  ).toBeVisible();
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await page.getByRole("tab", { name: "Commissions" }).click();
  await page.getByRole("button", { name: /Claim \+20/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.pumpkoins)
    .toBe(20);
  const q = await saved(page);
  expect(q.rngweenLimited.pumpkoins).toBe(20);
  expect(q.rngweenLimited.hourly.slots[0].taskId).not.toBe("world-even-echoes");
  for (const field of [
    "balance",
    "totalEarned",
    "tasks",
    "skillCharge",
    "pets",
    "receipts",
  ])
    expect(q[field]).toEqual(p[field]);
  expect(q.rngweenLimited.drawn).toEqual([]);
  await expect(page.locator(".world-commission-paid")).toContainText(
    "+20 Pumpkoins",
  );
});

test("four-phase scenes fit 340px and desktop; repeatable badge rolls keep their collection and reload cleanly", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, trials);
  await mockWorldNumbers(page, { graveyard: [1, 66, 13, 38] });
  await seedProgress(page, keyAccount());
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="graveyard"]').click();
  const before = await saved(page);
  for (const n of [1, 66, 13, 38]) {
    await page.getByRole("button", { name: /Roll in Graveyard/ }).click();
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
      .toBeTruthy();
    await revealWorld(page);
    await expect(
      page.getByLabel(`World number ${n}`, { exact: true }),
    ).toBeVisible();
  }

  const p = await saved(page);
  expect(p.rngweenLimited.world).toMatchObject({
    wins: 3,
    streak: 0,
    bestStreak: 3,
  });
  expect(p.rngweenLimited.drawn).toEqual([]);
  for (const field of [
    "balance",
    "totalEarned",
    "tasks",
    "skillCharge",
    "history",
    "pets",
  ])
    expect(p[field]).toEqual(before[field]);
  for (const width of [340, 760, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: /Roll in Graveyard/ }),
    ).toBeVisible();
    await expect(page.locator("[data-world-zone]")).toHaveCount(5);
  }
  clock.set(trials + 50000);
  await page.reload();
  await expect(
    page.getByLabel("World number 38", { exact: true }),
  ).toBeVisible();
  expect((await saved(page)).rngweenLimited.world).toEqual(
    p.rngweenLimited.world,
  );
  await expect(page.getByText("Curio cabinet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Predict/ })).toHaveCount(0);
});

test("buying a challenge key preserves older main assignments; their next replacement can be a public World task", async ({
  page,
}) => {
  await mockSeasonClock(page, opening);
  await mockRandom(page, [12]);
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  p.rngweenLimited.pumpkoins = 2000;
  await seedProgress(page, p);
  await page.goto("/tasks/rngween");
  await expect(
    page.locator('[data-hourly-task][data-source="world"]'),
  ).toHaveCount(0);
  const before = (await saved(page)).rngweenLimited.hourly;
  await page.goto("/shop/limited");
  await page
    .getByRole("button", {
      name: "Buy Valley Challenge Key for 2000 Pumpkoins",
    })
    .click();
  await page
    .getByRole("dialog", { name: "Buy a Valley Challenge Key?" })
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(
    page.locator('[data-limited-item="rngween-world-key"]'),
  ).toContainText("Valley key owned");
  expect((await saved(page)).rngweenLimited.hourly).toEqual(before);
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await page.clock.runFor(45000);
  await expect
    .poll(
      async () =>
        (await saved(page)).rngweenLimited.hourly.slots[0].completedAt,
    )
    .toBeTruthy();
  // Commissions live on the event half of Tasks.
  await page.goto("/tasks/rngween");
  await page.getByRole("button", { name: /Claim \+15/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.pumpkoins)
    .toBe(15);
  await expect(page.locator("[data-hourly-task]")).toHaveCount(4);
  await expect(
    page.locator('[data-hourly-task][data-source="world"]'),
  ).toHaveCount(1);
  const after = (await saved(page)).rngweenLimited.hourly;
  expect(after.slots.slice(1)).toEqual(
    before.slots.slice(1).map((slot) => ({ ...slot, count: slot.count + 1 })),
  );
});

test("two same-account World tabs resume one pending number and a near-finished commission pays only once", async ({
  page,
  context,
}) => {
  await mockSeasonClock(page, opening);
  await mockWorldNumbers(page, [12, 14]);
  const p = withContract("world-even-echoes", opening, {
    world: true,
    count: 3,
  });
  await seedProgress(page, p);
  await page.goto("/rngween-world");
  const other = await context.newPage();
  try {
    await other.clock.install();
    await mockSeasonClock(other, opening);
    await mockWorldNumbers(other, [12, 14]);
    await other.goto("/rngween-world");
    for (const tab of [page, other])
      await tab.locator('[data-world-zone="valley"]').click();
    // Locator auto-wait can click a *second* button after a real-time reveal.
    // Freeze both clocks and fire once at the currently rendered controls.
    for (const tab of [page, other])
      await pauseClockAt(tab, new Date(Date.now() + 1000));
    await Promise.all(
      [page, other].map((tab) =>
        tab.evaluate(() =>
          document.querySelector(".world-roll-button")?.click(),
        ),
      ),
    );
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
      .toBeTruthy();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => navigator.locks.query())).held.some(
            (lock) => lock.name.includes("progress"),
          ),
        { timeout: 2000 },
      )
      .toBe(false);
    for (const tab of [page, other])
      await expect(tab.locator("[data-world-result]")).toHaveAttribute(
        "data-world-result",
        "pending",
      );
    await Promise.all([
      page.clock.fastForward(10100),
      other.clock.fastForward(10100),
    ]);
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.drawn.length)
      .toBe(1);
    expect((await saved(page)).rngweenLimited.drawn).toEqual([12]);
    expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
    await claimOnPage(page, 20, { inWorld: true });
    await expect
      .poll(async () => (await saved(page)).rngweenLimited.pumpkoins)
      .toBe(20);
    const q = await saved(page);
    expect(
      q.history.filter((row) => row.type === "rngween-hourly"),
    ).toHaveLength(1);
    expect(q.rngweenLimited.hourly.slots).toHaveLength(4);
    // The other tab sees the finished slot already claimed: no second payout.
    await other.reload();
    await expect(other.getByRole("button", { name: /Claim \+20/ })).toHaveCount(
      0,
    );
    expect((await saved(other)).rngweenLimited.hourly).toEqual(
      q.rngweenLimited.hourly,
    );
  } finally {
    await other.close();
  }
});

test("November 1 restores four hourly slots while Nov 4 closes commissions, shop, World and Halloween together", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(Date.UTC(2026, 9, 31, 23, 59, 59)));
  const clock = await mockSeasonClock(page, Date.UTC(2026, 9, 31, 23, 59, 59));
  await seedProgress(page, keyAccount());
  await page.goto("/tasks/rngween");
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.locator("[data-hourly-task]")).toHaveCount(4);
  await expect(page.locator("[data-event-mission]")).toHaveCount(0);
  const before = await saved(page);
  expect(before.rngweenLimited.hourly.window).toBe("farewell");
  clock.set(expired);
  await page.reload();
  await expect(page.locator("[data-hourly-board],.rngween-decor")).toHaveCount(
    0,
  );
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.retired)
    .toBe(true);
  await page.goto("/shop/limited");
  await expect(page.locator(".rngween-shop-closed")).toBeVisible();
  await page.goto("/rngween-world");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-season",
    "rngween",
  );
});

async function blockProgressWrites(page, { beforeLoad = false } = {}) {
  const install = (key) => {
    const original = Storage.prototype.setItem;
    window.restoreCommissionStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === key && this.getItem(key) !== null)
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, k, v);
    };
  };
  if (beforeLoad) await page.addInitScript(install, PROGRESS_KEY);
  else await page.evaluate(install, PROGRESS_KEY);
}

test("a failed World commission commit pays nothing, preserves the pool and safely retries its real worker", async ({
  page,
}) => {
  await mockSeasonClock(page, opening);
  await mockWorldNumbers(page, [12]);
  const p = withContract("world-even-echoes", opening, {
    world: true,
    count: 3,
  });
  await seedProgress(page, p);
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="valley"]').click();
  await blockProgressWrites(page);
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect(page.locator(".world-playground .world-alert")).toContainText(
    "World result not saved",
  );
  await expect(page.getByLabel("Waiting for a World result")).toBeVisible();
  const failed = await saved(page);
  expect(failed.rngweenLimited).toEqual(p.rngweenLimited);
  expect(failed.history).toEqual(p.history);
  await expect(page.locator(".world-commission-paid")).toHaveCount(0);
  await page.evaluate(() => window.restoreCommissionStorage());
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.world.pending?.id)
    .toBeTruthy();
  await revealWorld(page);
  await expect(
    page.getByLabel("World number 12", { exact: true }),
  ).toBeVisible();
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await claimOnPage(page, 20, { inWorld: true });
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.pumpkoins)
    .toBe(20);
  expect(
    (await saved(page)).history.filter((row) => row.type === "rngween-hourly"),
  ).toHaveLength(1);
});

test("the saved hourly board recovers from storage failure without inventing assignments or rewards", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(opening));
  await mockSeasonClock(page, opening);
  await seedProgress(page);
  await blockProgressWrites(page, { beforeLoad: true });
  await page.goto("/tasks/rngween");
  await expect(page.locator(".progress-warning")).toContainText(
    "Local saving is unavailable",
  );
  await expect(page.locator("[data-hourly-task]")).toHaveCount(0);
  expect((await saved(page)).rngweenLimited).not.toHaveProperty("hourly");
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await page.evaluate(() => window.restoreCommissionStorage());
  await page.clock.runFor(30000);
  await expect(page.locator("[data-hourly-task]")).toHaveCount(4);
  expect((await saved(page)).rngweenLimited.hourly).toMatchObject({
    nextSerial: 5,
    completed: 0,
    earned: 0,
  });
  await expect(page.locator(".progress-warning")).toHaveCount(0);
});

test("an online commission temporarily settled during a storage outage recovers once, never using the device's 2099 calendar", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await pauseClockAt(page, new Date(opening));
  await mockSeasonClock(page, opening);
  await mockRandom(page, [12, 14]);
  const p = withContract("main-evening-spirits", opening, { count: 1 });
  await seedProgress(page, p);
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).pendingRoll?.number)
    .toBe(12);
  await blockProgressWrites(page);
  await page.clock.runFor(45000);
  await expect(page.locator(".progress-warning")).toContainText(
    "Local saving is unavailable",
  );
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await page.clock.setFixedTime(new Date(Date.UTC(2099, 0, 1)));
  await page.evaluate(() => window.restoreCommissionStorage());
  await page.clock.fastForward(60000);
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).rngweenLimited.hourly?.slots[0].completedAt,
    )
    .toBeTruthy();
  await claimOnPage(page, 15);
  await expect
    .poll(async () => (await saved(page)).rngweenLimited.pumpkoins)
    .toBe(15);
  const q = await saved(page);
  expect(q.rngweenLimited.retired).not.toBe(true);
  expect(q.history.filter((r) => r.type === "rngween-hourly")).toHaveLength(1);
  expect(
    q.history.filter((r) => r.type === "roll")[0].rngweenAt,
  ).toBeGreaterThanOrEqual(opening);
  expect(q.history.filter((r) => r.type === "roll")[0].rngweenAt).toBeLessThan(
    opening + RNGWEEN_HOURLY_MS,
  );
  await expect(page.locator(".progress-warning")).toHaveCount(0);
});

test("linked browsers share commission payouts and use the main account writer's secure World pool and calendar", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const a = await eventContext(browser),
    b = await eventContext(browser);
  try {
    const pageA = await a.newPage(),
      pageB = await b.newPage();
    await mockSeasonClock(pageA, opening);
    await mockWorldNumbers(pageA, [12, 14]);
    await seedProgress(
      pageA,
      withContract("world-even-echoes", opening, { world: true, count: 3 }),
    );
    await pageA.goto("/settings/link");
    await pageA.getByTestId("sync-create").click();
    await expect(pageA.getByTestId("sync-link")).toBeVisible();
    const link = await pageA.getByTestId("sync-link").inputValue();
    await mockSeasonClock(pageB, opening);
    await mockWorldNumbers(pageB, [9999]);
    await pageB.clock.setFixedTime(new Date(Date.UTC(2099, 0, 1)));
    // A fresh device would get the World opening; this test is about sync.
    await pageB.addInitScript(
      ([key, id]) => localStorage.setItem(key, id),
      [RNGWEEN_WORLD_INTRO_KEY, "rngween-2026"],
    );
    await pageB.goto(link);
    await expect(pageA.getByTestId("sync-status")).toContainText(/live/, {
      timeout: 15000,
    });
    await expect
      .poll(
        async () => (await saved(pageB))?.rngweenLimited.hourly?.slots[0].count,
        { timeout: 15000 },
      )
      .toBe(3);
    await pageB.goto("/rngween-world");
    await pageB.locator('[data-world-zone="valley"]').click();
    await pageB.getByRole("button", { name: /Roll in the Valley/ }).click();
    await expect
      .poll(
        async () =>
          (await saved(pageA)).rngweenLimited.hourly?.slots[0].completedAt,
        { timeout: 15000 },
      )
      .toBeTruthy();
    await claimOnPage(pageA, 20);
    await expect
      .poll(async () => (await saved(pageA)).rngweenLimited.pumpkoins, {
        timeout: 15000,
      })
      .toBe(20);
    await expect
      .poll(async () => (await saved(pageB)).rngweenLimited.pumpkoins, {
        timeout: 15000,
      })
      .toBe(20);
    const q = await saved(pageA);
    expect(q.rngweenLimited.drawn).toEqual([12]);
    expect(q.rngweenLimited.world.last.zone).toBe("valley");
    expect((await saved(pageB)).rngweenLimited.hourly).toEqual(
      q.rngweenLimited.hourly,
    );
    expect(q.history.filter((r) => r.type === "rngween-hourly")).toHaveLength(
      1,
    );
    expect(q.balance).toBe(0);
    expect(q.totalEarned).toBe(0);
  } finally {
    await b.close();
    await a.close();
  }
});
