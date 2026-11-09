import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
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
  await waitForApp(page);
  const row = page.locator('[data-event-type="roll"]');
  await expect(
    row.getByRole("button", { name: "Share roll 604827" }),
  ).toBeVisible();

  await expect(
    page.locator('[data-event-type="purchase"] .activity-share'),
  ).toHaveCount(0);

  const share = row.getByRole("button", { name: "Share roll 604827" });
  await expect(share).toHaveText("");
  await share.click();

  await expect(
    row.getByRole("button", {
      name: "Copied roll 604827 result and link",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    buildShareTextFromHistory(archived),
  );
});

test("the archive share reuses the palette of the live share control", () => {
  const source = fs.readFileSync("src/components/ActivityFeed.jsx", "utf8");
  expect(source).toContain("buildShareTextFromHistory");
  expect(source).toContain("`Share roll ${event.number}`");

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

  expect(reborn.history.map((e) => e.type)).toEqual(["roll", "rebirth"]);
  expect(reborn.history[0].number).toBe(777777);
  expect(reborn.history.at(-1)).toMatchObject({
    type: "rebirth",
    count: 1,
    cost: first.ep,
  });

  expect(cycleEarnedEp(rolled)).toBe(first.ep);
  expect(cycleEarnedEp(reborn)).toBe(0);

  const parsed = parseProgress(JSON.stringify(reborn));
  expect(parsed.history.map((e) => e.type)).toEqual(["roll", "rebirth"]);
  expect(parsed.history.at(-1).cost).toBe(first.ep);
});

test("the feed draws a dotted line where each rebirth began a cycle", () => {
  const feed = fs.readFileSync("src/components/ActivityFeed.jsx", "utf8");
  const css = fs.readFileSync("src/activity.css", "utf8");

  expect(feed).toContain('className="activity-divider"');
  expect(feed).toMatch(
    /event\.type === "rebirth"[\s\S]{0,240}activity-divider/,
  );
  expect(feed).toContain("Prestige ${event.count}");
  expect(feed).toContain("Rollback");
  expect(feed).toContain("Rebirth ${event.count}");

  expect(css).toContain(".activity-divider");
  expect(css).toMatch(/border-top: 1px dotted/);

  const progress = fs.readFileSync("src/progress.js", "utf8");
  expect(progress).toContain("appendHistory(state.history");
  expect(progress).not.toMatch(/startNewCycle[\s\S]{0,900}history: \[\]/);
});

test("History keeps every cycle and draws a line where each rebirth opened one", async ({
  page,
}) => {
  await seedProgress(page, {
    ...emptyProgress(),
    profile: testProfile,
    rebirths: 1,
    cycleEarnedEP: 34000,
    history: [
      {
        id: "roll:old",
        type: "roll",
        at: Date.UTC(2026, 5, 1),
        number: 123456,
        tier: "epic",
        ep: 12000,
        badges: [],
      },
      {
        id: "reb:1",
        type: "rebirth",
        at: Date.UTC(2026, 6, 1),
        count: 1,
        grant: 250000,
        cost: 100000,
      },
      {
        id: "roll:new",
        type: "roll",
        at: Date.UTC(2026, 7, 1),
        number: 777777,
        tier: "godly",
        ep: 34000,
        badges: [],
      },
    ],
  });
  await page.goto("/history");
  await waitForApp(page);

  await expect(page.locator(".activity-divider")).toHaveCount(1);
  await expect(page.locator(".activity-divider")).toContainText("Rebirth 1");

  await expect(page.locator('[data-event-type="roll"]')).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Share roll 777777" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share roll 123456" }),
  ).toBeVisible();

  const order = await page.evaluate(() =>
    [...document.querySelectorAll(".activity-feed > li")].map((li) =>
      li.classList.contains("activity-divider")
        ? "divider"
        : li.dataset.eventType,
    ),
  );
  expect(order).toEqual(["roll", "divider", "rebirth", "roll"]);
});
