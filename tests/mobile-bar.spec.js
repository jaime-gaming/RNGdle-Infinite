import { test, expect } from "@playwright/test";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const badgeIds = allBadgeMetadata.map((b) => b.id);
// Forty badges is past the point where the Rebirth ladder shows up.
const seeded = { profile: testProfile, discovered: badgeIds.slice(0, 40) };

test.use({ viewport: { width: 390, height: 844 } });

const bar = (page) =>
  page.getByRole("navigation", { name: "Mobile navigation" });

test("the phone bar holds five buttons: Tasks and More on the left, Roll in the centre, Badges and Shop on the right", async ({
  page,
}) => {
  await seedProgress(page, seeded);
  await page.goto("/");
  const buttons = bar(page).locator("button");
  await expect(buttons).toHaveCount(5);
  expect(
    await buttons.evaluateAll((nodes) =>
      nodes.map((n) => n.textContent.trim()),
    ),
  ).toEqual(["Tasks", "More", "Roll", "Badges", "Shop"]);
  const centres = await buttons.evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return r.x + r.width / 2;
    }),
  );
  // Roll sits on the middle of the screen, and the rest runs left to right.
  expect(Math.abs(centres[2] - 390 / 2)).toBeLessThan(2);
  expect([...centres].sort((a, b) => a - b)).toEqual(centres);
});

test("More opens the rest of the destinations; Escape, a tap outside, or a choice closes it", async ({
  page,
}) => {
  await seedProgress(page, seeded);
  await page.goto("/");
  const more = bar(page).getByRole("button", { name: "More", exact: true });
  const menu = page.getByRole("menu", { name: "More destinations" });
  await more.click();
  await expect(menu.getByRole("menuitem")).toHaveText([
    "History",
    "Rebirth",
    "Settings",
  ]);
  // Escape closes the menu and hands focus back to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  // A tap outside the bar closes it too.
  await more.click();
  await expect(menu).toBeVisible();
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await expect(menu).toHaveCount(0);
  // Choosing a destination goes there and closes the menu, and More reads as
  // the current place while one of its items is open.
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
  await bar(page).getByRole("button", { name: "More", exact: true }).click();
  await expect(
    page.getByRole("menu", { name: "More destinations" }).getByRole("menuitem"),
  ).toHaveText(["History", "Settings"]);
});
