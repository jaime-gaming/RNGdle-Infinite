import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";

// Eleven plain rolls, newest first in the feed: 1010 down to 1000.
const rolls = Array.from({ length: 11 }, (_, i) => ({
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

test("history bookmarks pin up to ten rolls, persist, and respect the cap", async ({
  page,
}) => {
  await seedProgress(page, { history: rolls });
  await page.goto("/#history");

  const mark = (n) => page.getByRole("button", { name: `Bookmark roll ${n}` });
  const marked = (n) =>
    page.getByRole("button", { name: `Remove bookmark from roll ${n}` });

  // Ten rolls can be pinned; the chip counts them.
  for (let n = 1010; n >= 1001; n--) await mark(n).click();
  await expect(marked(1010)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarks (10/10)" }),
  ).toBeVisible();

  // The eleventh is refused with the reason, and stays unpinned.
  await mark(1000).click();
  await expect(
    page.getByText("You can keep up to 10 bookmarked rolls. Remove one first."),
  ).toBeVisible();
  await expect(mark(1000)).toBeVisible();

  // Bookmarks live on the save, so a reload keeps them.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Bookmarks (10/10)" }),
  ).toBeVisible();
  const pinned = Array.from({ length: 10 }, (_, i) => `roll:${10 - i}`);
  expect((await saved(page)).bookmarks).toEqual(pinned);

  // The Bookmarks filter shows only pinned rolls.
  await page.getByRole("button", { name: "Bookmarks (10/10)" }).click();
  await expect(page.locator(".activity-event")).toHaveCount(10);

  // Removing one frees a slot for the eleventh.
  await page.getByRole("button", { name: "All activity" }).click();
  await marked(1001).click();
  await mark(1000).click();
  await expect(marked(1000)).toBeVisible();
  expect((await saved(page)).bookmarks).toEqual([
    ...pinned.slice(0, 9),
    "roll:0",
  ]);
});

test("a repaired save drops bookmarks whose roll is gone", async ({ page }) => {
  await seedProgress(page, {
    history: rolls,
    bookmarks: ["roll:3", "ghost", 42, "roll:3"],
  });
  await page.goto("/#history");
  // The loader keeps only the mark that matches a real roll, deduped.
  await expect(
    page.getByRole("button", { name: "Bookmarks (1/10)" }),
  ).toBeVisible();
});
