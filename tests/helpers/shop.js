import { expect } from "@playwright/test";
import {
  SHOP_SECTIONS,
  productById,
  shelfOfProduct,
} from "../../src/shop-data.js";

// The shop is a street of sub-pages: /shop is the index of six shelf buttons,
// and each shelf (/shop/skills, /shop/auras …) sells its own products. A test
// that buys something therefore has to be on that product's shelf, and these
// helpers are the one place that knows how to get there.

export const shelfLabel = (id) =>
  SHOP_SECTIONS.find((section) => section.id === id)?.label ?? "";

export const shelfForProduct = (id) => shelfOfProduct(productById.get(id));

// A direct visit, the way a shared link or a reload reaches a shelf.
export async function gotoShelf(page, shelf) {
  await page.goto(shelf ? `/shop/${shelf}` : "/shop");
  await expect(
    page.locator(shelf ? `#shop-${shelf}` : ".shop-hub"),
  ).toBeVisible();
  return shelf;
}

export async function gotoShelfFor(page, id) {
  return gotoShelf(page, shelfForProduct(id));
}

// Switching shelves from wherever the shop is: the hub lists all six and a
// shelf lists the other five. In-app, so nothing reloads — which matters when a
// roll is in flight under a virtual clock.
export async function openShelfFor(page, id) {
  const shelf = shelfForProduct(id);
  const label = shelfLabel(shelf);
  // A shelf lists the other five, never itself: already being there is done.
  if (await page.locator(`#shop-${shelf}`).count()) return shelf;
  const hub = page.getByRole("navigation", { name: "Shop sections" });
  const others = page.getByRole("navigation", { name: "Other shelves" });
  if (!(await hub.count()) && !(await others.count()))
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Shop", exact: true })
      .click();
  if (await hub.count())
    await hub.getByRole("link", { name: label, exact: true }).click();
  else await others.getByRole("link", { name: label, exact: true }).click();
  await expect(page.locator(`#shop-${shelf}`)).toBeVisible();
  return shelf;
}
