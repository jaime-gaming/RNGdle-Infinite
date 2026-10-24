import { test, expect } from "@playwright/test";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  FAREWELL_EP_PER_PUMPKOIN,
  FAREWELL_MAX_EP,
  emptyRngweenLimited,
  farewellEP,
  retireRngweenLimited,
} from "../src/rngween-limited.js";

// Leftover Pumpkoins are not thrown away when the event closes: they come back
// as a deliberately small EP goodbye, once, and never as a second wallet.
const lastDay = Date.UTC(2026, 10, 3, 23, 59, 59);
const closing = Date.UTC(2026, 10, 4);
const account = (pumpkoins, patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 1000,
  totalEarned: 1000,
  rngweenLimited: { ...emptyRngweenLimited(), pumpkoins },
  ...patch,
});
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

test("the farewell is a fraction of what coins cost, and it is capped", () => {
  expect(FAREWELL_EP_PER_PUMPKOIN).toBeLessThan(10000 / 10);
  expect(farewellEP(0)).toBe(0);
  expect(farewellEP(-5)).toBe(0);
  expect(farewellEP(1.5)).toBe(0);
  expect(farewellEP(12)).toBe(12 * FAREWELL_EP_PER_PUMPKOIN);
  expect(farewellEP(1_000_000)).toBe(FAREWELL_MAX_EP);
});

test("closing the event pays leftovers once, as EP, and keeps the receipt", () => {
  const open = account(37);
  // Nothing is paid while the event is still running.
  expect(retireRngweenLimited(open, lastDay)).toBe(open);

  const closed = retireRngweenLimited(open, closing);
  expect(closed.balance).toBe(1000 + 37 * FAREWELL_EP_PER_PUMPKOIN);
  expect(closed.totalEarned).toBe(1000 + 37 * FAREWELL_EP_PER_PUMPKOIN);
  expect(closed.rngweenLimited.retired).toBe(true);
  expect(closed.rngweenLimited).not.toHaveProperty("pumpkoins");
  const row = closed.history.at(-1);
  expect(row).toMatchObject({
    id: "rngween-farewell:rngween-2026",
    type: "rngween-farewell",
    pumpkoins: 37,
    ep: 37 * FAREWELL_EP_PER_PUMPKOIN,
  });

  // A second pass over the same save cannot pay the same coins again.
  expect(retireRngweenLimited(closed, closing)).toBe(closed);
  expect(
    applyProgress(closed, { type: "retire-rngween-limited", at: closing }),
  ).toEqual(closed);

  // The row survives a reload, and it never resurrects the currency.
  const reloaded = parseProgress(JSON.stringify(closed));
  expect(reloaded.balance).toBe(closed.balance);
  expect(reloaded.history.at(-1).type).toBe("rngween-farewell");
  expect(reloaded.rngweenLimited).not.toHaveProperty("pumpkoins");
});

test("a save with nothing to convert closes without inventing EP", () => {
  const closed = retireRngweenLimited(account(0), closing);
  expect(closed.balance).toBe(1000);
  expect(closed.history.some((row) => row.type === "rngween-farewell")).toBe(
    false,
  );
});

test("the shop promises the farewell instead of losing the coins", async ({
  page,
}) => {
  await mockSeasonClock(page, Date.UTC(2026, 9, 22, 12));
  await seedProgress(page, {
    rngweenLimited: { ...emptyRngweenLimited(), pumpkoins: 1500 },
  });
  await page.goto("/shop/limited");
  await expect(page.locator(".rngween-currency-wallet")).toContainText(
    "small EP farewell",
  );
});

test("closing the event on load leaves the EP in the save and shows it in the log", async ({
  page,
}) => {
  await mockSeasonClock(page, closing);
  await seedProgress(page, {
    balance: 500,
    totalEarned: 500,
    rngweenLimited: { ...emptyRngweenLimited(), pumpkoins: 200 },
  });
  await page.goto("/history");
  await expect
    .poll(async () => (await saved(page))?.rngweenLimited?.retired)
    .toBe(true);
  const stored = await saved(page);
  expect(stored.balance).toBe(500 + 200 * FAREWELL_EP_PER_PUMPKOIN);
  expect(
    stored.history.filter((row) => row.type === "rngween-farewell"),
  ).toHaveLength(1);
  await expect(
    page.locator('[data-event-type="rngween-farewell"]'),
  ).toContainText("RNGween farewell");
  // The player is told, once, in the top-right toast stack.
  await expect(page.locator(".toast")).toContainText("RNGween is over");
  await expect(page.locator(".toast")).toContainText("200 unspent Pumpkoins");
  await expect(page.locator(".toast")).toContainText("20,000 EP");
});
