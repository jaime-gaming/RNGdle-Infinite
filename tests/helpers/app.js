import { expect } from "@playwright/test";

export async function waitForApp(page) {
  await expect(page.locator(".loading-screen")).toHaveCount(0);
  await expect(page.locator(".header")).toBeVisible();
}
