import { test, expect } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
const css = (locator) =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      border: s.borderTopColor,
      background: s.backgroundImage,
      ink: s.color,
      radius: s.borderRadius,
    };
  });
const rgb = (hex) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test("shared number boxes cover the idle generator and cosmetic previews without demo rolls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".question-number.number-box")).toHaveText(
    "??????",
  );
  await expect(page.locator(".best-number, .profile-number")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shop", exact: true })
    .click();
  const auraCount = shopProducts.filter((p) => p.kind === "aura").length;
  await expect(page.locator(".aura-preview .number-box")).toHaveCount(
    auraCount,
  );
  for (const id of ["starfall", "aurora", "orbit"]) {
    const box = page.locator(`[data-product="${id}"] .number-box`);
    await expect(box).toHaveAttribute("data-cosmetic", id);
    await expect(box).toHaveAttribute("data-tier", "rare");
    await expect(box.locator(".box-particles i")).toHaveCount(6);
    await expect(box.locator(".box-gloss")).toHaveCount(1);
  }
});

test("every roll tier uses the observed light/dark Box Lab palettes and shimmer gates", async ({
  page,
}) => {
  const numbers = [103463, 103381, 103006, 103002, 103001, 103000, 109];
  const palette = {
    trash: ["#ffd230", "#973c00", "#973c00", "#ffd230"],
    common: ["#99a1af", "#52525c", "#364153", "#d1d5dc"],
    uncommon: ["#5ee9b5", "#006045", "#006045", "#00d492"],
    rare: ["#8ec5ff", "#193cb8", "#193cb8", "#51a2ff"],
    epic: ["#dab2ff", "#6e11b0", "#6e11b0", "#c27aff"],
    anomaly: ["#ffb86a", "#9f2d00", "#9f2d00", "#ff8904"],
    mythic: ["#fda5d5", "#a3004c", "#101828", "#f3f4f6"],
  };
  await mockRandom(page, numbers);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  const seen = new Set();
  for (const [i, number] of numbers.entries()) {
    await page
      .getByRole("button", { name: i ? "ROLL AGAIN" : "GENERATE", exact: true })
      .click();
    const tier = evaluate(number).tier;
    seen.add(tier);
    const box = page.locator(".number-artifact.number-box");
    await expect(box).toHaveAttribute("aria-label", `Number ${number}`);
    await expect(box).toHaveAttribute("data-tier", tier);
    await expect(box.locator(".box-shimmer")).toHaveCount(
      ["trash", "common"].includes(tier) ? 0 : 1,
    );
    for (const [j, theme] of ["light", "dark"].entries()) {
      await page
        .getByRole("button", { name: `${theme} theme`, exact: true })
        .click();
      const s = await css(box);
      expect(s.border).toBe(rgb(palette[tier][j]));
      expect(s.ink).toBe(rgb(palette[tier][j + 2]));
      expect(s.radius).toBe("12px");
      expect(s.background).toContain("linear-gradient");
    }
    await expect(page.locator(".roll-experience")).toHaveAttribute(
      "data-settled",
      "true",
    );
    await page.clock.fastForward(105100);
  }
  expect(seen.size).toBe(7);
});

test("legacy purchases survive repricing; upgraded cosmetics match previews, respect reduced motion and fit mobile", async ({
  page,
}) => {
  const values = {
    balance: 1000,
    totalEarned: 10000000,
    owned: ["starfall", "aurora", "orbit", "quickwind-1", "clockwork-1"],
    equipped: "starfall",
  };
  await seedProgress(page, values);
  await mockRandom(page, [1000000]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#shop");
  await expect(page.getByTestId("roll-duration")).toHaveText("35s");
  await expect(page.getByTestId("cooldown-duration")).toHaveText("0:45");
  for (const [i, id] of ["starfall", "aurora", "orbit"].entries()) {
    if (i) await page.locator(`[data-product="${id}"] button`).click();
    await expect(page.locator(`[data-product="${id}"] button`)).toContainText(
      "Equipped",
    );
    await page.reload();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      PROGRESS_KEY,
    );
    expect(saved.owned).toEqual(values.owned);
    expect(saved.balance).toBe(1000);
    expect(saved.equipped).toBe(id);
    await page.getByRole("button", { name: "Back to rolling" }).click();
    await expect(page.locator(".question-number")).toHaveAttribute(
      "data-cosmetic",
      id,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(360);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Shop", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  const box = page.locator(".number-artifact");
  await expect(box).toHaveAttribute("aria-label", "Number 1000000");
  await expect(box).toHaveAttribute("data-cosmetic", "orbit");
  expect(
    await box
      .locator("*")
      .evaluateAll(
        (els) =>
          els
            .flatMap((el) => el.getAnimations())
            .filter((a) => a.playState === "running").length,
      ),
  ).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
});

test("rebalanced catalogue preserves product IDs, premium progression and monotonic upgrade chains", () => {
  const prices = {
    "quickwind-1": 30000,
    "quickwind-2": 110000,
    "quickwind-3": 380000,
    "quickwind-4": 1200000,
    "clockwork-1": 50000,
    "clockwork-2": 180000,
    "clockwork-3": 620000,
    "clockwork-4": 1700000,
    "clockwork-5": 3800000,
    "clockwork-6": 9000000,
    flywheel: 450000,
    "flywheel-2": 1500000,
    "flywheel-3": 3600000,
    starfall: 40000,
    aurora: 200000,
    orbit: 900000,
    frostglass: 320000,
    emberwake: 600000,
    eclipse: 1500000,
    prism: 2300000,
    tidepool: 100000,
    verdant: 450000,
    circuit: 1200000,
    obsidian: 1900000,
    singularity: 3500000,
    "archive-lens": 120000,
    "auto-roll": 1600000,
    "persistence-core": 4800000,
    "offline-roller": 2600000,
    "offline-clock-1": 3600000,
    "offline-clock-2": 5400000,
    "offline-clock-3": 8500000,
    "offline-vault-1": 6000000,
    "offline-vault-2": 11000000,
    // v0.3 skills and the two rack upgrades.
    surge: 180000,
    trail: 320000,
    bounce: 500000,
    twice: 900000,
    bedrock: 1600000,
    turbo: 2600000,
    quarry: 6000000,
    "skill-bay-1": 1000000,
    "skill-bay-2": 4000000,
    // The second wave of auras.
    nebula: 520000,
    solstice: 780000,
    lumen: 1050000,
    glitch: 1650000,
    monolith: 2700000,
    chrono: 4200000,
  };
  expect(Object.fromEntries(shopProducts.map((p) => [p.id, p.price]))).toEqual(
    prices,
  );
  expect(new Set(shopProducts.map((p) => p.id)).size).toBe(49);
  // A skill product carries its effect in skills.js, never inside the product:
  // the shop only mirrors the catalogue so both read the same numbers.
  for (const product of shopProducts.filter((p) => p.kind === "skill")) {
    expect(typeof product.skillId).toBe("string");
    expect(product.value).toBeUndefined();
    expect(product.floor).toBeUndefined();
  }
  // Every aura is cosmetic: none may carry a timing, charge or cap payload.
  for (const aura of shopProducts.filter((p) => p.kind === "aura")) {
    expect(aura.value).toBeUndefined();
    expect(aura.charges).toBeUndefined();
    expect(aura.requires).toBeUndefined();
  }
  for (const product of shopProducts) {
    expect(Number.isSafeInteger(product.price)).toBe(true);
    expect(product.price).toBeGreaterThan(0);
    if (product.requires)
      expect(product.price).toBeGreaterThan(prices[product.requires]);
  }
  // No step inside a chain may cost more than four times its predecessor: late
  // tiers must stay reachable rather than becoming a wall.
  for (const product of shopProducts)
    if (product.requires)
      expect(product.price / prices[product.requires]).toBeLessThanOrEqual(4);
  // The whole catalogue stays within a sane multiple of the cheapest upgrade.
  const total = shopProducts.reduce((sum, p) => sum + p.price, 0);
  expect(total).toBeLessThanOrEqual(115000000);
});
