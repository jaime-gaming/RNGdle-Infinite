import { test, expect } from "@playwright/test";
import { emptyProgress } from "../src/progress.js";
import { seedProgress } from "./helpers/progress.js";

// The shop is a street of shelves: the jump bar reaches each one, every shelf
// is a real anchor, and the flywheel tiers live on the Skills shelf because
// Flywheel is a skill.

const funded = {
  ...emptyProgress(),
  balance: 50000000,
  totalEarned: 50000000,
  owned: ["offline-roller"],
};

// The jump is a smooth scroll, so the shelf arrives rather than being teleported.
async function visible(page, id, label) {
  await page.getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect
    .poll(
      async () => (await page.locator(`#shop-${id}`).boundingBox())?.y ?? -1,
      {
        message: `${label} should scroll into view`,
      },
    )
    .toBeLessThan(200);
}

test("the jump bar reaches every shelf and survives a deep link", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.goto("/shop");
  const jump = page.getByRole("navigation", { name: "Shop sections" });
  await expect(jump).toBeVisible();
  await expect(jump.getByRole("link")).toHaveCount(6);
  for (const [id, label] of [
    ["skills", "Skills"],
    ["pace", "Pace"],
    ["companions", "Companions"],
    ["auras", "Auras"],
    ["offline", "Offline"],
    ["tools", "Tools"],
  ])
    await visible(page, id, label);

  // A shared link lands on its shelf without any clicking.
  await page.goto("/shop#tools");
  await page.waitForSelector("#shop-tools");
  await expect
    .poll(async () => (await page.locator("#shop-tools").boundingBox()).y)
    .toBeLessThan(200);
});

test("the skills shelf is where charged effects live, flywheel included", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.goto("/shop");
  const shelf = page.locator("#shop-skills");
  await expect(shelf.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(shelf).toContainText("Flywheel sits in this shelf");
  // Flywheel and its tiers, the shop skills and the two bays.
  for (const id of [
    "flywheel",
    "surge",
    "trail",
    "bounce",
    "twice",
    "bedrock",
    "turbo",
    "quarry",
    "skill-bay-1",
    "skill-bay-2",
  ])
    await expect(shelf.locator(`[data-product="${id}"]`)).toHaveCount(1);
  // Timing tracks are not on this shelf any more: they moved to Pace.
  await expect(shelf.locator('[data-product="quickwind-1"]')).toHaveCount(0);
  await expect(
    page.locator("#shop-pace [data-product='quickwind-1']"),
  ).toHaveCount(1);
  // Companions keep their own shelf, owned by the companion component.
  await expect(
    page.locator("#shop-companions [data-pet='pebble']"),
  ).toHaveCount(1);
});
