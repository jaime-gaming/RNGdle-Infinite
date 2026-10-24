import { RNGWEEN_INTRO_KEY } from "../../src/rngween-intro.js";
// Mock the website clock, not the player's calendar. Tests can independently
// move Date/timezone and the authoritative HTTP Date header.
export async function mockSeasonClock(page, at, { introSeen = true } = {}) {
  await page.addInitScript(
    ([key, seen]) => {
      if (seen) return localStorage.setItem(key, "rngween-2026");
      // First document only, so a reload keeps the receipt the game wrote.
      if (sessionStorage.getItem("rng-tests-intro-cleared")) return;
      sessionStorage.setItem("rng-tests-intro-cleared", "1");
      localStorage.removeItem(key);
    },
    [RNGWEEN_INTRO_KEY, introSeen],
  );
  let time = at;
  await page.route("**/favicon.svg?season-clock=*", async (route) => {
    await route.fulfill({
      status: 200,
      headers: time === null ? {} : { date: new Date(time).toUTCString() },
      body: "",
    });
  });
  return {
    set: (at) => {
      time = at;
    },
  };
}
