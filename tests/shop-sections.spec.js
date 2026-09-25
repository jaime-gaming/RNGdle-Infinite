import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { emptyProgress } from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
import { seedProgress } from "./helpers/progress.js";

// The shop is a street of sub-pages: the hub is an index of six buttons, each
// one opening its own URL (/shop/skills, /shop/auras …), and the flywheel tiers
// live on the Skills shelf because Flywheel is a skill.

const funded = {
  ...emptyProgress(),
  balance: 50000000,
  totalEarned: 50000000,
  owned: ["offline-roller"],
};

// Clicking a shelf button is a real navigation: the URL changes, the hub is
// gone, that shelf is on screen, and the same URL still works after a reload.
async function openShelf(page, id, label) {
  await page.getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/shop/${id}$`));
  await expect(page.locator(".shop-hub")).toHaveCount(0);
  await expect(page.locator(`#shop-${id}`)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: label, exact: true, level: 2 }),
  ).toBeInViewport();
  await expect(page.locator('nav[aria-label="Breadcrumb"]')).toContainText(
    label,
  );
}

test("the hub is an index of shelf buttons, and each one is its own page", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.goto("/shop");
  const hub = page.getByRole("navigation", { name: "Shop sections" });
  await expect(hub).toBeVisible();
  await expect(hub.getByRole("link")).toHaveCount(6);
  // The hub is a front door: no catalogue rows behind it, only doors.
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(0);
  await expect(
    hub.getByRole("link", { name: "Auras", exact: true }),
  ).toHaveAttribute("href", "/shop/auras");

  for (const [id, label] of [
    ["skills", "Skills"],
    ["pace", "Pace"],
    ["companions", "Companions"],
    ["auras", "Auras"],
    ["offline", "Offline"],
    ["tools", "Tools"],
  ]) {
    await openShelf(page, id, label);
    // The shelf's own URL is what a share would use.
    await page.reload();
    await expect(page.locator(`#shop-${id}`)).toBeVisible();
    await page.getByRole("button", { name: "All shelves" }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.locator(".shop-hub")).toHaveCount(1);
  }
});

test("deep links and legacy shelf hashes land on the right shelf", async ({
  page,
}) => {
  await seedProgress(page, funded);
  // A shared legacy link lands on its shelf, normalised to the real path.
  await page.goto("/shop#tools");
  await expect(page).toHaveURL(/\/shop\/tools$/);
  await expect(page.locator("#shop-tools")).toBeVisible();
  await expect(page.getByTestId("cooldown-duration")).toBeVisible();

  // A shelf is entered from the hub and left with the browser's own back.
  await page.goto("/shop");
  await page.getByRole("link", { name: "Pace", exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/pace$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.locator(".shop-hub")).toBeVisible();

  // The other five shelves are one click away from any shelf.
  await page.getByRole("link", { name: "Auras", exact: true }).click();
  const others = page.getByRole("navigation", { name: "Other shelves" });
  await expect(others.getByRole("link")).toHaveCount(5);
  await others.getByRole("link", { name: "Offline", exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/offline$/);

  // Nonsense under /shop is not a shelf: it normalises back to the hub.
  await page.goto("/shop/not-a-shelf");
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.locator(".shop-hub")).toBeVisible();
});

test("the skills shelf is where charged effects live, flywheel included", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.goto("/shop/skills");
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
  await page.goto("/shop/pace");
  await expect(
    page.locator("#shop-pace [data-product='quickwind-1']"),
  ).toHaveCount(1);
  // Companions keep their own shelf page, owned by the companion component.
  await page.goto("/shop/companions");
  await expect(
    page.locator("#shop-companions [data-pet='pebble']"),
  ).toHaveCount(1);
});

test("the shop speaks one card language: preview, facts, price, one button", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  const css = fs.readFileSync("src/shop.css", "utf8");
  // Every product leads with a preview band that shows the change, then the
  // same facts, the price and a single buy action.
  expect(shop).toContain("upgrade-preview");
  expect(shop).toContain("aura-preview");
  expect(shop).toContain("shop-card-body");
  expect(shop).toContain("shop-price");
  expect(shop).toContain("shop-item-note");
  expect(shop).toContain("shop-tag");
  // Long descriptions are folded to a few quiet lines; no extra button competes
  // with the buy action inside a card.
  expect(shop).toContain("shop-card-desc");
  expect(shop).not.toContain("shop-card-more");
  expect(css).toContain("-webkit-line-clamp: 3");
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

test("every product icon is a hand-drawn mark, and the hub is buttons", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  const marks = fs.readFileSync("src/components/game-icons.jsx", "utf8");
  // The catalogue never borrows a stock icon: each product's glyph is drawn in
  // game-icons.jsx on the shared grid, and the mark set exports every aura.
  for (const item of shopProducts) {
    expect(
      new RegExp(`^\\s*${item.icon}: \\w+Mark,`, "m").test(shop),
      `no hand-drawn mark mapped for ${item.icon}`,
    ).toBe(true);
  }
  // Each aura also has its own mark in that set, so the shelf, the hub tile and
  // the worn box all describe the same effect.
  const auraMarks = [...marks.matchAll(/export const (\w+Mark) = /g)].map(
    (match) => match[1],
  );
  expect(auraMarks.length).toBeGreaterThanOrEqual(20);
  for (const aura of shopProducts.filter((item) => item.kind === "aura")) {
    const wired = new RegExp(`^\\s*${aura.icon}: (\\w+Mark),`, "m").exec(shop);
    expect(wired, `no mark wired for the ${aura.id} aura`).toBeTruthy();
    expect(auraMarks).toContain(wired[1]);
  }
  expect(shop).not.toMatch(
    /from "lucide-react"[\s\S]{0,200}(Gauge|Mountain|Wind|Layers|Target)/,
  );
  // The shop opens as buttons: one link per shelf, each carrying its own stat
  // and each pointing at the shelf's own page.
  const data = fs.readFileSync("src/shop-data.js", "utf8");
  expect(shop).toContain("shop-hub");
  expect(shop).toContain('className="shop-tile"');
  expect(shop).toContain("sectionStat(entry)");
  expect(shop).toContain('pathForSubpage("shop", entry.id)');
  expect(shop).toContain("onOpenShelf(entry.id)");
  // …and every product knows its shelf through the catalogue, not a second list.
  expect(data).toContain("export function shelfOfProduct(item)");
  expect(data).toContain("export function productsOnShelf(id)");
  // …and featured picks that only ever open the shelf that sells them.
  expect(shop).toContain("shop-featured");
  expect(shop).toContain("shelfOfProduct(item)");
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
