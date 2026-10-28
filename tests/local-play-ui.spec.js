import { expect, test } from "./helpers/clock.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { showRoll } from "./helpers/random-roll.js";

test("a guest can choose local play and keep that choice after reload", async ({
  page,
}) => {
  await page.goto("/profile");
  const continueLocally = page.getByRole("button", {
    name: "Continue locally",
  });
  await expect(continueLocally).toBeVisible();
  await continueLocally.click();
  await expect(page.locator(".sign-in")).toContainText("Guest");
  await page.reload();
  await expect(page.locator(".sign-in")).toContainText("Guest");
});

test("a local guest can name their profile and keep the current progress", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Continue locally" }).click();
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await showRoll(page, 604827);

  await page.locator(".sign-in").click();
  await page.getByLabel("Username", { exact: true }).fill("LocalPlayer");
  await page.getByRole("button", { name: "Start saving my progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile, LocalPlayer" }),
  ).toBeVisible();

  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.balance).toBeGreaterThan(0);
  expect(saved.history).toHaveLength(1);
});

test("Privacy & Rights and Terms open directly and stay out of the footer", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(
    page.getByRole("link", { name: "Privacy & Rights" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Terms of Service" }),
  ).toBeVisible();

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy & Rights" }),
  ).toBeVisible();
  await expect(
    page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
  ).toHaveCount(0);

  await page.goto("/tos");
  await expect(
    page.getByRole("heading", { name: "Terms of Service" }),
  ).toBeVisible();
  await expect(
    page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
  ).toHaveCount(0);
});
