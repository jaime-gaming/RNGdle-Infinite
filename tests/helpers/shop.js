import { expect } from "@playwright/test";
import {
  SHOP_SECTIONS,
  productById,
  shelfOfProduct,
} from "../../src/shop-data.js";

const shelfLabel = (id) =>
  SHOP_SECTIONS.find((section) => section.id === id)?.label ?? "";

const shelfForProduct = (id) => shelfOfProduct(productById.get(id));

async function gotoShelf(page, shelf) {
  await page.goto(shelf ? `/shop/${shelf}` : "/shop");
  await expect(
    page.locator(shelf ? `#shop-${shelf}` : ".shop-hub"),
  ).toBeVisible();
  return shelf;
}

export async function gotoShelfFor(page, id) {
  const item = productById.get(id);
  if (item?.kind === "aura") {
    await page.goto(`/shop/auras/${item.family}`);
    await expect(page.locator(`[data-product="${id}"]`)).toBeVisible();
    return "auras";
  }
  return gotoShelf(page, shelfForProduct(id));
}

async function openFamilyFor(page, id) {
  const item = productById.get(id);
  if (item?.kind !== "aura") return;
  if (await page.locator(`[data-product="${id}"]`).count()) return;
  const path = new URL(page.url()).pathname;
  const onIndex = /\/shop\/auras\/?$/.test(path);
  if (!onIndex)
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("button", { name: "Auras", exact: true })
      .click();
  await page
    .locator(`.aura-family-banner[data-family="${item.family}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/shop/auras/${item.family}$`));
  await expect(page.locator(`[data-product="${id}"]`)).toHaveCount(1);
}

export async function openShelfFor(page, id) {
  const shelf = shelfForProduct(id);
  const label = shelfLabel(shelf);

  if (await page.locator(`#shop-${shelf}`).count()) {
    await openFamilyFor(page, id);
    return shelf;
  }
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
  await openFamilyFor(page, id);
  return shelf;
}
