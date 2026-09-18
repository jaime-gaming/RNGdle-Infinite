import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { showRoll } from "./helpers/random-roll.js";
import { evaluate } from "./helpers/index.js";
import { allBadgeMetadata as metadata } from "../src/infinite-badges.js";

const progress = (page) =>
  page.getByRole("progressbar", { name: "Badge collection progress" });

test("new logo loads, links home, and navigation follows Shop–Badges–History in keyboard order", async ({
  page,
}) => {
  await page.goto("/#history");
  const logo = page.getByRole("button", { name: "RNGdle Infinite home" });
  await expect(logo.locator(".brand-edition")).toHaveText("INFINITE");
  await expect(logo.locator("img,svg")).toHaveCount(0);
  await expect(logo.locator(".brand-title")).toHaveText("RNGdle");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  expect(
    await nav
      .getByRole("button")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label"))),
  ).toEqual(["Shop", "Badges", "History"]);
  await logo.focus();
  for (const name of ["Shop", "Badges", "History"]) {
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("button", { name, exact: true })).toBeFocused();
  }
  for (const name of ["Shop", "Badges", "History"]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${name.toLowerCase()}$`));
    await expect(
      nav.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
  await logo.click();
  await expect(page.locator(".idle-roll")).toBeVisible();
});

test("empty badge collection has an accessible zero progress bar without revealing undiscovered badges", async ({
  page,
}) => {
  await page.goto("/#badges");
  await expect(progress(page)).toHaveAttribute("value", "0");
  await expect(progress(page)).toHaveAttribute("max", String(metadata.length));
  await expect(progress(page)).toHaveAttribute(
    "aria-valuetext",
    `0 of ${metadata.length} badges discovered`,
  );
  await expect(page.locator(".collection-progress-label")).toHaveText(
    "0.0% complete",
  );
  await expect(page.locator(".badge-card")).toHaveCount(0);
});

test("collection progress updates after earning badges, ignores search filters and survives reload", async ({
  page,
}) => {
  await seedProgress(page);
  await showRoll(page, 1337);
  const count = evaluate(1337).badges.length;
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Badges", exact: true })
    .click();
  await expect(progress(page)).toHaveAttribute("value", String(count));
  await expect(page.locator(".collection-progress-label")).toHaveText(
    `${((100 * count) / metadata.length).toFixed(1)}% complete`,
  );
  await page
    .getByRole("textbox", { name: "Search badges" })
    .fill("no such badge");
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await expect(progress(page)).toHaveAttribute("value", String(count));
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(progress(page)).toHaveAttribute("value", String(count));
  await expect(page.locator(".badge-card")).toHaveCount(count);
});

test("completed collection fills the bar and badge details have no reference buttons", async ({
  page,
}) => {
  await seedProgress(page, { discovered: metadata.map((b) => b.id) });
  await page.goto("/#badges");
  await expect(progress(page)).toHaveAttribute(
    "value",
    String(metadata.length),
  );
  await expect(page.locator(".collection-progress-label")).toHaveText(
    "Collection complete",
  );
  await page.locator(".badge-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link")).toHaveCount(0);
  await expect(
    page.getByText("View badge reference", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Collection status");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("branding, ordered navigation and collection progress fit mobile and both themes", async ({
  page,
}) => {
  await seedProgress(page, {
    discovered: metadata.slice(0, 60).map((b) => b.id),
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#badges");
  for (const width of [1200, 768, 390, 360, 340]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page
        .getByRole("button", { name: `${theme} theme`, exact: true })
        .click();
      await expect(progress(page)).toBeVisible();
      await expect(page.locator(".brand-name")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      const header = await page.locator(".header").boundingBox();
      const button = await page
        .getByRole("button", { name: "Your profile", exact: true })
        .boundingBox();
      expect(button.x + button.width).toBeLessThanOrEqual(header.width);
    }
  }
});
