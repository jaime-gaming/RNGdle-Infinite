import { test, expect } from "@playwright/test";
import { shouldShowLoadingScreen } from "../src/loading-gate.js";

const ready = {
  gameDataReady: true,
  cloudStatus: "synced",
  cloudReady: true,
  hasAccount: false,
};

test("the loader covers data, account and unsynced-profile waits only", () => {
  expect(shouldShowLoadingScreen(ready)).toBe(false);
  expect(shouldShowLoadingScreen({ ...ready, gameDataReady: false })).toBe(
    true,
  );
  expect(
    shouldShowLoadingScreen({
      ...ready,
      cloudStatus: "checking-auth",
      cloudReady: false,
    }),
  ).toBe(true);
  expect(
    shouldShowLoadingScreen({
      ...ready,
      cloudStatus: "loading",
      cloudReady: false,
    }),
  ).toBe(true);
  expect(
    shouldShowLoadingScreen({
      ...ready,
      hasAccount: true,
      cloudStatus: "saving",
      cloudReady: false,
    }),
  ).toBe(true);

  for (const cloudStatus of ["needs-choice", "error", "offline", "maintenance"])
    expect(
      shouldShowLoadingScreen({
        ...ready,
        hasAccount: true,
        cloudStatus,
        cloudReady: false,
      }),
    ).toBe(false);
});

test("while the scoring data loads the chrome stays and one circle fills the content", async ({
  page,
}) => {
  await page.route("**/data/*.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.goto("/");
  const screen = page.locator(".loading-screen");
  await expect(screen).toBeVisible();
  await expect(page.locator(".loading-circle")).toHaveCount(1);
  expect(await screen.textContent()).toBe("");
  await expect(page.locator(".header")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toHaveCount(0);
  await expect(screen).toHaveCount(0);
});

test("a slow load eventually shows wait for it...", async ({ page }) => {
  await page.route("**/data/*.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 7000));
    await route.continue();
  });
  await page.goto("/");
  const screen = page.locator(".loading-screen");
  await expect(screen).toBeVisible();
  await expect(screen.getByText("wait for it...")).toBeVisible({
    timeout: 8000,
  });
});
