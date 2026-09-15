import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { allBadgeMetadata as metadata } from "../src/infinite-badges.js";

test("home, random roll, cooldown, and badge breakdown", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "One roll per day? Not here. Roll as often as you like.",
    }),
  ).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await expect(page.locator(".badge-summary")).toContainText("badges earned");
  await expect(
    page.locator(".history-card, .result-secondary-actions"),
  ).toHaveCount(0);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await page.clock.fastForward(105100);
  await expect(page.getByRole("button", { name: "ROLL AGAIN" })).toBeEnabled({
    timeout: 8000,
  });
  expect(errors).toEqual([]);
});

test("badge catalogue filters and details", async ({ page }) => {
  await seedProgress(page, { discovered: metadata.map((b) => b.id) });
  await page.goto("/#badges");
  await page.getByRole("textbox", { name: "Search badges" }).fill("Exact Leet");
  await expect(page.locator(".badge-card")).toHaveCount(1);
  await page.locator(".badge-card").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Exact Leet" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Mythic", exact: true }).click();
  const rarities = await page
    .locator(".badge-card .rarity-label")
    .allTextContents();
  expect(rarities.length).toBeGreaterThan(20);
  expect(rarities.every((r) => r === "Mythic")).toBe(true);
  await page
    .getByRole("textbox", { name: "Search badges" })
    .fill("no such badge 12345");
  await expect(
    page.getByRole("heading", { name: "No badges found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  expect(await page.locator(".badge-card").count()).toBeGreaterThan(200);
});

test("navigation, themes, help and local signup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "How to play", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("LuckyPlayer");
  await page.getByRole("button", { name: "Create local profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile, LuckyPlayer" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("not an online account");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation").getByRole("button", { name: "Leaderboard" }),
  ).toHaveCount(0);
  await page.goto("/#leaderboard");
  await expect(page.locator(".roll-view")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Global leaderboard" }),
  ).toHaveCount(0);
});

test("desktop and mobile layouts do not overflow", async ({ page }) => {
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const hash of ["", "#badges", "#shop", "#history", "#leaderboard"]) {
      await page.goto("/" + hash);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
});
