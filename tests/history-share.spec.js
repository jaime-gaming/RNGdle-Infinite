import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { buildShareTextFromHistory, GAME_URL } from "../src/roll-data.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import { cycleEarnedEp, rebirthRequirement } from "../src/rebirth.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const ids = allBadgeMetadata.map((b) => b.id);

// Old rolls are shareable long after the reveal: History rebuilds the text from
// the entry the save kept, so it can only ever state what that roll earned.
const archived = {
  id: "roll:604827",
  type: "roll",
  at: 1700000000000,
  number: 604827,
  tier: "rare",
  ep: 12000,
  badges: ["NEIGHBORS"],
};

test("an archived roll shares its number, tier, badges, EP and link", () => {
  const text = buildShareTextFromHistory(archived);
  expect(text).toContain("RNGdle Infinite 🎲 604827");
  expect(text).toContain("RARE");
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

test("a rebirth opens a new cycle in the log without erasing the old one", () => {
  const first = rebirthRequirement(0);
  const rolled = applyProgress(
    {
      ...emptyProgress(),
      profile: testProfile,
      discovered: ids.slice(0, first.badges),
    },
    {
      type: "complete",
      id: "roll:1",
      at: 1000,
      cooldownUntil: 106000,
      result: { number: 777777, totalEP: first.ep, tier: "godly", badges: [] },
    },
  );
  const reborn = applyProgress(rolled, {
    type: "rebirth",
    expectedRebirths: 0,
    at: 200000,
    eventId: "reb:1",
  });
  // The log is the account's, not the cycle's: the roll from before the
  // rebirth is still there, and the rebirth joins it.
  expect(reborn.history.map((e) => e.type)).toEqual(["roll", "rebirth"]);
  expect(reborn.history[0].number).toBe(777777);
  expect(reborn.history.at(-1)).toMatchObject({
    type: "rebirth",
    count: 1,
    cost: first.ep,
  });
  // A new cycle has earned nothing yet, so it pays its own way again.
  expect(cycleEarnedEp(rolled)).toBe(first.ep);
  expect(cycleEarnedEp(reborn)).toBe(0);
  // And the whole story survives a save and a load.
  const parsed = parseProgress(JSON.stringify(reborn));
  expect(parsed.history.map((e) => e.type)).toEqual(["roll", "rebirth"]);
  expect(parsed.history.at(-1).cost).toBe(first.ep);
});

test("the feed draws a dotted line where each rebirth began a cycle", () => {
  const feed = fs.readFileSync("src/components/ActivityFeed.jsx", "utf8");
  const css = fs.readFileSync("src/activity.css", "utf8");
  // The line comes from the log itself: every rebirth and ultra-rebirth entry
  // opens a cycle, and it is labelled with the one it was.
  expect(feed).toContain('className="activity-divider"');
  expect(feed).toMatch(
    /event\.type === "rebirth"[\s\S]{0,240}activity-divider/,
  );
  expect(feed).toContain("Ultra-rebirth ${event.count}");
  expect(feed).toContain("Rebirth ${event.count}");
  // Dotted, not solid: a boundary drawn in the log's own hand.
  expect(css).toContain(".activity-divider");
  expect(css).toMatch(/border-top: 1px dotted/);
  // Nothing clears the log to make room for it: a rebirth appends, and the
  // cycle it restarts never rewrites the history.
  const progress = fs.readFileSync("src/progress.js", "utf8");
  expect(progress).toContain("appendHistory(state.history");
  expect(progress).not.toMatch(/startNewCycle[\s\S]{0,900}history: \[\]/);
});
