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

test("the profile keeps a tagline and an accent, cleaned and bounded", async ({
  page,
}) => {
  await seedProgress(page, { history: rolls.slice(0, 2) });
  await page.goto("/profile");
  const input = page.getByTestId("tagline-input");
  const save = page.getByTestId("tagline-save");
  // Nothing to save until the text differs from what is stored.
  await expect(save).toBeDisabled();
  await input.fill("  Chasing   a\tGODLY  ");
  await save.click();
  // Shown under the name, whitespace collapsed; the input mirrors the save.
  await expect(page.getByTestId("profile-tagline")).toHaveText(
    "Chasing a GODLY",
  );
  expect((await saved(page)).profile.tagline).toBe("Chasing a GODLY");
  // The field itself stops at the cap.
  await expect(input).toHaveAttribute("maxlength", "40");
  // An accent is one click; amber is the default and is not stored.
  expect((await saved(page)).profile.accent).toBeUndefined();
  await page.getByRole("radio", { name: "Violet" }).click();
  await expect(page.getByRole("radio", { name: "Violet" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect((await saved(page)).profile.accent).toBe("violet");
  await expect(page.locator(".profile-page")).toHaveCSS(
    "--profile-accent",
    "#a06ee8",
  );
  await page.getByRole("radio", { name: "Amber" }).click();
  await expect(page.getByRole("radio", { name: "Amber" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect((await saved(page)).profile.accent).toBeUndefined();
  // Clearing the tagline removes the field again.
  await input.fill("");
  await save.click();
  await expect(page.getByTestId("profile-tagline")).toHaveCount(0);
  expect((await saved(page)).profile.tagline).toBeUndefined();
  // A reload reads the look back from the save, and a tampered save is
  // repaired: an unknown accent is dropped, a long tagline is cut.
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key));
    data.profile.accent = "neon";
    data.profile.tagline = "x".repeat(60) + "\nsecond line";
    localStorage.setItem(key, JSON.stringify(data));
  }, PROGRESS_KEY);
  await page.reload();
  await expect(page.getByTestId("profile-tagline")).toHaveText("x".repeat(40));
  await expect(page.getByRole("radio", { name: "Amber" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
