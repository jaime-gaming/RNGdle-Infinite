import { expect, test } from "./helpers/clock.js";
import { GAME_URL, gameUrlForLocation } from "../src/site-links.js";

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
