import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";

// Four plain rolls, newest first in the feed: 1003 down to 1000.
const rolls = Array.from({ length: 4 }, (_, i) => ({
  id: `roll:${i}`,
  type: "roll",
  at: 150000 + i * 60000,
  number: 1000 + i,
  tier: "common",
  ep: 100,
  badges: [],
}));

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

test("history bookmarks pin up to three rolls, persist, and respect the cap", async ({
  page,
}) => {
  await seedProgress(page, { history: rolls });
  await page.goto("/#history");

  const mark = (n) => page.getByRole("button", { name: `Bookmark roll ${n}` });
  const marked = (n) =>
    page.getByRole("button", { name: `Remove bookmark from roll ${n}` });

  // Three rolls can be pinned; the chip counts them.
  await mark(1003).click();
  await mark(1002).click();
  await mark(1001).click();
  await expect(marked(1003)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarks (3/3)" }),
  ).toBeVisible();

  // The fourth is refused with the reason, and stays unpinned.
  await mark(1000).click();
  await expect(
    page.getByText("You can keep up to 3 bookmarked rolls. Remove one first."),
  ).toBeVisible();
  await expect(mark(1000)).toBeVisible();

  // Bookmarks live on the save, so a reload keeps them.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Bookmarks (3/3)" }),
  ).toBeVisible();
  expect((await saved(page)).bookmarks).toEqual(["roll:3", "roll:2", "roll:1"]);

  // The Bookmarks filter shows only pinned rolls.
  await page.getByRole("button", { name: "Bookmarks (3/3)" }).click();
  await expect(page.locator(".activity-event")).toHaveCount(3);

  // Removing one frees a slot for the fourth.
  await page.getByRole("button", { name: "All activity" }).click();
  await marked(1001).click();
  await mark(1000).click();
  await expect(marked(1000)).toBeVisible();
  expect((await saved(page)).bookmarks).toEqual(["roll:3", "roll:2", "roll:0"]);
});

test("a repaired save drops bookmarks whose roll is gone", async ({ page }) => {
  await seedProgress(page, {
    history: rolls,
    bookmarks: ["roll:3", "ghost", 42, "roll:3"],
  });
  await page.goto("/#history");
  // The loader keeps only the mark that matches a real roll, deduped.
  await expect(
    page.getByRole("button", { name: "Bookmarks (1/3)" }),
  ).toBeVisible();
});
