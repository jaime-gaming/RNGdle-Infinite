import { test, expect } from "@playwright/test";
import { shouldShowLoadingScreen } from "../src/loading-gate.js";

const ready = {
  gameDataReady: true,
  cloudStatus: "synced",
  cloudReady: true,
  hasAccount: false,
};

test("the blank loader covers data, account and unsynced-profile waits only", () => {
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
  // A conflict, a failed load, offline and maintenance all need the normal
  // interface so the player can choose or retry.
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

test("while the scoring data loads the page is one circle and nothing else", async ({
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
  await expect(page.locator(".header")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.locator(".header")).toBeVisible();
  await expect(screen).toHaveCount(0);
});
