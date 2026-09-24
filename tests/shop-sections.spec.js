import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { emptyProgress } from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
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

// The jump is a smooth scroll, so the shelf arrives rather than being
// teleported: its top edge ends up on screen, never below the fold.
async function visible(page, id, label) {
  await page.getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect
    .poll(
      async () => {
        const box = await page.locator(`#shop-${id}`).boundingBox();
        const height = await page.evaluate(() => window.innerHeight);
        if (!box) return -1;
        return box.y >= 0 && box.y < height - 120 ? box.y : -1;
      },
      { message: `${label} should scroll into view` },
    )
    .toBeGreaterThanOrEqual(0);
  await expect(
    page.getByRole("heading", { name: label, exact: true, level: 2 }),
  ).toBeInViewport();
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
  await expect(shelf).toContainText("Flywheel lives in this shelf");
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

test("the shop is calmer by construction: rows, one sticky bar, search and filters", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  const css = fs.readFileSync("src/shop.css", "utf8");
  // Every product is a row with the same four facts, not a preview banner.
  expect(shop).toContain("shop-card-effect");
  expect(shop).toContain("shop-card-buy");
  expect(shop).toContain("shop-tag");
  // Long descriptions are folded to two quiet lines; no extra button competes
  // with the buy action inside a row.
  expect(shop).toContain("shop-card-desc");
  expect(shop).not.toContain("shop-card-more");
  expect(css).toContain("-webkit-line-clamp: 2");
  // One sticky bar holds shelves, search and filters.
  expect(shop).toContain('className="shop-controls"');
  expect(shop).toContain('aria-label="Search the shop"');
  expect(shop).toContain('aria-label="Shop filters"');
  expect(css).toContain(".shop-controls {");
  expect(css).toContain("position: sticky");
  // Search and filters only narrow what is drawn; the default view hides
  // nothing, so nothing disappears without the player asking.
  expect(shop).toContain("const matches = (item, state)");
  expect(shop).toContain('{ id: "all", text: "Everything" }');
  expect(shop).toContain("visibleCount");
  expect(shop).toContain("shopProducts.length");
  // Every product keeps its stable hook for deep links and tests.
  for (const product of shopProducts)
    expect(shop).toContain(`data-product={item.id}`);
});

test("the skills shelf states what the rack adds up to", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  // The shelf quotes the shared rack report instead of recomputing anything.
  expect(shop).toContain("rackReport(progress)");
  expect(shop).toContain("rack-report");
  expect(shop).toContain("Your rack, added up");
  expect(shop).toContain("Banked EP multiplier");
  expect(shop).toContain("rack-report-chips");
  // …and the confirmation dialog repeats the exact chip, not a paraphrase.
  expect(shop).toContain("skillEffectChips");
  expect(shop).toContain("purchase-effect");
});

test("the auto-roll tool is described as an ability, not as a setting", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  expect(shop).toContain("One click arms it, another stands it down");
  expect(shop).toContain("Click the ability in the rack to turn it on.");
  const bar = fs.readFileSync("src/components/SkillBar.jsx", "utf8");
  expect(bar).toContain('role="switch"');
  expect(bar).toContain('aria-label="Auto-Roll"');
  expect(bar).toContain("autoRollState");
  expect(bar).toContain("onToggleAutoRoll");
  // The roll page no longer carries a separate settings panel for it.
  const roll = fs.readFileSync("src/components/RollExperience.jsx", "utf8");
  expect(roll).not.toContain("auto-roll-heading");
  expect(roll).toContain("autoRollRunning");
});
