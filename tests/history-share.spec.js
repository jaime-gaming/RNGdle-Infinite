import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { buildShareTextFromHistory, GAME_URL } from "../src/roll-data.js";
import { emptyProgress } from "../src/progress.js";
import { seedProgress } from "./helpers/progress.js";

// Old rolls are shareable long after the reveal: History rebuilds the text from
// the entry the save kept, so it can only ever state what that roll earned.
const archived = {
  id: "roll:604827",
  type: "roll",
  at: 1700000000000,
  number: 604827,
  tier: "epic",
  ep: 12000,
  badges: ["NEIGHBORS"],
};

test("an archived roll shares its number, tier, badges, EP and link", () => {
  const text = buildShareTextFromHistory(archived);
  expect(text).toContain("RNGdle Infinite 🎲 604827");
  expect(text).toContain("EPIC");
  expect(text).toContain("12,000 EP");
  expect(text.trim().endsWith(GAME_URL)).toBe(true);
  // A roll shared from the archive carries no live rank claim: the save never
  // stored one, so the text does not pretend otherwise.
  expect(text).not.toContain("Top");
  expect(text).not.toContain("Bottom");
});

test("an archived roll states its own circumstances and invents nothing", () => {
  const plain = buildShareTextFromHistory(archived);
  expect(plain).not.toContain("companion bonus");
  expect(plain).not.toContain("OFFLINE");
  expect(
    buildShareTextFromHistory({ ...archived, source: "offline" }),
  ).toContain("OFFLINE ROLL");
  expect(buildShareTextFromHistory({ ...archived, petBonus: 1560 })).toContain(
    "+1,560 EP companion bonus",
  );
  // An unknown badge id is dropped rather than printed as a blank line.
  const unknown = buildShareTextFromHistory({
    ...archived,
    badges: ["NOT_A_BADGE"],
  });
  expect(unknown.split("\n").every((line) => !line.startsWith("  "))).toBe(
    true,
  );
  expect(unknown).toContain("12,000 EP");
});

test("History offers a share action for rolls, and only for rolls", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedProgress(page, {
    ...emptyProgress(),
    history: [
      archived,
      {
        id: "buy:starfall",
        type: "purchase",
        at: 1700000001000,
        productId: "starfall",
        name: "Starfall",
        ep: 40000,
      },
    ],
  });
  await page.goto("/history");
  const row = page.locator('[data-event-type="roll"]');
  await expect(
    row.getByRole("button", { name: "Share roll 604827" }),
  ).toBeVisible();
  // A purchase has nothing to share.
  await expect(
    page.locator('[data-event-type="purchase"] .activity-share'),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "Share roll 604827" }).click();
  await expect(
    row.getByRole("button", { name: "Share roll 604827" }),
  ).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    buildShareTextFromHistory(archived),
  );
});

test("the archive share reuses the palette of the live share control", () => {
  const source = fs.readFileSync("src/components/ActivityFeed.jsx", "utf8");
  expect(source).toContain("buildShareTextFromHistory");
  expect(source).toContain("aria-label={`Share roll ${event.number}`}");
  // The live share button stays the only share control on the roll page.
  const roll = fs.readFileSync("src/components/RollExperience.jsx", "utf8");
  expect(roll.match(/async function share\(/g)).toHaveLength(1);
});
