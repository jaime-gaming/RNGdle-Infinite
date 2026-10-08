import { test, expect } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import {
  pushToast,
  removeToast,
  toastFrom,
  toastLife,
  TOAST_LIMIT,
} from "../src/toasts.js";
import { freshRareBadges, newlyReady } from "../src/notice-rules.js";
import {
  activeTaskIds,
  emptyTasks,
  recordTally,
  TASK_METRICS,
} from "../src/tasks.js";
import { badgeMetadata } from "../src/roll-data.js";

// The in-game notices: the cards that say what just happened. The queue and
// the rules that post them are plain code, so most of this runs without a page;
// one test rolls a number in the browser to see a notice come up for real.

const zeroCounts = () =>
  Object.fromEntries(TASK_METRICS.map((metric) => [metric, 0]));

test("a notice is a line, or a kinded card with an optional title and action", () => {
  expect(toastFrom("Saved.")).toMatchObject({ kind: "info", text: "Saved." });
  expect(toastFrom("   ")).toBeNull();
  expect(toastFrom({ kind: "nope", text: "x" })).toMatchObject({
    kind: "info",
  });
  expect(toastFrom({ kind: "reward", title: "", text: "" })).toBeNull();
  // An action needs a label and a handler; anything less is dropped, not run.
  expect(
    toastFrom({ kind: "milestone", text: "x", action: { label: "Open" } })
      .action,
  ).toBeNull();
  expect(
    toastFrom({
      kind: "milestone",
      text: "x",
      action: { label: "Open", onSelect: () => {} },
    }).action.label,
  ).toBe("Open");
});

test("the same notice twice is one card counted twice, and the oldest leaves past the limit", () => {
  let list = [];
  list = pushToast(list, { kind: "reward", title: "+5 EP", text: "A" }, 1);
  list = pushToast(list, { kind: "reward", title: "+5 EP", text: "A" }, 2);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ count: 2, stamp: 2 });
  // Different text is a new card, and a fourth card pushes the first out.
  for (let i = 0; i < TOAST_LIMIT; i++)
    list = pushToast(list, `Notice ${i}`, 10 + i);
  expect(list).toHaveLength(TOAST_LIMIT);
  expect(list.map((item) => item.id)).not.toContain(1);
  expect(removeToast(list, list[0].id)).toHaveLength(TOAST_LIMIT - 1);
});

test("a notice stays long enough to read, and never past its cap", () => {
  const info = toastLife({ kind: "info", text: "Short." });
  const warning = toastLife({ kind: "warning", text: "Short." });
  expect(warning).toBeGreaterThan(info);
  const longer = toastLife({ kind: "info", text: "x".repeat(200) });
  expect(longer).toBeGreaterThan(info);
  expect(toastLife({ kind: "error", text: "x".repeat(2000) })).toBe(10000);
});

test("a rise in claimable tasks is news, a fall is not", () => {
  expect(newlyReady(0, 2)).toBe(2);
  expect(newlyReady(2, 2)).toBe(0);
  expect(newlyReady(2, 0)).toBe(0);
});

test("only an Epic-or-better badge newly found is worth a notice", () => {
  const all = [...badgeMetadata.values()];
  const epic = all.find((badge) => badge.rarity === "epic");
  const common = all.find((badge) => badge.rarity === "common");
  expect(epic && common).toBeTruthy();
  const lookup = (id) => badgeMetadata.get(id);
  expect(
    freshRareBadges([], [epic.id, common.id, "not-a-badge"], lookup).map(
      (badge) => badge.id,
    ),
  ).toEqual([epic.id]);
  // Badges already found are not news again.
  expect(freshRareBadges([epic.id], [epic.id], lookup)).toEqual([]);
});

test("a roll that finishes a task posts a notice that opens the Tasks page", async ({
  page,
}) => {
  // A day whose daily list holds "Roll 10 numbers": nine rolls already count,
  // so the next roll finishes it.
  const noon = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    date.setHours(12, 0, 0, 0);
    return date.getTime();
  };
  let when = null;
  for (let offset = 1; offset < 60 && when === null; offset++)
    if (
      activeTaskIds(emptyTasks(), "daily", noon(offset)).includes("daily-rolls")
    )
      when = noon(offset);
  expect(when).not.toBeNull();
  const tasks = recordTally(emptyTasks(), { ...zeroCounts(), rolls: 9 }, when);
  await mockRandom(page, [12345]);
  await seedProgress(page, { tasks });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.pauseAt(new Date(when));
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  // A base roll reveals over 45 seconds of game time, so walk the clock on.
  for (let step = 0; step < 300; step++) {
    const done = await page.evaluate(
      () =>
        document.querySelector(".roll-experience")?.dataset.phase ===
        "complete",
    );
    if (done) break;
    await page.clock.runFor(250);
  }
  // One roll can finish several tasks, so the notice counts them in one card.
  const notice = page.locator("article.toast", {
    hasText: "ready to claim",
  });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Open Tasks" }).click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
});
