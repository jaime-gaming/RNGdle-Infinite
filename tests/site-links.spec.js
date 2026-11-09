import { expect, test } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { GAME_URL, gameUrlForLocation } from "../src/site-links.js";

test("the footer changelog button starts with a capital", async ({ page }) => {
  await page.goto("/");
  await waitForApp(page);
  await expect(
    page
      .locator("footer")
      .getByRole("button", { name: "Changelog", exact: true }),
  ).toBeVisible();
});

test("share links use the custom production domain and a safe fallback", () => {
  expect(GAME_URL).toBe("https://rngdle-infinite.jaime-gaming.com");
  expect(
    gameUrlForLocation({
      hostname: "rngdle-infinite.jaime-gaming.com",
      origin: "https://rngdle-infinite.jaime-gaming.com",
    }),
  ).toBe(GAME_URL);
  expect(
    gameUrlForLocation({
      hostname: "localhost",
      origin: "http://localhost:5173",
    }),
  ).toBe(GAME_URL);
  expect(
    gameUrlForLocation({
      hostname: "old-host.example",
      origin: "https://old-host.example",
    }),
  ).toBe(GAME_URL);
});
