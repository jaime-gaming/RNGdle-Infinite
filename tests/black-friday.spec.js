import { test, expect } from "./helpers/clock.js";
import { emptyProgress } from "../src/progress.js";
import { productById } from "../src/shop-data.js";
import {
  BLACK_FRIDAY_SKIN,
  BLACK_FRIDAY_STAMPS,
  RNGWEEN_RESALE_PRICE,
  SALE_STAMP_EVERY,
  salePrice,
} from "../src/black-friday.js";
import { seedProgress } from "./helpers/progress.js";
import { pauseClockAt } from "./helpers/clock.js";

// Black Friday 2026 is one day — Friday 27 November, UTC — and the whole shop
// wears it: a ticker above the header, an event notice at the top of the shop,
// a discount on every product, one sale stamp per purchase, a limited skin at
// 25 stamps, the retired RNGween looks back on the counter at a fixed price,
// two borrowed themes and the sale's own favicon. Every test below pins the
// clock to that day (or to the day before it) and reads the real UI.

const SALE_DAY = Date.UTC(2026, 10, 27, 12);
const DAY_BEFORE = Date.UTC(2026, 10, 26, 12);

const funded = {
  ...emptyProgress(),
  balance: 60000000,
  totalEarned: 60000000,
  owned: ["offline-roller"],
};

async function buy(page, id) {
  await page.locator(`[data-product="${id}"] button`).first().click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
}

test("the sale day dresses the page: ticker, event notice and sale branding", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/");

  const ticker = page.locator('[data-testid="sale-ticker"]');
  await expect(ticker).toBeVisible();
  await expect(ticker).toContainText("SALE");

  // The tab wears the sale's own art for exactly this day.
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /favicon-sale\.svg$/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    /manifest-sale\.webmanifest$/,
  );

  // The shop's event object opens the whole explanation.
  await page.goto("/shop");
  const flag = page.locator('[data-testid="sale-event-button"]');
  await expect(flag).toBeVisible();
  await expect(flag).toContainText("Event");
  await flag.click();
  const dialog = page.locator('[data-testid="sale-event-dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Black Friday");
  await expect(dialog).toContainText(`${BLACK_FRIDAY_STAMPS} stamps`);
  await expect(dialog).toContainText("100,000 EP");
  await expect(dialog).toContainText("10,000,000 EP");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // The stamp card sits on the hub while the day is on.
  await expect(page.locator('[data-testid="sale-stamp-card"]')).toBeVisible();
});

test("every product carries its own discount, and stamps follow EP spent", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/roll");

  const cheap = productById.get("quickwind-1");
  const card = page.locator('[data-product="quickwind-1"]');
  await expect(card.locator(".sale-tag")).toContainText("−30%");
  await expect(card.locator(".shop-price-was")).toContainText("30,000");
  await expect(card.locator(".shop-price")).toContainText(
    `${salePrice(cheap, SALE_DAY).toLocaleString("en-US")} EP`,
  );

  // A 21,000 EP upgrade is under one stamp's worth of spending: the card
  // records the EP but hands out nothing yet.
  await buy(page, "quickwind-1");
  const stampCard = page.locator('[data-testid="sale-stamp-card"]');
  await expect(stampCard).toContainText("0 of 25");

  const dear = productById.get("static");
  const paid = salePrice(dear, SALE_DAY);
  await page.goto("/shop/auras/randomness");
  await buy(page, "static");
  const stamps = Math.floor(
    (salePrice(cheap, SALE_DAY) + paid) / SALE_STAMP_EVERY,
  );
  expect(stamps).toBeGreaterThan(0);
  await expect(stampCard).toContainText(`${stamps} of 25`);

  // The activity feed records the stamp that the spend paid for.
  await page.goto("/");
  await expect(page.getByText(`Sale stamp ${stamps} of 25`)).toBeVisible();
});

test("the hub grows a Black Friday door while the day is on", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop");

  const tile = page.locator('[data-shelf="black-friday"]');
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/\/shop\/black-friday$/);
  const shelf = page.locator("#shop-black-friday");
  await expect(shelf).toBeVisible();
  await expect(shelf.locator('[data-testid="sale-stamp-card"]')).toBeVisible();
  // The limited skin plus every RNGween look this save missed.
  await expect(shelf.locator(".shop-card[data-product]")).toHaveCount(7);
  await expect(shelf.locator('[data-product="jack-o-glow"]')).toBeVisible();
});

test("25 stamps unlock the limited skin, kept like every permanent cosmetic", async ({
  page,
}) => {
  await seedProgress(page, {
    ...funded,
    blackFriday: {
      id: "black-friday-2026",
      spent: 2400000,
      stamps: 24,
      skinEarned: false,
    },
  });
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/auras/randomness");

  // 2,400,000 EP already spent plus this aura crosses the 25th stamp.
  await buy(page, "static");
  await expect(page.locator('[data-testid="sale-stamp-card"]')).toContainText(
    "unlocked",
  );

  await page.goto("/shop/auras/black-friday");
  const skin = page.locator(`[data-product="${BLACK_FRIDAY_SKIN.id}"]`);
  await expect(skin).toHaveClass(/is-owned/);
  await expect(skin.locator("button")).toContainText("Equip");

  // The wardrobe lists it with the special collection.
  await page.goto("/wardrobe");
  await page
    .getByRole("button", { name: "Special & Limiteds", exact: true })
    .click();
  await expect(page.getByText(BLACK_FRIDAY_SKIN.name)).toBeVisible();
});

test("the counter sells the retired looks the save missed, at a fixed price", async ({
  page,
}) => {
  await seedProgress(page, { ...funded, owned: [] });
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/auras/special");
  await page.locator('.aura-family-banner[data-family="legacy"]').click();

  const card = page.locator('[data-product="jack-o-glow"]');
  await expect(card.locator(".sale-tag")).toContainText("COUNTER");
  await expect(card.locator(".shop-price")).toContainText(
    `${RNGWEEN_RESALE_PRICE.toLocaleString("en-US")} EP`,
  );
  await buy(page, "jack-o-glow");
  await expect(card).toHaveClass(/is-owned/);
});

test("outside the day the sale leaves no trace", async ({ page }) => {
  await seedProgress(page, { ...funded, owned: [] });
  await pauseClockAt(page, DAY_BEFORE);
  await page.goto("/");
  await expect(page.locator('[data-testid="sale-ticker"]')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /favicon\.svg$/,
  );

  await page.goto("/shop");
  await expect(page.locator('[data-testid="sale-stamp-card"]')).toHaveCount(0);
  await expect(page.locator('[data-shelf="black-friday"]')).toHaveCount(0);
  await page.goto("/shop/black-friday");
  await expect(page.getByText("The counter is closed")).toBeVisible();
  const flag = page.locator('[data-testid="sale-event-button"]');
  await expect(flag).toBeVisible();
  await expect(flag).toContainText("in");

  await page.goto("/shop/roll");
  const card = page.locator('[data-product="quickwind-1"]');
  await expect(card.locator(".sale-tag")).toHaveCount(0);
  await expect(card.locator(".shop-price")).toContainText("30,000 EP");

  // The retired looks are not for sale, and the skin's family is not live.
  await page.goto("/shop/auras/special");
  await expect(
    page.locator('.aura-family-banner[data-family="black-friday"]'),
  ).toHaveCount(0);
  await page.locator('.aura-family-banner[data-family="legacy"]').click();
  await expect(
    page.locator('[data-product="jack-o-glow"] .shop-source'),
  ).toContainText("Not for sale");

  // The two borrowed themes are not in the menu.
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Ultra-Black theme" }),
  ).toHaveCount(0);
});

test("the sale lends the game two themes, and takes them back", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/");

  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const ultra = page.getByRole("menuitemradio", {
    name: "Ultra-Black theme",
    exact: true,
  });
  await expect(ultra).toBeVisible();
  await ultra.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sale-theme",
    "ultra-black",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Red Sale theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sale-theme",
    "red-sale",
  );

  // The next day the borrowed look steps back to plain dark.
  await pauseClockAt(page, SALE_DAY + 86400000);
  await expect(page.locator("html")).not.toHaveAttribute("data-sale-theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('[data-testid="sale-ticker"]')).toHaveCount(0);
});
