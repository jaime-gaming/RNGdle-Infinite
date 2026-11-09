import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
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

const SALE_DAY = Date.UTC(2026, 10, 27, 12);
const DAY_BEFORE = Date.UTC(2026, 10, 26, 12);

const funded = {
  balance: 60000000,
  totalEarned: 60000000,
  owned: ["offline-roller"],
};

async function buy(page, id) {
  await page
    .locator(`[data-product="${id}"] button:not(.shop-look-eye)`)
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.locator(".shop-confirm")).not.toBeVisible();
}

test("the sale day dresses the page: ticker, event notice and sale branding", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/");
  await waitForApp(page);

  const ticker = page.locator('[data-testid="sale-ticker"]');
  await expect(ticker).toBeVisible();
  await expect(ticker).toContainText("SALE");

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /favicon-sale\.svg$/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    /manifest-sale\.webmanifest$/,
  );

  await expect(page.locator(".sale-ads-left .sale-ad")).toHaveCount(8);
  await expect(page.locator(".sale-ads-right .sale-ad")).toHaveCount(8);
  await expect(page.locator(".sale-ads-left").first()).toContainText("OFF");

  await page.goto("/shop");
  await waitForApp(page);
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
  await expect(dialog).not.toBeVisible();

  await expect(
    page.locator('[data-testid="sale-stamp-card"]:visible'),
  ).toBeVisible();
});

test("every product carries its own discount, and stamps follow EP spent", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/pace");
  await waitForApp(page);

  const cheap = productById.get("quickwind-1");
  const card = page.locator('[data-product="quickwind-1"]');
  await expect(card.locator(".sale-tag")).toContainText("−30%");
  await expect(card.locator(".shop-price-was")).toContainText("30,000");
  await expect(card.locator(".shop-price")).toContainText(
    `${salePrice(cheap, SALE_DAY).toLocaleString("en-US")} EP`,
  );

  await buy(page, "quickwind-1");
  const stampCard = page.locator('[data-testid="sale-stamp-card"]:visible');
  await page.goto("/shop");
  await waitForApp(page);
  await expect(stampCard).toContainText("0 of 25");

  const dear = productById.get("static");
  const paid = salePrice(dear, SALE_DAY);
  await page.goto("/shop/auras/randomness");
  await waitForApp(page);
  await buy(page, "static");
  const stamps = Math.floor(
    (salePrice(cheap, SALE_DAY) + paid) / SALE_STAMP_EVERY,
  );
  expect(stamps).toBeGreaterThan(0);
  await page.goto("/shop");
  await waitForApp(page);
  await expect(stampCard).toContainText(`${stamps} of 25`);

  const receipts = await page.evaluate(async () => {
    const { parseProgress, PROGRESS_KEY } = await import("/src/progress.js");
    return parseProgress(localStorage.getItem(PROGRESS_KEY)).history.filter(
      (entry) => entry.type === "sale-reward",
    );
  });
  expect(receipts.some((entry) => entry.stamps === stamps)).toBe(true);
});

test("the hub grows a Black Friday door while the day is on", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop");
  await waitForApp(page);

  const tile = page.locator('[data-shelf="black-friday"]');
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/\/shop\/black-friday$/);
  const shelf = page.locator("#shop-black-friday");
  await expect(shelf).toBeVisible();

  const book = shelf.locator('[data-testid="sale-stamp-book"]');
  await expect(book).toBeVisible();
  await expect(book.locator(".sale-stamp")).toHaveCount(25);
  await expect(book.locator(".sale-stamp.is-filled")).toHaveCount(0);
  await expect(book.locator(".sale-stamp-label")).toHaveCount(25);
  await expect(book.locator(".sale-stamp-label").first()).toHaveText("100K EP");
  const shapes = await book
    .locator(".sale-stamp")
    .evaluateAll((slots) =>
      slots.map((slot) => getComputedStyle(slot).clipPath),
    );
  expect(new Set(shapes).size).toBe(25);

  await expect(shelf.locator(".shop-card[data-product]")).toHaveCount(7);
  await expect(shelf.locator('[data-product="jack-o-glow"]')).toBeVisible();
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#shop-black-friday")).toBeVisible();
  await page.goto("/shop/auras");
  await waitForApp(page);
  await expect(
    page.locator('.aura-family-banner[data-family="special"]'),
  ).toHaveCount(0);
  await page.goto("/settings");
  await waitForApp(page);
  await expect(
    page.getByRole("button", { name: "Special & Limiteds" }),
  ).toHaveCount(0);
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
  await waitForApp(page);

  await buy(page, "static");
  await page.goto("/shop");
  await waitForApp(page);
  await expect(
    page.locator('[data-testid="sale-stamp-card"]:visible'),
  ).toContainText("unlocked");

  await page.goto("/shop/black-friday");
  await waitForApp(page);
  await page
    .locator('[data-testid="sale-stamp-book"]')
    .scrollIntoViewIfNeeded();
  await expect(
    page.locator(".sale-stamp.is-imprinting").first(),
  ).toBeAttached();
  await expect(
    page.locator('[data-testid="sale-stamp-book"] .sale-stamp.is-filled'),
  ).toHaveCount(25);
  await expect(
    page.locator('.sale-stamp.is-blackout [data-cosmetic="blackout-2026"]'),
  ).toBeVisible();
  await expect(page.locator(".sale-stamp.is-new")).toHaveCount(25);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".sale-stamp.is-new")).toHaveCount(0);

  await page.goto("/shop/auras/black-friday");
  await waitForApp(page);
  const skin = page.locator(`[data-product="${BLACK_FRIDAY_SKIN.id}"]`);
  await expect(skin).toHaveClass(/is-owned/);
  await expect(skin.getByRole("button", { name: /equip/i })).toBeVisible();

  await page.goto("/settings");
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Special & Limiteds", exact: true })
    .click();
  await expect(
    page
      .locator(".wardrobe")
      .getByText(BLACK_FRIDAY_SKIN.name, { exact: true }),
  ).toBeVisible();
});

test("the counter sells the retired looks the save missed, at a fixed price", async ({
  page,
}) => {
  await seedProgress(page, { ...funded, owned: [] });
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/black-friday");
  await waitForApp(page);

  const card = page.locator('[data-product="jack-o-glow"]');
  await expect(card.locator(".sale-tag")).toContainText("COUNTER");
  await expect(card.locator(".shop-price")).toContainText(
    `${RNGWEEN_RESALE_PRICE.toLocaleString("en-US")} EP`,
  );
  await buy(page, "jack-o-glow");
  await page.goto("/shop/auras/legacy");
  await waitForApp(page);
  await expect(page.locator('[data-product="jack-o-glow"]')).toHaveClass(
    /is-owned/,
  );
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(1);
});

test("outside the day the sale leaves no trace", async ({ page }) => {
  await seedProgress(page, { ...funded, owned: [] });
  await pauseClockAt(page, DAY_BEFORE);
  await page.goto("/");
  await waitForApp(page);
  await expect(page.locator('[data-testid="sale-ticker"]')).toHaveCount(0);
  await expect(page.locator(".sale-ads")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    /favicon\.svg$/,
  );

  await page.goto("/shop");
  await waitForApp(page);
  await expect(page.locator('[data-testid="sale-stamp-card"]')).toHaveCount(0);
  await expect(page.locator('[data-shelf="black-friday"]')).toHaveCount(0);
  await page.goto("/shop/black-friday");
  await waitForApp(page);
  await expect(page.getByText("The counter is closed")).toBeVisible();
  const flag = page.locator('[data-testid="sale-event-button"]');
  await expect(flag).toBeVisible();
  await expect(flag).toContainText("in");

  await page.goto("/shop/pace");
  await waitForApp(page);
  const card = page.locator('[data-product="quickwind-1"]');
  await expect(card.locator(".sale-tag")).toHaveCount(0);
  await expect(card.locator(".shop-price")).toContainText("30,000 EP");

  await page.goto("/shop/auras");
  await waitForApp(page);
  await expect(page.locator(".aura-family-banner")).toHaveCount(5);
  await page.goto("/shop/auras/special");
  await waitForApp(page);
  await expect(
    page.getByText("No special or limited auras in this save"),
  ).toBeVisible();
  await page.goto("/settings");
  await waitForApp(page);
  await expect(
    page.getByRole("button", { name: "Special & Limiteds" }),
  ).toHaveCount(0);

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
  await waitForApp(page);

  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const ultra = page.getByRole("menuitemradio", {
    name: "Ultra-Black theme",
    exact: true,
  });
  await expect(ultra).toBeVisible();
  await expect(
    page.locator(".appearance-menu .appearance-temporary"),
  ).toHaveText("TEMPORAL");
  await ultra.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sale-theme",
    "ultra-black",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('[data-testid="sale-theme-line"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Red Sale theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sale-theme",
    "red-sale",
  );

  await pauseClockAt(page, SALE_DAY + 86400000);
  await expect(page.locator("html")).not.toHaveAttribute("data-sale-theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('[data-testid="sale-ticker"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="sale-theme-line"]')).toHaveCount(0);
});

test("the eye on an aura card previews the look on a sample roll", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, DAY_BEFORE);
  await page.goto("/shop/auras/celestial");
  await waitForApp(page);
  await page.locator('[data-product="eclipse"] .shop-look-eye').click();
  const dialog = page.locator(".shop-preview-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("on a roll");
  await dialog.getByRole("button", { name: "godly" }).click();
  const box = dialog.locator(".number-box");
  await expect(box).toBeVisible();
  await expect(box.locator(".artifact-digit.is-scrambling")).toHaveCount(6);
  await page.clock.runFor(1000);
  await expect(box.locator(".artifact-digit.is-scrambling")).toHaveCount(4);
  await page.clock.runFor(1600);
  await expect(box.locator(".artifact-digit.is-scrambling")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Replay preview" }).click();
  await expect(box.locator(".artifact-digit.is-scrambling")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("sale flyers remain visible beside the game on desktop and mobile", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await waitForApp(page);
    const left = page.locator(".sale-ads-left");
    const right = page.locator(".sale-ads-right");
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    await expect(left.locator(".sale-ad").first()).toBeVisible();
    const [leftBox, mainBox, rightBox] = await Promise.all([
      left.boundingBox(),
      page.locator("main").boundingBox(),
      right.boundingBox(),
    ]);
    expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(mainBox.x);
    expect(mainBox.x + mainBox.width).toBeLessThanOrEqual(rightBox.x);
  }
});

test("posters stay in the document, fit above the footer and link to their shelves", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await waitForApp(page);
  const first = page.getByRole("link", { name: "UP TO 50% OFF: Every shelf" });
  await expect(first).toHaveAttribute("href", "/shop");
  expect(
    await first.evaluate(
      (el) => getComputedStyle(el.closest(".sale-ads")).position,
    ),
  ).toBe("absolute");
  await expect(page.locator(".sale-ad[hidden]").first()).toBeAttached();
  await first.click();
  await expect(page).toHaveURL(/\/shop$/);
  await page.goto("/shop/black-friday");
  await waitForApp(page);
  await page.clock.runFor(1000);
  const bounds = await page.evaluate(() => {
    const main = document.querySelector("main").getBoundingClientRect();
    return [...document.querySelectorAll(".sale-ads")].map((rail) => ({
      rail: {
        top: rail.getBoundingClientRect().top,
        bottom: rail.getBoundingClientRect().bottom,
      },
      mainBottom: main.bottom,
      visible: [...rail.querySelectorAll(".sale-ad:not([hidden])")].map(
        (ad) => {
          const rect = ad.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        },
      ),
    }));
  });
  for (const { rail, mainBottom, visible } of bounds) {
    expect(visible.length).toBeGreaterThan(1);
    for (const ad of visible) {
      expect(ad.top).toBeGreaterThanOrEqual(rail.top);
      expect(ad.bottom).toBeLessThanOrEqual(rail.bottom);
      expect(ad.bottom).toBeLessThan(mainBottom);
    }
    expect(mainBottom - visible.at(-1).bottom).toBeLessThan(60);
  }
  const styles = await page
    .locator(".sale-ad:not([hidden])")
    .evaluateAll((ads) =>
      ads.map((ad) => ({
        transform: getComputedStyle(ad).transform,
        width: ad.offsetWidth,
      })),
    );
  expect(new Set(styles.map((style) => style.transform)).size).toBeGreaterThan(
    1,
  );
  expect(new Set(styles.map((style) => style.width)).size).toBeGreaterThan(1);
  await page
    .getByRole("link", { name: "FASTER REVEALS: Explore pace" })
    .click();
  await expect(page).toHaveURL(/\/shop\/pace$/);
});

test("only newly earned stamps animate on returning to the book", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/black-friday");
  await waitForApp(page);
  await expect(page.locator(".sale-stamp.is-new")).toHaveCount(0);
  await page.goto("/shop/auras/randomness");
  await waitForApp(page);
  await buy(page, "static");
  await page.goto("/shop/black-friday");
  await waitForApp(page);
  await page
    .locator('[data-testid="sale-stamp-book"]')
    .scrollIntoViewIfNeeded();
  await expect(page.locator(".sale-stamp.is-new.is-imprinting")).toHaveCount(1);
  await expect(page.locator(".sale-stamp.is-new")).toHaveCount(1);
  await expect(page.locator(".sale-stamp.is-new")).toHaveCSS(
    "animation-name",
    "stamp-imprint",
  );
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".sale-stamp.is-filled")).toHaveCount(1);
  await expect(page.locator(".sale-stamp.is-new")).toHaveCount(0);
});

test("poster fitting updates when a page grows and shrinks", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await waitForApp(page);
  const count = () => page.locator(".sale-ad:not([hidden])").count();
  const before = await count();
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "poster-fit-test-spacer";
    spacer.style.height = "1800px";
    document.querySelector("main").append(spacer);
  });
  await page.clock.runFor(200);
  await expect.poll(count).toBeGreaterThan(before);
  await page.evaluate(() =>
    document.getElementById("poster-fit-test-spacer").remove(),
  );
  await page.clock.runFor(200);
  await expect.poll(count).toBe(before);
  const boxes = await page
    .locator(".sale-ad:not([hidden])")
    .evaluateAll((ads) =>
      ads.map((ad) => ({
        bottom: ad.getBoundingClientRect().bottom,
        railBottom: ad.closest(".sale-ads").getBoundingClientRect().bottom,
        mainBottom: ad.closest("main").getBoundingClientRect().bottom,
      })),
    );
  for (const { bottom, railBottom, mainBottom } of boxes) {
    expect(bottom).toBeLessThanOrEqual(railBottom);
    expect(bottom).toBeLessThan(mainBottom);
  }
});

test("Blackout keeps bright ink and honors reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop/black-friday");
  await waitForApp(page);
  const aura = page.locator('[data-product="blackout-2026"] .number-box');
  const ink = await aura
    .locator(".number-box-content")
    .evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(ink).toContain("255, 255, 255");
  expect(
    await aura
      .locator(".box-gloss")
      .evaluate((node) => getComputedStyle(node, "::before").animationName),
  ).toBe("none");
});

test("posters follow the page, not a timer or a random pick", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/");
  await waitForApp(page);
  const first = page.locator(".sale-ads-left .sale-ad:not([hidden])").first();
  await expect(first).toHaveAttribute(
    "aria-label",
    "UP TO 50% OFF: Every shelf",
  );
  await first.focus();
  await page.clock.runFor(45000);
  await expect(first).toHaveAttribute(
    "aria-label",
    "UP TO 50% OFF: Every shelf",
  );
  await page.getByRole("button", { name: "Shop", exact: true }).first().click();
  await waitForApp(page);
  await expect(
    page.locator(".sale-ads-left .sale-ad:not([hidden])").first(),
  ).toHaveAttribute("aria-label", "100K EP = 1 STAMP: Fill your card");
});

test("the event briefing highlights the essentials and opens the sale shelf", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/shop");
  await waitForApp(page);
  await page.getByTestId("sale-event-button").click();
  const dialog = page.getByTestId("sale-event-dialog");
  await expect(dialog.locator(".sale-dialog-highlights")).toContainText(
    "20–50%",
  );
  await expect(dialog.locator(".sale-dialog-highlights")).toContainText(
    "100K EP",
  );
  await expect(dialog.locator(".sale-dialog-highlights")).toContainText(
    "25 stamps",
  );
  await expect(
    dialog.getByRole("button", { name: "Open Special & Limiteds" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Visit the Black Friday shelf" })
    .click();
  await expect(page).toHaveURL(/\/shop\/black-friday$/);
});

test("posters stay put over time regardless of motion preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedProgress(page, funded);
  await pauseClockAt(page, SALE_DAY);
  await page.goto("/");
  await waitForApp(page);
  const first = page.locator(".sale-ads-left .sale-ad:not([hidden])").first();
  await expect(first).toHaveAttribute(
    "aria-label",
    "UP TO 50% OFF: Every shelf",
  );
  await page.clock.runFor(30000);
  await expect(first).toHaveAttribute(
    "aria-label",
    "UP TO 50% OFF: Every shelf",
  );
});
