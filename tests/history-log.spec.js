import { test, expect } from "./helpers/clock.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
  HISTORY_LIMIT,
  HISTORY_WARNING,
} from "../src/progress.js";
import {
  capHistory,
  historyCycles,
  pruneCycle,
  pruneOldest,
  removableCount,
} from "../src/history-log.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { showRoll } from "./helpers/random-roll.js";

const BASE = Date.UTC(2026, 0, 1);
// A plain roll. Its tier matches its EP, as the scoring table gives it.
const rollEntry = (i, extra = {}) => ({
  id: `roll:${i}`,
  type: "roll",
  at: BASE + i * 60000,
  number: i,
  tier: "trash",
  ep: 100,
  badges: [],
  ...extra,
});
// Rolls numbered from `start`, so several runs can be chained into one log.
const rolls = (count, start = 0) =>
  Array.from({ length: count }, (_, i) => rollEntry(start + i));
// A rebirth marker as the game writes one (a zero grant is simply not stored).
const marker = (count, index) => ({
  id: `reb:${count}`,
  type: "rebirth",
  at: BASE + index * 60000,
  count,
});

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const count = (n) => n.toLocaleString("en-US");

// A roll the way the game settles one, for building the log through actions.
const settle = (state, id, time, tier = "common", ep = 100) =>
  applyProgress(state, {
    type: "complete",
    id,
    at: time,
    cooldownUntil: 0,
    result: { number: 1, totalEP: ep, tier, badges: [] },
  });

test("the log keeps 6,000 entries, and a new roll pushes out only the oldest entry nobody kept", () => {
  expect(HISTORY_LIMIT).toBe(6000);
  expect(HISTORY_WARNING).toBe(4500);
  // Entry 0 is bookmarked and entry 1 is a rebirth marker: neither may go.
  const history = [rollEntry(0), marker(1, 1), ...rolls(HISTORY_LIMIT - 2, 2)];
  expect(history).toHaveLength(HISTORY_LIMIT);
  const next = settle(
    {
      ...emptyProgress(),
      profile: testProfile,
      history,
      bookmarks: ["roll:0"],
    },
    "new",
    BASE + 999999999,
  );
  expect(next.history).toHaveLength(HISTORY_LIMIT);
  expect(next.history[0].id).toBe("roll:0");
  expect(next.history[1].id).toBe("reb:1");
  // The oldest removable entry was roll 2; roll 3 is now the oldest left.
  expect(next.history.some((e) => e.id === "roll:2")).toBe(false);
  expect(next.history.some((e) => e.id === "roll:3")).toBe(true);
  expect(next.history.at(-1).id).toBe("new");
});

test("the cap never removes a cycle marker or a bookmarked roll, however full the log is", () => {
  // Five fixed entries plus 5,995 rolls make exactly the cap: roll 0 and roll 1
  // are bookmarked, markers 1 and 2 frame the log, and roll 999999 is the newest.
  const history = [
    rollEntry(0),
    rollEntry(1),
    marker(1, 2),
    ...rolls(HISTORY_LIMIT - 5, 2),
    marker(2, HISTORY_LIMIT),
    rollEntry(999999),
  ];
  expect(history).toHaveLength(HISTORY_LIMIT);
  const bookmarks = ["roll:0", "roll:1"];
  let state = { ...emptyProgress(), profile: testProfile, history, bookmarks };
  for (let i = 0; i < 25; i++)
    state = settle(state, `more-${i}`, BASE + (i + 1) * 9e6);
  expect(state.history).toHaveLength(HISTORY_LIMIT);
  for (const kept of ["roll:0", "roll:1", "reb:1", "reb:2", "roll:999999"])
    expect(
      state.history.some((e) => e.id === kept),
      kept,
    ).toBe(true);
  // The 25 newest settlements pushed out the 25 oldest removable entries.
  expect(state.history.some((e) => e.id === "roll:2")).toBe(false);
  expect(state.history.some((e) => e.id === "roll:26")).toBe(false);
  expect(state.history.some((e) => e.id === "roll:27")).toBe(true);
  expect(capHistory(state.history, state.bookmarks).history).toBe(
    state.history,
  );
});

test("cycles are the runs between markers, named by the marker that closes them", () => {
  const history = [
    rollEntry(0),
    rollEntry(1, { id: "roll:bm" }),
    marker(1, 2),
    rollEntry(3),
    marker(2, 4),
    rollEntry(5),
  ];
  const { finished, current } = historyCycles(history, ["roll:bm"]);
  expect(finished.map((c) => c.label)).toEqual([
    "Before Rebirth 1",
    "Before Rebirth 2",
  ]);
  expect(finished[0]).toMatchObject({ entries: 1, kept: 1, marker: "reb:1" });
  expect(finished[1]).toMatchObject({ entries: 1, kept: 0, marker: "reb:2" });
  expect(current).toMatchObject({ entries: 1, kept: 0 });
  expect(removableCount(history, ["roll:bm"])).toBe(3);
});

test("bulk delete clears one finished cycle whole, keeps its marker and bookmarks, and refuses an empty one", () => {
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    bookmarks: ["roll:bm"],
    history: [
      rollEntry(0),
      rollEntry(1, { id: "roll:bm" }),
      marker(1, 2),
      rollEntry(3),
      rollEntry(4),
      marker(2, 5),
      rollEntry(6),
    ],
  };
  const cut = applyProgress(state, {
    type: "history-prune",
    mode: "cycle",
    marker: "reb:1",
  });
  expect(cut.history.map((e) => e.id)).toEqual([
    "roll:bm",
    "reb:1",
    "roll:3",
    "roll:4",
    "reb:2",
    "roll:6",
  ]);
  // The cycle is now empty of removable entries, so a second cut is refused.
  expect(() =>
    applyProgress(cut, {
      type: "history-prune",
      mode: "cycle",
      marker: "reb:1",
    }),
  ).toThrow(/nothing to delete/i);
  expect(() =>
    applyProgress(cut, {
      type: "history-prune",
      mode: "cycle",
      marker: "reb:9",
    }),
  ).toThrow(/no longer in your history/);
  // Bulk delete never changes the account: balance and all-time EP are kept.
  expect(cut.balance).toBe(state.balance);
  expect(cut.totalEarned).toBe(state.totalEarned);
  // The cut survives a save and a load, with the markers and bookmark intact.
  expect(parseProgress(JSON.stringify(cut)).history).toEqual(cut.history);
});

test("bulk delete by oldest removes the oldest entries first, skips bookmarks and reports the count", () => {
  const state = {
    ...emptyProgress(),
    profile: testProfile,
    bookmarks: ["roll:0"],
    history: [rollEntry(0), marker(1, 1), ...rolls(6, 2)],
  };
  const cut = applyProgress(state, {
    type: "history-prune",
    mode: "oldest",
    count: 3,
  });
  expect(cut.history.map((e) => e.id)).toEqual([
    "roll:0",
    "reb:1",
    "roll:5",
    "roll:6",
    "roll:7",
  ]);
  expect(pruneOldest(state.history, ["roll:0"], 100).removed).toHaveLength(6);
  expect(() => pruneCycle(state.history, [], "reb:1")).not.toThrow();
  expect(() =>
    applyProgress(state, { type: "history-prune", mode: "other", count: 1 }),
  ).toThrow(/Choose a finished cycle/);
  expect(() =>
    applyProgress(state, { type: "history-prune", mode: "oldest", count: 0 }),
  ).toThrow(/Choose a finished cycle/);
});

test("the space warning starts at 4,500 entries, not before", async ({
  page,
}) => {
  await seedProgress(page, {
    history: rolls(HISTORY_WARNING - 1),
    balance: 1000,
    totalEarned: 1000,
  });
  await page.goto("/history");
  await expect(page.locator(".activity-event")).toHaveCount(50);
  await expect(page.locator(".history-space")).toHaveCount(0);
  await expect(page.locator(".activity-summary")).toContainText(
    `${count(HISTORY_WARNING - 1)} of ${count(HISTORY_LIMIT)} entries kept`,
  );
});

test("at 4,500 entries History warns, and bulk delete clears the oldest entries but keeps the bookmark", async ({
  page,
}) => {
  await seedProgress(page, {
    history: rolls(HISTORY_WARNING),
    bookmarks: ["roll:10"],
    balance: 1000,
    totalEarned: 1000,
  });
  await page.goto("/history");
  const warning = page.locator(".history-space");
  await expect(warning).toContainText("Low entry space");
  await expect(warning).toContainText(
    `${count(HISTORY_WARNING)} of ${count(HISTORY_LIMIT)} entries kept`,
  );
  await warning
    .getByRole("button", { name: "Bulk delete", exact: true })
    .click();
  await expect(
    warning.getByRole("button", { name: "Hide bulk delete" }),
  ).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(".history-prune");
  await expect(panel).toBeVisible();
  // Nothing is removed until the cut is confirmed.
  await panel
    .getByRole("button", { name: "Delete oldest 500", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Confirm deletion" }),
  ).toContainText(
    "Delete 500 entries from the oldest? Bookmarked rolls and rebirth markers stay.",
  );
  expect((await saved(page)).history).toHaveLength(HISTORY_WARNING);
  await page
    .getByRole("group", { name: "Confirm deletion" })
    .getByRole("button", { name: "Delete 500 entries", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Deleted 500 entries" }),
  ).toBeVisible();
  const after = await saved(page);
  expect(after.history).toHaveLength(HISTORY_WARNING - 500);
  expect(after.history.some((e) => e.id === "roll:10")).toBe(true);
  expect(after.history.some((e) => e.id === "roll:0")).toBe(false);
  expect(after.bookmarks).toEqual(["roll:10"]);
  // Back under the warning level, the warning goes away.
  await expect(page.locator(".history-space")).toHaveCount(0);
});

test("a finished rebirth is cleared whole from History, and its divider stays in the log", async ({
  page,
}) => {
  // The old cycle is long and the one in play is short, so the divider sits
  // near the top of the feed where a player would look for it.
  await seedProgress(page, {
    rebirths: 1,
    history: [...rolls(4460), marker(1, 4460), ...rolls(40, 4460)],
    balance: 1000,
    totalEarned: 1000,
  });
  await page.goto("/history");
  await page
    .locator(".history-space")
    .getByRole("button", { name: "Bulk delete" })
    .click();
  const cycle = page.getByRole("button", {
    name: "Delete 4,460 entries from the cycle before Rebirth 1",
  });
  await expect(cycle).toBeEnabled();
  await cycle.click();
  await expect(
    page.getByRole("group", { name: "Confirm deletion" }),
  ).toContainText("Delete 4,460 entries from the cycle before Rebirth 1?");
  await page
    .getByRole("group", { name: "Confirm deletion" })
    .getByRole("button", { name: "Delete 4,460 entries", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Deleted 4,460 entries" }),
  ).toBeVisible();
  const after = await saved(page);
  expect(after.history.filter((e) => e.type === "rebirth")).toHaveLength(1);
  expect(after.history).toHaveLength(41);
  expect(after.history.some((e) => e.id === "roll:0")).toBe(false);
  await expect(page.locator(".activity-divider")).toContainText("Rebirth 1");
  await expect(page.locator(".activity-summary")).toContainText(
    "41 of 6,000 entries kept",
  );
});

test("a full log says so, and the cap is shown in the summary", async ({
  page,
}) => {
  await seedProgress(page, {
    history: rolls(HISTORY_LIMIT),
    balance: 1000,
    totalEarned: 1000,
  });
  await page.goto("/history");
  await expect(page.locator(".history-space")).toContainText(
    "Entry space is full",
  );
  await expect(page.locator(".history-space")).toHaveClass(/is-full/);
  await expect(page.locator(".activity-summary")).toContainText(
    `${count(HISTORY_LIMIT)} of ${count(HISTORY_LIMIT)} entries kept`,
  );
});

test("the share and bookmark chips carry no words, but keep their names and their state", async ({
  page,
}) => {
  await seedProgress(page, {
    history: rolls(3),
    balance: 1000,
    totalEarned: 1000,
  });
  await page.goto("/history");
  const row = page.locator('[data-event-type="roll"]').first();
  const share = row.getByRole("button", { name: "Share roll 2" });
  const bookmark = row.getByRole("button", { name: "Bookmark roll 2" });
  await expect(share).toHaveText("");
  await expect(bookmark).toHaveText("");
  await expect(bookmark).toHaveAttribute("aria-pressed", "false");
  await bookmark.click();
  await expect(
    row.getByRole("button", { name: "Remove bookmark from roll 2" }),
  ).toHaveClass(/is-saved/);
  await expect(
    row.getByRole("button", { name: "Remove bookmark from roll 2" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a roll that crosses 4,500 entries announces the warning once, from the roll page", async ({
  page,
}) => {
  // Every badge of 1337 is already found, so the roll adds exactly one entry.
  const found = evaluate(1337).badges.map((b) => b.id);
  await seedProgress(page, {
    history: rolls(HISTORY_WARNING - 1),
    discovered: found,
    balance: 1000,
    totalEarned: 1000,
  });
  await showRoll(page, 1337);
  await expect(
    page.getByRole("status").filter({ hasText: "Low entry space" }),
  ).toBeVisible();
  const after = await saved(page);
  expect(after.history).toHaveLength(HISTORY_WARNING);
});

test("profile figures read the same after bulk delete clears the oldest entries", async ({
  page,
}) => {
  await seedProgress(page, {
    history: rolls(HISTORY_WARNING),
    balance: 1000,
    totalEarned: 1000,
  });
  // Every row of the profile's figures, by its label.
  const figures = () =>
    page
      .locator(".profile-history dl > div")
      .evaluateAll((rows) =>
        Object.fromEntries(
          rows.map((row) => [
            row.querySelector("dt").textContent,
            row.querySelector("dd").textContent,
          ]),
        ),
      );
  await page.goto("/profile");
  const before = await figures();
  expect(before["Rolls completed"]).toBe(count(HISTORY_WARNING));
  // Every roll pays the same, so the best roll is the first one logged.
  expect(before["Best roll"]).toMatch(/^0 · /);
  await page.goto("/history");
  await page
    .locator(".history-space")
    .getByRole("button", { name: "Bulk delete", exact: true })
    .click();
  const panel = page.locator(".history-prune");
  await expect(panel).toContainText(
    "Profile and Rebirth figures keep counting what leaves this log",
  );
  await panel
    .getByRole("button", { name: "Delete oldest 500", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Confirm deletion" })
    .getByRole("button", { name: "Delete 500 entries", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Deleted 500 entries" }),
  ).toBeVisible();
  expect((await saved(page)).history).toHaveLength(HISTORY_WARNING - 500);
  // A fresh load reads the saved log and the saved totals, and nothing moved.
  await page.goto("/profile");
  expect(await figures()).toEqual(before);
});
