import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { readSavedProgress } from "./helpers/save.js";

const rolls = Array.from({ length: 26 }, (_, i) => ({
  id: `roll:${i}`,
  type: "roll",
  at: 150000 + i * 60000,
  number: 1000 + i,
  tier: "common",
  ep: 100,
  badges: [],
}));

const saved = (page) => readSavedProgress(page);

test("history bookmarks pin up to twenty-five rolls, persist, and respect the cap", async ({
  page,
}) => {
  await seedProgress(page, { history: rolls });
  await page.goto("/#history");
  await waitForApp(page);

  const mark = (n) => page.getByRole("button", { name: `Bookmark roll ${n}` });
  const marked = (n) =>
    page.getByRole("button", { name: `Remove bookmark from roll ${n}` });

  for (let n = 1025; n >= 1001; n--) await mark(n).click();
  await expect(marked(1025)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarks (25/25)" }),
  ).toBeVisible();

  await mark(1000).click();
  await expect(
    page.getByText("You can keep up to 25 bookmarked rolls. Remove one first."),
  ).toBeVisible();
  await expect(mark(1000)).toBeVisible();

  await page.reload();
  await waitForApp(page);
  await expect(
    page.getByRole("button", { name: "Bookmarks (25/25)" }),
  ).toBeVisible();
  const pinned = Array.from({ length: 25 }, (_, i) => `roll:${25 - i}`);
  expect((await saved(page)).bookmarks).toEqual(pinned);

  await page.getByRole("button", { name: "Bookmarks (25/25)" }).click();
  await expect(page.locator(".activity-event")).toHaveCount(25);

  await page.getByRole("button", { name: "All activity" }).click();
  await marked(1001).click();
  await mark(1000).click();
  await expect(marked(1000)).toBeVisible();
  expect((await saved(page)).bookmarks).toEqual([
    ...pinned.slice(0, 24),
    "roll:0",
  ]);
});

test("a repaired save drops bookmarks whose roll is gone", async ({ page }) => {
  await seedProgress(page, {
    history: rolls,
    bookmarks: ["roll:3", "ghost", 42, "roll:3"],
  });
  await page.goto("/#history");
  await waitForApp(page);

  await expect(
    page.getByRole("button", { name: "Bookmarks (1/25)" }),
  ).toBeVisible();
});

test("profile keeps 25 pins but initially shows only ten", async ({ page }) => {
  await seedProgress(page, {
    history: rolls,
    bookmarks: rolls.slice(0, 25).map((roll) => roll.id),
  });
  await page.goto("/profile");
  await waitForApp(page);
  await expect(page.locator(".profile-pins li")).toHaveCount(10);
  await page.getByRole("button", { name: "Show all 25 pinned rolls" }).click();
  await expect(page.locator(".profile-pins li")).toHaveCount(25);
  await page.getByRole("button", { name: "Show fewer pinned rolls" }).click();
  await expect(page.locator(".profile-pins li")).toHaveCount(10);
});
