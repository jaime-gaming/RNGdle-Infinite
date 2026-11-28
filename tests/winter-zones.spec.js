import { test, expect, pauseClockAt } from "./helpers/clock.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import { RNGMAS_WEEKS } from "../src/rngmas.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { waitForApp } from "./helpers/app.js";
import { readSavedProgress } from "./helpers/save.js";

const AT = Date.UTC(2026, 11, 17, 12);
const state = () => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 3000000,
  totalEarned: 3000000,
});
const chapter = (page, name) =>
  page
    .locator(".winter-chapter")
    .filter({ has: page.locator("summary", { hasText: name }) });

for (const [width, height] of [
  [360, 800],
  [768, 1024],
  [1440, 1000],
]) {
  test(`Christmas mode is under TEMPORAL and decor remains visible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await seedProgress(page, state());
    await pauseClockAt(page, AT);
    await page.goto("/shop/rngmas");
    await waitForApp(page);
    for (const selector of [
      ".rngmas-pine-left",
      ".rngmas-gift-right",
      ".rngmas-bell-right",
      ".rngmas-snowbank-left",
    ])
      await expect(page.locator(selector)).toBeVisible();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const group = page.getByRole("group", { name: "TEMPORAL", exact: true });
    const toggle = group.getByRole("menuitemcheckbox", {
      name: "Christmas mode",
      exact: true,
    });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toHaveText("Christmas mode");
    await expect(group.locator(".appearance-season-note")).toHaveCount(0);
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.locator(".rngmas-decor")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Appearance", exact: true }),
    ).toBeFocused();
    await page.reload();
    await waitForApp(page);
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page.locator(".rngmas-pine-left")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("weekly missions are in Tasks while old market services stay in Shop", async ({
  page,
}) => {
  const saved = state();
  saved.rngmas.snowcoins = saved.rngmas.snowcoinsEarned = 60;
  await seedProgress(page, saved);
  await pauseClockAt(page, AT);
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Weekly chapters", exact: true })
    .click();
  await expect(page.locator(".winter-chapter")).toHaveCount(5);
  const exchange = chapter(page, "Snowcoin exchange");
  await expect(exchange).toHaveAttribute("open", "");
  const market = chapter(page, "Christmas market");
  await market.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(market).toHaveAttribute("open", "");
  await expect(
    market.getByRole("button", { name: /Spark Injector/ }),
  ).toHaveCount(0);
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  await expect(page.locator(".winter-chapter")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Collect Lantern/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Market & exchange", exact: true })
    .click();
  await page.getByRole("button", { name: /Spark Injector ×1/ }).click();
  await expect
    .poll(async () => (await readSavedProgress(page)).rngmas.snowcoins)
    .toBe(50);
  await expect(page.locator(".winter-stamps")).toHaveAttribute(
    "aria-label",
    "1 of 6 stalls visited",
  );
});

test("reduced motion disables new zone and toggle animations without removing scenery", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedProgress(page, state());
  await pauseClockAt(page, AT);
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await expect(page.locator(".rngmas-decor")).toHaveClass(/is-reduced-motion/);
  await page
    .getByRole("button", { name: "Weekly chapters", exact: true })
    .click();
  const content = chapter(page, "Snowcoin exchange").locator(
    ".winter-chapter-content",
  );
  expect(
    await content.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  expect(
    await page
      .locator(".appearance-switch i")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await expect(page.locator(".rngmas-pine-left")).toBeVisible();
});

test("chapter rewards vary, persist once and legacy claims never generate extra bonuses", () => {
  expect(new Set(RNGMAS_WEEKS.map((week) => week.boost)).size).toBe(3);
  for (const week of RNGMAS_WEEKS) {
    const saved = state();
    saved.rngmas.golems[week.id].damage = week.goal;
    saved.rngmas.golems[week.id].count = week.goal;
    saved.rngmas.snowcoinsExchanged = week.metric === "exchanged" ? 100 : 0;
    saved.rngmas.marketPurchases =
      week.metric === "purchases"
        ? ["snow-spark", "snow-surge", "snow-overdrive"]
        : [];
    const claimed = applyProgress(saved, {
      type: "claim-winter-week",
      at: week.start,
    });
    expect(claimed.rngmas.snowcoins).toBe(week.coins);
    expect(claimed.rngmas.snowcoinsEarned).toBe(week.coins);
    expect(claimed.battlePass.boosts.charges[week.boost]).toBe(week.charges);
    expect(claimed.cycleEarnedEP).toBe(0);
    const repaired = parseProgress(JSON.stringify(claimed));
    expect(repaired.rngmas.snowcoins).toBe(week.coins);
    expect(() =>
      applyProgress(repaired, { type: "claim-winter-week", at: week.start }),
    ).toThrow(/already/);
    const legacy = state();
    legacy.rngmas.golems[week.id].defeated = true;
    const restored = parseProgress(JSON.stringify(legacy));
    expect(restored.owned).toContain(week.reward);
    expect(restored.rngmas.snowcoins).toBe(0);
    expect(() =>
      applyProgress(restored, { type: "claim-winter-week", at: week.start }),
    ).toThrow(/already/);
  }
});

test("Christmas mode is visible but disabled after the event", async ({
  page,
}) => {
  await seedProgress(page, state());
  await pauseClockAt(page, Date.UTC(2027, 0, 3));
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "TEMPORAL" })
      .getByRole("menuitemcheckbox", { name: "Christmas mode", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".rngmas-decor")).toHaveCount(0);
});

test("collecting a live chapter updates its passport and cannot pay again after reload", async ({
  page,
}) => {
  const saved = state();
  saved.rngmas.marketPurchases = ["snow-spark", "snow-surge", "snow-overdrive"];
  await seedProgress(page, saved);
  await pauseClockAt(page, Date.UTC(2026, 11, 10, 12));
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Weekly chapters", exact: true })
    .click();
  const market = chapter(page, "Christmas market");
  await expect(market.locator("summary")).toContainText("Reward ready");
  await market
    .getByRole("button", { name: "Collect Emberlight", exact: true })
    .click();
  await expect
    .poll(async () => (await readSavedProgress(page)).rngmas.snowcoins)
    .toBe(15);
  await expect(market.locator("summary")).toContainText("Collected");
  await expect(page.getByLabel("Chapter collection")).toContainText("1 / 5");
  await page.reload();
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Weekly chapters", exact: true })
    .click();
  await expect(
    market.getByRole("button", { name: "In your collection", exact: true }),
  ).toBeDisabled();
  const restored = await readSavedProgress(page);
  expect(restored.rngmas.snowcoins).toBe(15);
  expect(restored.battlePass.boosts.charges["boost-spark"]).toBe(2);
});

test("chapter bonuses respect the wallet cap and reject lifetime integer overflow atomically", () => {
  const saved = state();
  saved.rngmas.golems.hollow.damage = 25000000;
  saved.rngmas.snowcoins = 999999;
  saved.rngmas.snowcoinsEarned = 1000000;
  const claimed = applyProgress(saved, {
    type: "claim-winter-week",
    at: RNGMAS_WEEKS[0].start,
  });
  expect(claimed.rngmas.snowcoins).toBe(1000000);
  expect(claimed.rngmas.snowcoinsEarned).toBe(1000050);
  saved.rngmas.snowcoinsEarned = Number.MAX_SAFE_INTEGER;
  expect(() =>
    applyProgress(saved, {
      type: "claim-winter-week",
      at: RNGMAS_WEEKS[0].start,
    }),
  ).toThrow(/Snowcoin limit/);
  expect(saved.rngmas.golems.hollow.defeated).toBe(false);
  expect(saved.battlePass.boosts.charges).toEqual({});
});

for (const [label, at, active] of [
  ["before", Date.UTC(2026, 10, 30, 23, 59, 59), false],
  ["opening", Date.UTC(2026, 11, 1), true],
  ["closing", Date.UTC(2027, 0, 2), false],
])
  test(`Christmas switch is season-gated at ${label}`, async ({ page }) => {
    await seedProgress(page, state());
    await pauseClockAt(page, at);
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    const toggle = page.getByRole("menuitemcheckbox", {
      name: "Christmas mode",
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-checked", String(active));
    if (active) await expect(toggle).toBeEnabled();
    else await expect(toggle).toBeDisabled();
    await expect(page.locator(".rngmas-decor")).toHaveCount(active ? 1 : 0);
  });

test("Christmas decorations expire without reloading at the exact UTC boundary", async ({
  page,
}) => {
  await seedProgress(page, state());
  await pauseClockAt(page, Date.UTC(2027, 0, 1, 23, 59, 59));
  await page.goto("/");
  await waitForApp(page);
  await expect(page.locator(".rngmas-decor")).toHaveCount(1);
  await page.clock.runFor(1001);
  await expect(page.locator(".rngmas-decor")).toHaveCount(0);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const toggle = page.getByRole("menuitemcheckbox", {
    name: "Christmas mode",
    exact: true,
  });
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

for (const theme of ["Light", "Dark"])
  test(`event surfaces are opaque in ${theme} theme`, async ({ page }) => {
    await seedProgress(page, state());
    await pauseClockAt(page, AT);
    await page.goto("/tasks?event=rngmas");
    await waitForApp(page);
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: `${theme} theme`, exact: true })
      .click();
    const surfaces = await page
      .locator(
        '.winter-tasks,.festival-board,.festival-summary,.festival-card,.festival-tabs button[aria-pressed="true"]',
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          color: getComputedStyle(node).backgroundColor,
          opacity: getComputedStyle(node).opacity,
        })),
      );
    expect(surfaces.length).toBeGreaterThan(4);
    for (const surface of surfaces) {
      expect(surface.opacity).toBe("1");
      expect(surface.color).toMatch(/^(rgb|oklch|oklab)\(/);
      expect(surface.color).not.toContain("/");
    }
  });
