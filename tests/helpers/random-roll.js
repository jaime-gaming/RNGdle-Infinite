import { expect } from "@playwright/test";

export async function mockRandom(page, words) {
  await page.route("**/roll.worker*.js*", async (route) => {
    try {
      const response = await page.request.get(route.request().url());
      const body = `const testWords=${JSON.stringify(words)}; let testWord=0;
      Object.defineProperty(crypto,'getRandomValues',{value(array){array[0]=testWords[testWord++ % testWords.length];return array;}});\n${await response.text()}`;
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body,
      });
    } catch {
      await route.continue().catch(() => {});
    }
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
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
}

export async function startRoll(page, number) {
  await mockRandom(page, [number]);
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled({ timeout: 45000 });
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
}
