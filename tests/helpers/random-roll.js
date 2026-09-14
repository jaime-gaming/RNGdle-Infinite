import { expect } from "@playwright/test";

// Test-only interception of the worker module; no seed/number input exists in
// production. The real loader, gzip integrity checks, scoring, and UI still run.
export async function mockRandom(page, words) {
  await page.route("**/src/roll.worker.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `const testWords=${JSON.stringify(words)}; let testWord=0;
      Object.defineProperty(crypto,'getRandomValues',{value(array){array[0]=testWords[testWord++ % testWords.length];return array;}});\n${await response.text()}`,
    });
  });
}
export async function showRoll(page, number) {
  await mockRandom(page, [number]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    /digits|badges|complete/,
  );
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
}

// Start a fresh generated roll under a virtual clock, not a production replay.
export async function startRoll(page, number) {
  await mockRandom(page, [number]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
}
