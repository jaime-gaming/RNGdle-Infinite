import { expect, test } from "./helpers/clock.js";
import { GAME_URL, gameUrlForLocation } from "../src/site-links.js";

test("share links follow the active production host and keep a safe fallback", () => {
  expect(
    gameUrlForLocation({
      hostname: "jaime-gaming.github.io",
      origin: "https://jaime-gaming.github.io",
    }),
  ).toBe(GAME_URL);
  expect(
    gameUrlForLocation({
      hostname: "rngdle-infinite.jaime-gaming.com",
      origin: "https://rngdle-infinite.jaime-gaming.com",
    }),
  ).toBe("https://rngdle-infinite.jaime-gaming.com");
  expect(
    gameUrlForLocation({
      hostname: "localhost",
      origin: "http://localhost:5173",
    }),
  ).toBe(GAME_URL);
});
