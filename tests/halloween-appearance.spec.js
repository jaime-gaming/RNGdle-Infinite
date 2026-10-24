import { test, expect } from "./helpers/clock.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { withAllFragments } from "./helpers/world-roll.js";
import { chooseTheme } from "./helpers/appearance.js";
import { seedProgress } from "./helpers/progress.js";
import {
  SETTINGS_KEY,
  defaultSettings,
  parseSettings,
} from "../src/settings.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { emptyRngween } from "../src/rngween.js";
import { emptyTasks } from "../src/tasks.js";
import { mockRandom } from "./helpers/random-roll.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("rng-theme") === null)
      localStorage.setItem("rng-theme", "dark");
  });
});

const active = Date.parse("2026-10-26T12:00:00Z");
const finished = {
  ...emptyTasks(),
  rngween: {
    ...emptyRngween(),
    counts: { rolls: 300, rare: 60, banked: 8000000, taskClaims: 21 },
  },
};
const ids = ["jack-o-glow", "phantom-veil", "witchfire", "blood-moon"];
const saved = (page) =>
  page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
// A save that has stopped changing: the event writes a "seen" receipt just
// after the page loads, and comparing against that half-written state would
// blame the look switch for someone else's write.
async function settledSave(page) {
  let last = await saved(page);
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(100);
    const next = await saved(page);
    if (next === last) return next;
    last = next;
  }
  return last;
}

async function toggleLook(page) {
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Halloween mode", exact: true })
    .click();
  await page.keyboard.press("Escape");
}

test("Halloween appearance is a validated, saved preference, never a calendar override", () => {
  expect(defaultSettings.halloweenMode).toBe(true);
  expect(
    parseSettings(JSON.stringify({ halloweenMode: false })).halloweenMode,
  ).toBe(false);
  for (const halloweenMode of ["false", 0, null, {}])
    expect(parseSettings(JSON.stringify({ halloweenMode })).halloweenMode).toBe(
      true,
    );
});

test("one appearance button exposes all themes on desktop and phone", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await page.goto("/");
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".header .appearance-trigger")).toHaveCount(1);
    await expect(page.locator(".theme-switch")).toHaveCount(0);
    for (const theme of ["dark", "system", "light"]) {
      await chooseTheme(page, theme);
      expect(await page.evaluate(() => localStorage.getItem("rng-theme"))).toBe(
        theme,
      );
    }
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(3);
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Halloween mode" }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const menu = await page
      .getByRole("menu", { name: "Appearance" })
      .boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
  }
});

test("the appearance menu supports arrows, Escape, outside clicks and system changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await chooseTheme(page, "light");
  const button = page.getByRole("button", { name: "Appearance", exact: true });
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "Light theme" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "System theme" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await button.click();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await button.click();
  await page.locator(".question-number").click();
  await expect(page.getByRole("menu", { name: "Appearance" })).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("rng-theme"))).toBe(
    "system",
  );
});

test("turning Halloween off preserves tasks, rewards and ownership; it persists through reload", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(
    page,
    withAllFragments({
      tasks: finished,
      balance: 1000,
      totalEarned: 1000,
    }),
  );
  await page.goto("/tasks/rngween");
  await expect(page.locator(".rngween-decor")).toBeVisible();
  const before = await settledSave(page);
  await toggleLook(page);
  await expect(page.locator(".rngween-decor, .rngween-curios")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-season",
    "rngween",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  await expect(page.locator(".rngween-event")).toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.reload();
  await expect(page.locator(".rngween-event")).toBeVisible();
  await expect(page.locator(".rngween-decor")).toHaveCount(0);
  const claim = page.getByRole("button", {
    name: "Collect Jack-o'-Glow",
    exact: true,
  });
  await expect(claim).toBeEnabled();
  await claim.click();
  await expect(
    page.locator('[data-event-mission="jack-o-glow"]'),
  ).toHaveAttribute("data-state", "collected");
  const progress = JSON.parse(await saved(page));
  expect(progress.balance).toBe(1000);
  expect(progress.owned).toEqual(["jack-o-glow"]);
  await toggleLook(page);
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  expect(JSON.parse(await saved(page))).toEqual(progress);
});

test("the look switch cannot open an expired event or enable out-of-window decorations", async ({
  page,
}) => {
  await mockSeasonClock(page, Date.parse("2026-11-04T12:00:00Z"));
  await page.clock.setFixedTime(new Date(active));
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  // Once the event has ended the option is gone, not merely disabled.
  await expect(page.getByRole("menuitemradio")).toHaveCount(3);
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Halloween mode" }),
  ).toHaveCount(0);
  await expect(page.locator(".rngween-event, .rngween-decor")).toHaveCount(0);
});

test("another tab's Halloween preference is adopted without touching the save", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await page.goto("/");
  await expect(page.locator(".rngween-decor")).toBeVisible();
  const before = await saved(page);
  await page.evaluate((key) => {
    const value = JSON.stringify({ halloweenMode: false });
    localStorage.setItem(key, value);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: value,
        storageArea: localStorage,
      }),
    );
  }, SETTINGS_KEY);
  await expect(page.locator(".rngween-decor")).toHaveCount(0);
  expect(await saved(page)).toBe(before);
});

test("lantern, moon and boo secrets are discoverable but never change the save or RNG", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page);
  await mockRandom(page, [861456]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  const before = await saved(page);
  await page.getByRole("button", { name: "Pumpkin lantern" }).click();
  await expect(page.locator('[data-secret="lantern"]')).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Knock on the moon" }).click();
  await expect(page.locator('[data-secret="bats"]')).toBeVisible();
  await page.keyboard.type("boo");
  await expect(page.locator('[data-secret="spirits"]')).toBeVisible();
  expect(await saved(page)).toBe(before);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await page.clock.runFor(46000);
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    "Number 861456",
  );
  await page.goto("/badges");
  await page.clock.runFor(6000);
  await expect(page.locator(".rngween-secret-reveal")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search badges" }).fill("boo");
  await expect(page.locator(".rngween-secret-reveal")).toHaveCount(0);
});

test("owned exclusive art is richer, survives Halloween off, and keeps readable rarity colours", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page, {
    owned: ids,
    tasks: { ...finished, rngween: { ...finished.rngween, earned: ids } },
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/shop/auras/rngween");
  for (const id of ids) {
    const box = page.locator(`[data-product="${id}"] .number-box`);
    await expect(box.locator(".rngween-aura .aura-crest svg")).toHaveCount(1);
    await expect(box.locator(".aura-guardian svg")).toHaveCount(2);
    await expect(box.locator(".aura-motes i")).toHaveCount(8);
    await expect(box.locator(".aura-seal")).toHaveCSS("animation-name", "none");
    await expect(box).toHaveAttribute("data-tier", "rare");
    await expect(box.locator(".number-box-content")).toHaveText("??????");
  }
  await toggleLook(page);
  await expect(page.locator(".shop-card .rngween-aura")).toHaveCount(4);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
