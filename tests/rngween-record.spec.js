import { test, expect } from "@playwright/test";
import { emptyProgress } from "../src/progress.js";
import { emptyRngweenLimited } from "../src/rngween-limited.js";
import { rngweenRecord } from "../src/rngween-record.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const at = Date.UTC(2026, 9, 26, 12);
const played = () => ({
  ...emptyProgress(),
  profile: testProfile,
  owned: ["jack-o-glow"],
  rngweenLimited: {
    ...emptyRngweenLimited(),
    pumpkoins: 1250,
    auras: ["jack-o-glow", "witchfire"],
  },
  history: [
    {
      id: "h1",
      type: "rngween-hourly",
      at: at - 3e6,
      taskId: "x",
      name: "A",
      pumpkoins: 300,
    },
    {
      id: "h2",
      type: "rngween-hourly",
      at: at - 2e6,
      taskId: "y",
      name: "B",
      pumpkoins: 450,
    },
    {
      id: "e1",
      type: "rngween-exchange",
      at: at - 1e6,
      name: "Exchange",
      ep: 5000000,
      pumpkoins: 500,
    },
    { id: "p1", type: "rngween-purpose", at: at - 5e5, pumpkoins: 9999 },
  ],
});

test("the event record adds up what the log and the save say", () => {
  const record = rngweenRecord(played(), new Date(at));
  expect(record.name).toBe(testProfile.username);
  expect(record.pumpkoins).toBe(1250);
  // Only real earning and spending entries count; unknown types do not.
  expect(record.earned).toBe(1250);
  expect(record.spent).toBe(0);
  expect(record.commissions).toBe(2);
  expect(record.zones.map((zone) => zone.id)).toEqual([
    "pumpkin-patch",
    "graveyard",
    "blood-moon-ridge",
    "haunted-house",
    "valley",
  ]);
  expect(record.rolls).toBe(0);
  expect(record.badges).toBe(0);
  expect(record.badgesTotal).toBeGreaterThan(20);
  // Auras from the event state or the wardrobe both count, once each.
  expect(record.auras).toEqual(["Jack-o'-Glow", "Witchfire"]);
  expect(record.aurasTotal).toBe(4);
  expect(record.key).toBe(false);
  expect(record.hexbound).toBe(false);
  // An untouched account has a record too: all zeros, nothing throws.
  const fresh = rngweenRecord(emptyProgress(), new Date(at));
  expect(fresh).toMatchObject({
    name: "Guest",
    pumpkoins: 0,
    earned: 0,
    rolls: 0,
  });
});

test("the World has a Record tab with the event figures", async ({ page }) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, played());
  await page.goto("/rngween-world");
  await page.getByRole("tab", { name: "Record" }).click();
  const panel = page.locator(".world-record");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`${testProfile.username}'s event record`);
  await expect(panel.locator(".world-record-figures")).toContainText("1,250");
  // The save repair drops the made-up commission receipts (unknown task ids)
  // on load; the EP exchange is real and stays.
  await expect(panel.locator(".world-record-figures")).toContainText(
    "500 earned",
  );
  await expect(panel.locator(".world-record-figures")).toContainText("2 / 4");
  await expect(panel.locator(".world-record-auras")).toContainText(
    "Jack-o'-Glow · Witchfire",
  );
  await expect(panel.getByLabel("Zones").locator("li")).toHaveCount(5);
  await expect(
    panel.getByLabel("The Valley key").locator('[data-done="true"]'),
  ).toHaveCount(0);
});
