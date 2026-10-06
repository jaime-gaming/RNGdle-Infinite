import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import {
  shopProducts,
  productUnlocked,
  skillStock,
  skillStockWindow,
  SKILL_STOCK_SIZE,
  AURA_FAMILIES,
} from "../src/shop-data.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

// The shop is a street of sub-pages: the hub is an index of six buttons, each
// one opening its own URL (/shop/skills, /shop/auras …), the flywheel tiers
// live on the Skills shelf because Flywheel is a skill, and the shop skills
// themselves are a rotating stall — three on sale, refreshed every five
// minutes.
// Every shelf reads from the cheapest item upwards.

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
  // Rendered, not necessarily above the fold: the shelf's own heading sits
  // under the balance, goal and filter blocks, so a few pixels of chrome
  // anywhere on the page decide whether it is exactly at the fold.
  await expect(
    page.getByRole("heading", { name: label, exact: true, level: 2 }),
  ).toBeVisible();
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

test("the shelf's status line counts the cards on screen, and the exit is a block", async ({
  page,
}) => {
  await seedProgress(page, funded);
  // Pace shows one level per path: two cards, so the line says two, not ten.
  await page.goto("/shop/pace");
  await expect(page.locator(".shop-count")).toHaveText("2 on this shelf");
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(2);
  // The funded fixture owns the roller but no clock: one card, so one is what
  // the line says.
  await page.goto("/shop/offline");
  await expect(page.locator(".shop-count")).toHaveText("1 on this shelf");
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(1);
  // The invariant, on every shelf: the number in the status line is the
  // number of cards drawn — every shelf shows everything it has.
  for (const path of [
    "/shop/skills",
    "/shop/pace",
    "/shop/offline",
    "/shop/auras/celestial",
    "/shop/tools",
  ]) {
    await page.goto(path);
    const drawn = await page.locator(".shop-card[data-product]").count();
    const [shown] = (await page.locator(".shop-count").innerText()).match(
      /\d+/,
    );
    expect(Number(shown), `${path} status line`).toBe(drawn);
  }
  // Companions are drawn by their own component and counted their own way.
  await page.goto("/shop/companions");
  await expect(page.locator(".shop-count")).toHaveText(/^\d+ \/ 13 found$/);
});

test("a locked shelf reads Locked, and the header's nav rules stay in the header", async ({
  page,
}) => {
  // No Offline Roller: nothing on that shelf can be bought yet.
  await seedProgress(page, { ...funded, owned: [] });
  await page.goto("/shop/offline");
  await expect(page.locator(".shop-locked-heading")).toBeVisible();
  await expect(page.locator(".shop-count")).toHaveText("Locked");
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(0);

  // The header sets nav { display:flex; gap } for its own bar. Those element
  // selectors must never reach the shop's own navigation regions, or a shelf's
  // exit and its breadcrumb inherit the header's layout.
  await page.goto("/shop/skills");
  const layout = await page.evaluate(() => {
    const others = document.querySelector('nav[aria-label="Other shelves"]');
    const label = others.querySelector(".shop-others-label");
    const tile = others.querySelector(".shop-tile");
    const jump = others.querySelector(".shop-jump");
    return {
      display: getComputedStyle(others).display,
      gap: getComputedStyle(jump).gap,
      labelAbove:
        label.getBoundingClientRect().bottom <=
        tile.getBoundingClientRect().top + 1,
      tilesPerRow: [...jump.children].filter(
        (child) =>
          child.getBoundingClientRect().top ===
          tile.getBoundingClientRect().top,
      ).length,
    };
  });
  expect(layout.display).toBe("block");
  expect(layout.gap).toBe("10px");
  expect(layout.labelAbove).toBe(true);
  expect(layout.tilesPerRow).toBeGreaterThan(1);
  // Same story at phone width: the header shrinks its own gaps, never ours.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector(
              'nav[aria-label="Other shelves"] .shop-jump',
            ),
          ).gap,
      ),
    )
    .toBe("10px");
  const source = fs.readFileSync("src/styles.css", "utf8");
  // A standalone `nav` element selector would leak again: every navigation
  // style in the global sheet is scoped to the header's own bar. (`.nav-divider`
  // is a class of its own, not a bare element selector.)
  const leaking = [...source.matchAll(/^\s*([^{}]*)\{/gm)].flatMap((match) =>
    match[1]
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
      .flatMap((selector) => {
        const parts = selector.split(/\s+/);
        return parts
          .map((part, index) =>
            part === "nav" && !parts[index - 1]?.startsWith(".header")
              ? selector
              : "",
          )
          .filter(Boolean);
      }),
  );
  expect(leaking).toEqual([]);
});

test("the goal banner arms pick mode, and only then does a card become the goal", async ({
  page,
}) => {
  await seedProgress(page, { ...funded, balance: 10000, totalEarned: 10000 });
  await page.goto("/shop/pace");
  const banner = page.locator(".shop-goal");
  // Nothing tracked yet, so the banner recommends instead.
  await expect(banner).toContainText("Recommended next");
  const card = page.locator('[data-product="quickwind-1"]');
  // A plain card click is just browsing: the goal does not move.
  await card.locator(".shop-card-desc").click();
  await expect(banner).toContainText("Recommended next");
  await expect(banner).not.toContainText("Your goal");
  // Pick mode is armed from the banner itself.
  await banner.getByRole("button", { name: "Set goal", exact: true }).click();
  await expect(banner).toContainText("Pick your goal");
  await expect(card).toHaveClass(/is-picking/);
  // Now tapping the card — on plain text, not on any of its buttons — tracks
  // it, and the banner shows the savings.
  await card.locator(".shop-card-desc").click();
  await expect(banner).toContainText("Your goal: Quickwind I");
  await expect(card).toHaveAttribute("data-tracked", "true");
  await expect(banner).toContainText("10,000 of 30,000 EP");
  await expect(banner).toContainText("20,000 EP to go");
  // Arming pick mode again and tapping the tracked card untracks it, back to
  // the recommendation.
  await banner
    .getByRole("button", { name: "Change goal", exact: true })
    .click();
  await card.locator(".shop-card-desc").click();
  await expect(banner).toContainText("Recommended next");
  await expect(banner).not.toContainText("Your goal");
  // Cancel leaves pick mode without touching the goal.
  await banner.getByRole("button", { name: "Set goal", exact: true }).click();
  await banner.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(banner).not.toContainText("Pick your goal");
  await expect(banner).not.toContainText("Your goal");
});

test("the skills shelf is a stall: three skills buyable, the rest under a green aura", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.goto("/shop/skills");
  const shelf = page.locator("#shop-skills");
  await expect(shelf.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(shelf).toContainText("rotates every five minutes");
  // The whole catalogue is listed: the stall's rotating pair is on sale, the
  // other skills wait dimmed under the green restock aura.
  const stock = skillStock(skillStockWindow(Date.now()), funded.owned);
  expect(stock).toHaveLength(SKILL_STOCK_SIZE);
  const rest = [
    "surge",
    "trail",
    "bounce",
    "twice",
    "bedrock",
    "turbo",
    "quarry",
    "miser",
    "triptych",
  ].filter((id) => !stock.includes(id));
  for (const id of stock) {
    const card = shelf.locator(`[data-product="${id}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).not.toHaveClass(/is-restocking/);
    await expect(card).toContainText("In stock");
    await expect(card.locator("button:not(.shop-tag)")).toBeEnabled();
  }
  for (const id of rest) {
    const card = shelf.locator(`[data-product="${id}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveClass(/is-restocking/);
    await expect(card.locator("button:not(.shop-tag)")).toBeDisabled();
  }
  // The stall states how full it is and when the three restock — and, since
  // the rotation is deterministic, which skills come next.
  await expect(shelf.locator(".skill-stock")).toContainText(
    `${SKILL_STOCK_SIZE} of ${SKILL_STOCK_SIZE} in stock`,
  );
  await expect(shelf.locator(".skill-stock")).toContainText("next:");
  await expect(page.getByTestId("skill-stock-timer")).toContainText(
    /^\d:\d{2}$/,
  );
  // Flywheel and Skill Bay I are rack hardware, not stock: always listed.
  for (const id of ["flywheel", "skill-bay-1"])
    await expect(shelf.locator(`[data-product="${id}"]`)).toHaveCount(1);
  // Skill Bay II waits behind Skill Bay I, so until Bay I is bought it is not
  // on the shelf at all — no locked card, no wall to save up against.
  await expect(shelf.locator('[data-product="skill-bay-2"]')).toHaveCount(0);
  // Every card on the shelf reads cheapest first: nine shop skills, Flywheel
  // and Skill Bay I.
  const prices = (
    await shelf.locator(".shop-card[data-product] .shop-price").allInnerTexts()
  ).map((text) => Number(text.replace(/[^0-9]/g, "")));
  expect(prices.length).toBe(11);
  expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  // Timing tracks are not on this shelf any more: they moved to Pace, which
  // reads cheapest first as well.
  await expect(shelf.locator('[data-product="quickwind-1"]')).toHaveCount(0);
  await page.goto("/shop/pace");
  const pacePrices = (
    await page
      .locator("#shop-pace .shop-card[data-product] .shop-price")
      .allInnerTexts()
  ).map((text) => Number(text.replace(/[^0-9]/g, "")));
  expect([...pacePrices].sort((a, b) => a - b)).toEqual(pacePrices);
  // Companions keep their own shelf page, owned by the companion component.
  await page.goto("/shop/companions");
  await expect(
    page.locator("#shop-companions [data-pet='pebble']"),
  ).toHaveCount(1);
});

test("equipping a companion uncages it with an animation", async ({ page }) => {
  await seedProgress(page, { ...funded, pets: ["pebble"], activePet: "none" });
  await page.goto("/shop/companions");
  const slide = page.locator("#shop-companions [data-pet='pebble']");
  await slide.getByRole("button", { name: "Equip", exact: true }).click();
  // The door swings and the friend hops out, then walks with you.
  const uncaging = page.locator("#shop-companions .pet-slide.is-uncaging");
  await expect(uncaging).toHaveAttribute("data-pet", "pebble");
  await expect(slide).toContainText("Walking with you");
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
  // One sticky bar holds the way back and the count: no search, no filters,
  // every shelf shows everything it has.
  expect(shop).toContain('className="shop-controls"');
  expect(shop).not.toContain("Search the shop");
  expect(shop).not.toContain("Shop filters");
  expect(shop).not.toContain("matches = (item, state)");
  expect(shop).not.toContain("visibleCount");
  expect(css).toContain(".shop-controls {");
  expect(css).toContain("position: sticky");
  expect(css).not.toContain(".shop-search");
  // The goal is armed from the banner above the shelves — pick mode — and
  // only then does a tapped card become the goal; the banner shows what is
  // tracked and how the wallet is doing against it.
  expect(shop).toContain("Set goal");
  expect(shop).toContain("Change goal");
  expect(shop).toContain("Pick your goal");
  expect(shop).toContain("pickingGoal");
  expect(shop).toContain("is-goalable");
  expect(shop).toContain("shop-goal");
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
    /from "lucide-react"[\s\S]{0,200}\b(Gauge|Mountain|Wind|Layers|Target)\b/,
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

test("the rack's arithmetic is stated once, in the skill bar's panel", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  // The shelf still reads the shared rack report for its own numbers, but the
  // itemised "what it adds up to" panel lives only in the skill bar — the
  // shop used to repeat it on the skills shelf, which was the same text twice.
  expect(shop).toContain("rackReport(progress)");
  expect(shop).not.toContain("rack-report");
  expect(shop).not.toContain("Your rack, added up");
  // …and the confirmation dialog repeats the exact chip, not a paraphrase.
  expect(shop).toContain("skillEffectChips");
  expect(shop).toContain("purchase-effect");
});

test("the auto-roll tool is described as an ability, not as a setting", () => {
  const shop = fs.readFileSync("src/components/Shop.jsx", "utf8");
  expect(shop).toContain("one click arms it, one stands it down");
  expect(shop).toContain("Arm it from the rack.");
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

test("a rack can be saved on the skills shelf and put back in one click", async ({
  page,
}) => {
  // Two skills equipped, one rack saved from an earlier session: every step
  // below is seeded, so nothing depends on what the stall happens to stock.
  await seedProgress(page, {
    ...funded,
    owned: ["surge", "trail", "bounce", "skill-bay-1"],
    skills: ["surge", "trail", "bounce"],
    equippedSkills: ["bounce"],
    loadouts: [
      {
        id: "rack-surge+trail",
        name: "Surge + Trail",
        skills: ["surge", "trail"],
      },
    ],
  });
  await page.goto("/shop/skills");
  const book = page.locator(".skill-racks");
  await expect(book).toBeVisible();
  // The saved rack is listed, and the rack on screen is not among them yet.
  await expect(book.locator(".skill-rack")).toHaveCount(1);
  await expect(book).toContainText("1 of 4 saved");
  await expect(
    book.getByRole("button", { name: "Save this rack" }),
  ).toBeEnabled();

  // Saving the rack on screen adds a second entry, named after itself.
  await book.getByRole("button", { name: "Save this rack" }).click();
  await expect(book.locator(".skill-rack")).toHaveCount(2);
  await expect(book).toContainText("2 of 4 saved");
  await expect(book).toContainText("Bounce");

  // One click puts a whole rack back — and says so once it is equipped.
  await page.locator('.skill-rack-apply:has-text("Surge + Trail")').click();
  await expect(
    book.getByRole("button", { name: "This rack is saved" }),
  ).toBeDisabled();

  // Deleting an entry empties that slot, leaving the other rack alone.
  await page.getByRole("button", { name: "Delete Bounce" }).click();
  await expect(book.locator(".skill-rack")).toHaveCount(1);
  await expect(book).toContainText("Surge + Trail");
});

test("earned skills live on the skills shelf and equip without taking a slot", async ({
  page,
}) => {
  // A ladder reward and an active companion's signature: both ride free, so
  // the two shop skills already fill the rack without blocking them.
  await seedProgress(page, {
    ...funded,
    owned: ["surge", "trail"],
    skills: ["surge", "trail", "reborn-drive"],
    equippedSkills: ["surge", "trail"],
    pets: ["pebble"],
    activePet: "pebble",
    rebirths: 1,
  });
  await page.goto("/shop/skills");
  const shelf = page.locator("#shop-skills");
  const earned = shelf.locator(".free-skills");
  await expect(earned).toBeVisible();
  await expect(earned).toContainText("never take a slot");
  await expect(earned.locator(".free-skills-count")).toHaveText(
    "0 of 2 equipped",
  );
  // Two cards: the ladder's reward and the companion's signature, each one
  // naming where it came from instead of carrying a price.
  const reward = earned.locator('[data-freeskill="reborn-drive"]');
  await expect(reward).toHaveCount(1);
  await expect(reward).toContainText("Rebirth 1 reward");
  await expect(reward.locator(".shop-price")).toHaveCount(0);
  const signature = earned.locator('[data-freeskill="pebble-steady"]');
  await expect(signature).toHaveCount(1);
  await expect(signature).toContainText("signature");
  // The rack is full of shop skills, and the reward equips anyway.
  await expect(shelf.locator(".shop-section-stat")).toHaveText(
    "2 / 2 slots used",
  );
  await reward.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(
    reward.getByRole("button", { name: "Equipped", exact: true }),
  ).toBeVisible();
  await expect(earned.locator(".free-skills-count")).toHaveText(
    "1 of 2 equipped",
  );
  await expect(shelf.locator(".shop-section-stat")).toHaveText(
    "2 / 2 slots used",
  );
  // Equipping is a toggle: the same button unequips again.
  await reward.getByRole("button", { name: "Equipped", exact: true }).click();
  await expect(
    reward.getByRole("button", { name: "Equip", exact: true }),
  ).toBeVisible();
});

test("an aura family is a page of its own, reached from its banner", async ({
  page,
}) => {
  await seedProgress(page, { ...funded, balance: 200000000 });
  await page.goto("/shop/auras");
  // The index is four banners, each one a real link to the set it fronts.
  await expect(page.locator(".aura-family-banner")).toHaveCount(
    AURA_FAMILIES.length,
  );
  for (const family of AURA_FAMILIES) {
    const banner = page.locator(
      `.aura-family-banner[data-family="${family.id}"]`,
    );
    await expect(banner).toContainText(family.label);
    await expect(banner).toHaveAttribute("href", `/shop/auras/${family.id}`);
    // Every banner shows three previews and its own typeface.
    await expect(banner.locator(".number-box")).toHaveCount(3);
    const font = await banner
      .locator(".aura-family-copy strong")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font.toLowerCase()).toContain(
      family.font.includes("Space Mono") ? "space mono" : "georgia",
    );
  }
  // Opening one is a real navigation, and the breadcrumb grows a step.
  await page.locator('.aura-family-banner[data-family="celestial"]').click();
  await expect(page).toHaveURL(/\/shop\/auras\/celestial$/);
  await expect(page.locator('nav[aria-label="Breadcrumb"]')).toContainText(
    "Sky and starlight",
  );
  await expect(page.locator(".shop-card[data-product]")).toHaveCount(
    shopProducts.filter((p) => p.family === "celestial").length,
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/shop\/auras$/);
});

test("nothing on a shelf waits behind a purchase you have not made", async ({
  page,
}) => {
  // Persistence Core needs Auto-Roll; without it, it is not on the shelf.
  await seedProgress(page, { ...funded, owned: [] });
  await page.goto("/shop/tools");
  await expect(page.locator('[data-product="auto-roll"]')).toHaveCount(1);
  await expect(page.locator('[data-product="persistence-core"]')).toHaveCount(
    0,
  );
  // Buying the prerequisite is what puts it on the shelf. seedProgress only
  // fills an empty save, so this second state is written directly over it.
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    {
      key: PROGRESS_KEY,
      data: {
        ...emptyProgress(),
        profile: testProfile,
        balance: 50000000,
        totalEarned: 50000000,
        owned: ["auto-roll"],
      },
    },
  );
  await page.goto("/shop/tools");
  await expect(page.locator('[data-product="persistence-core"]')).toHaveCount(
    1,
  );
  // The rule is the catalogue's, not the page's.
  for (const product of shopProducts)
    if (product.requires) {
      expect(productUnlocked(product, [])).toBe(false);
      expect(productUnlocked(product, [product.requires])).toBe(true);
    } else expect(productUnlocked(product, [])).toBe(true);
});
