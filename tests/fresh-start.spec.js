import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import {
  FRESH_START_PRESTIGES,
  PROGRESS_KEY,
  applyProgress,
  emptyProgress,
  freshStartEligible,
  parseAndRepairProgress,
} from "../src/progress.js";

// Mirrors FRESH_START_SEEN_KEY in src/components/FreshStart.jsx, which pulls
// CSS in and so cannot be imported from a Node test.
const SEEN_KEY = "rng-infinite-fresh-start-seen-v1";
const veteran = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  ultraRebirths: FRESH_START_PRESTIGES,
  rebirths: 7,
  rollbacks: 1,
  balance: 123456,
  totalEarned: 9876543,
  owned: ["starfall", "prism", "quickwind-1"],
  equipped: "prism",
  ...patch,
});
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const seen = (page) =>
  page.evaluate((key) => localStorage.getItem(key), SEEN_KEY);

test("a fresh start needs a profile and three prestiges, wipes the run and keeps only auras and a keepsake", () => {
  expect(freshStartEligible(veteran({ ultraRebirths: 2 }))).toBe(false);
  expect(freshStartEligible(veteran({ profile: null }))).toBe(false);
  expect(freshStartEligible(veteran())).toBe(true);
  expect(() =>
    applyProgress(veteran({ ultraRebirths: 2 }), { type: "fresh-start" }),
  ).toThrow("three prestiges");
  const after = applyProgress(veteran(), { type: "fresh-start", at: 1000 });
  expect(after.profile).toEqual(testProfile);
  // Auras survive; the skill does not. The equipped aura stays equipped.
  expect(after.owned).toEqual(["starfall", "prism"]);
  expect(after.equipped).toBe("prism");
  expect(after.balance).toBe(0);
  expect(after.rebirths).toBe(0);
  expect(after.ultraRebirths).toBe(0);
  expect(after.rollbacks).toBe(0);
  expect(after.freshStarts).toBe(1);
  expect(after.history).toEqual([
    {
      id: "fresh-start:1",
      type: "fresh-start",
      at: 1000,
      count: 1,
      before: {
        rebirths: 7,
        ultraRebirths: 3,
        rollbacks: 1,
        totalEarned: 9876543,
        rolls: 0,
      },
    },
  ]);
  // The reset save reads back without repairs, and is no longer eligible.
  const read = parseAndRepairProgress(JSON.stringify(after));
  expect(read.repairs).toEqual([]);
  expect(freshStartEligible(read.progress)).toBe(false);
});

test("the suggestion opens once per profile, then lives behind the header flag", async ({
  page,
}) => {
  await seedProgress(page, veteran());
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "You have seen it all." });
  await expect(dialog).toBeVisible();
  expect(await seen(page)).toBe(testProfile.id);
  await dialog.getByRole("button", { name: "Keep playing" }).click();
  await expect(dialog).not.toBeVisible();
  expect((await saved(page)).ultraRebirths).toBe(FRESH_START_PRESTIGES);
  // Not again on reload; the "!" flag reopens it on demand.
  await page.reload();
  await expect(dialog).not.toBeVisible();
  const flag = page.getByRole("button", {
    name: "Start fresh? The game has a suggestion",
  });
  await expect(flag).toBeVisible();
  await flag.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Start from zero" }).click();
  await expect(dialog).toContainText("Last chance");
  await dialog.getByRole("button", { name: "Go back" }).click();
  await expect(dialog).not.toContainText("Last chance");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("confirming the reset saves the wiped game, keeps the auras and removes the flag", async ({
  page,
}) => {
  await seedProgress(page, veteran());
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "You have seen it all." });
  await dialog.getByRole("button", { name: "Start from zero" }).click();
  await dialog.getByRole("button", { name: "Yes, reset everything" }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await saved(page)).freshStarts).toBe(1);
  const after = await saved(page);
  expect(after.balance).toBe(0);
  expect(after.ultraRebirths).toBe(0);
  expect(after.owned).toEqual(["starfall", "prism"]);
  expect(after.profile.id).toBe(testProfile.id);
  await expect(
    page.getByRole("button", {
      name: "Start fresh? The game has a suggestion",
    }),
  ).toHaveCount(0);
  await page.goto("/history");
  await expect(page.locator('[data-event-type="fresh-start"]')).toBeVisible();
});

test("a guest with three prestiges is not offered a fresh start", async ({
  page,
}) => {
  await seedProgress(page, veteran({ profile: null }));
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Start fresh? The game has a suggestion",
    }),
  ).toHaveCount(0);
});
