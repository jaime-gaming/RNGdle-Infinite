import { test, expect } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { emptyTasks } from "../src/tasks.js";
import { TASK_SECTIONS } from "../src/router.js";

// The event runs Oct 21 – Nov 3, 2026; the aura missions and commissions are
// live all through it.
const active = Date.UTC(2026, 9, 26, 12);
const ended = Date.UTC(2026, 10, 4, 12);

test("the event half of the task page is a real address", () => {
  expect(TASK_SECTIONS).toEqual(["main", "rngween"]);
});

test("Tasks opens on Main and the switch moves to the event page and back", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page, { tasks: emptyTasks() });
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { name: "Tasks", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Main" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The everyday lists, and nothing from the event.
  await expect(page.locator(".task-group")).toHaveCount(2);
  await expect(page.locator(".rngween-event-panel")).toHaveCount(0);

  await page.getByRole("tab", { name: /RNGween/ }).click();
  await expect(page).toHaveURL(/\/tasks\/rngween$/);
  await expect(page.getByRole("tab", { name: /RNGween/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The event page, and none of the everyday lists.
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
  await expect(page.locator(".task-group")).toHaveCount(0);
  // During the trials the aura missions are what the page opens on...
  await expect(
    page.getByRole("tab", { name: "Auras", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-event-mission]")).toHaveCount(4);
  // ...and the commissions say why they are resting instead of faking cards.
  await page.getByRole("tab", { name: "Commissions", exact: true }).click();
  await expect(page.locator(".rngween-hourly-card.is-paused")).toBeVisible();

  // Back and forward move between the two halves like real pages do.
  await page.goBack();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator(".task-group")).toHaveCount(2);
  await page.goForward();
  await expect(page).toHaveURL(/\/tasks\/rngween$/);
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
});

test("a bookmark to the event page reloads straight into it", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await page.goto("/tasks/rngween");
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Auras", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Halloween tasks" }).locator("li"),
  ).toHaveCount(4);
  await page.reload();
  await expect(page).toHaveURL(/\/tasks\/rngween$/);
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
});

test("an unknown task sub-page falls back to Main and keeps the address clean", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await page.goto("/tasks/something-else");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator(".task-group")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Main" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("an old event link lands on Main once the event has ended", async ({
  page,
}) => {
  await mockSeasonClock(page, ended);
  await seedProgress(page);
  await page.goto("/tasks/rngween");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator(".tasks-switch")).toHaveCount(0);
  await expect(page.locator(".rngween-event-panel")).toHaveCount(0);
  await expect(page.locator(".task-group")).toHaveCount(2);
});

test("the two halves fit a phone without sideways scrolling", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tasks");
  await expect(page.locator(".tasks-switch")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: /RNGween/ }).click();
  await expect(page.locator(".rngween-event-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Tabs stay a comfortable tap target.
  const box = await page.locator(".tasks-switch button").first().boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(40);
});
