import { expect } from "@playwright/test";

// The blank loading screen owns the whole page until the scoring tables and
// the account resolve. A spec that reads the DOM immediately after navigating
// waits for the real page here instead of inspecting the circle.
export async function waitForApp(page) {
  await expect(page.locator(".loading-screen")).toHaveCount(0);
  await expect(page.locator(".header")).toBeVisible();
}
