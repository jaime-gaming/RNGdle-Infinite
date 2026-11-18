import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const badgeIds = allBadgeMetadata.map((b) => b.id);

const seeded = { profile: testProfile, discovered: badgeIds.slice(0, 40) };

test.use({ viewport: { width: 390, height: 844 } });

const bar = (page) =>
  page.getByRole("navigation", { name: "Mobile navigation" });

test("the phone bar orders Shop, Tasks, Roll, Badges and More from left to right", async ({
  page,
}) => {
  await seedProgress(page, seeded);
  await page.goto("/");
  await waitForApp(page);
  const buttons = bar(page).locator("button");
  await expect(buttons).toHaveCount(5);
  expect(
    await buttons.evaluateAll((nodes) =>
      nodes.map((n) => n.textContent.trim()),
    ),
  ).toEqual(["Shop", "Tasks", "Roll", "Badges", "More"]);
  const centres = await buttons.evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return r.x + r.width / 2;
    }),
  );

  expect(Math.abs(centres[2] - 390 / 2)).toBeLessThan(2);
  expect([...centres].sort((a, b) => a - b)).toEqual(centres);
});

test("More opens the rest of the destinations; Escape, a tap outside, or a choice closes it", async ({
  page,
}) => {
  await seedProgress(page, seeded);
  await page.goto("/");
  await waitForApp(page);
  const more = bar(page).getByRole("button", { name: "More", exact: true });
  const menu = page.getByRole("menu", { name: "More destinations" });
  await more.click();
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Pass",
    "History",
    "Rebirth",
    "Settings",
  ]);
  const menuBox = await menu.boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await expect(menu).toBeVisible();
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await expect(menu).toHaveCount(0);

  await more.click();
  await menu.getByRole("menuitem", { name: "History" }).click();
  await expect(menu).toHaveCount(0);
  await expect(more).toHaveClass(/active/);
});

test("Rebirth joins the More menu only once the ladder is in view", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    discovered: badgeIds.slice(0, 10),
  });
  await page.goto("/");
  await waitForApp(page);
  await bar(page).getByRole("button", { name: "More", exact: true }).click();
  await expect(
    page.getByRole("menu", { name: "More destinations" }).getByRole("menuitem"),
  ).toHaveText(["Pass", "History", "Settings"]);
});
