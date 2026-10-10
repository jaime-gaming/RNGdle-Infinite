import { test, expect } from "@playwright/test";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { emptyProgress } from "../src/progress.js";
import {
  ROLLBACK_STEP,
  blendedPercent,
  nextStep,
  prestigeShown,
  rebirthProgress,
  rebirthRequirement,
  rollbackRequirement,
  ultraRebirthAvailable,
} from "../src/rebirth.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const badgeIds = allBadgeMetadata.map((b) => b.id);
// A roll that scored `ep` in the cycle in play. The gate reads only these.
const earned = (ep, at = 150000) => [
  {
    id: `ep:${at}:${ep}`,
    type: "roll",
    at,
    number: 604827,
    tier: "godly",
    ep,
    badges: [],
  },
];
const save = (extra) => ({
  ...emptyProgress(),
  profile: testProfile,
  ...extra,
});

test("the one percentage is the mean of the badge share and the EP share, rounded down", () => {
  // The first rung asks for 47 badges and 250,000 EP.
  expect(
    rebirthProgress(
      save({ discovered: badgeIds.slice(0, 47), history: earned(125000) }),
    ).percent,
  ).toBe(75);
  expect(blendedPercent(47, 125000, rebirthRequirement(0))).toBe(75);
  expect(
    rebirthProgress(save({ discovered: badgeIds.slice(0, 47) })).percent,
  ).toBe(50);
  expect(rebirthProgress(save({ history: earned(250000) })).percent).toBe(50);
  // It reads 100 only when both halves are done, never 99.9 rounded up.
  expect(
    rebirthProgress(
      save({ discovered: badgeIds.slice(0, 47), history: earned(249999) }),
    ).percent,
  ).toBe(99);
  expect(
    rebirthProgress(
      save({ discovered: badgeIds.slice(0, 47), history: earned(250000) }),
    ).percent,
  ).toBe(100);
});

test("the Rollback asks for 75% of the collection and 60 million EP, above the prestige gate", () => {
  expect(rollbackRequirement()).toEqual({
    percent: 75,
    badges: 177,
    ep: 60000000,
  });
  expect(ROLLBACK_STEP.ep).toBeGreaterThan(30000000);
});

test("prestige is out of sight until the sixth rebirth", () => {
  expect(prestigeShown({ rebirths: 0 })).toBe(false);
  expect(prestigeShown({ rebirths: 5 })).toBe(false);
  expect(prestigeShown({ rebirths: 6 })).toBe(true);
  expect(prestigeShown({ rebirths: 0, ultraRebirths: 1 })).toBe(true);
});

test("the steps run: six rungs, then three prestiges, then the Rollback again and again", () => {
  expect(nextStep({ rebirths: 0 }).kind).toBe("rung");
  expect(nextStep({ rebirths: 6, ultraRebirths: 0 }).kind).toBe("prestige");
  expect(nextStep({ rebirths: 6, ultraRebirths: 2 }).kind).toBe("prestige");
  expect(nextStep({ rebirths: 6, ultraRebirths: 3 }).kind).toBe("rollback");
  // A Rollback does not end the steps: the next one is always the Rollback.
  expect(nextStep({ rebirths: 6, ultraRebirths: 3, rollbacks: 1 }).kind).toBe(
    "rollback",
  );
  expect(nextStep({ rebirths: 6, ultraRebirths: 3, rollbacks: 5 }).kind).toBe(
    "rollback",
  );
  // Prestige closes after the third: the Rollback is the only way out.
  expect(
    ultraRebirthAvailable(
      { rebirths: 6, ultraRebirths: 3, history: [] },
      Date.now(),
    ),
  ).toBe(false);
});

test("the gauge, the top-bar ring and the current rung show the same number", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    discovered: badgeIds.slice(0, 47),
    history: earned(125000),
  });
  await page.goto("/rebirth");
  await expect(page.locator(".rebirth-gauge")).toHaveAttribute(
    "aria-label",
    /^75% of this step/,
  );
  await expect(page.locator(".rebirth-gauge > span")).toHaveText("75%");
  await expect(page.locator(".rebirth-nav")).toHaveAttribute(
    "aria-label",
    /75% overall/,
  );
  await expect(
    page.locator(".rebirth-ladder > li.is-current .rebirth-rung-bar > span"),
  ).toHaveAttribute("style", /width: 75%/);
});

test("no screen names Prestige before the sixth rebirth", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedProgress(page, {
    profile: testProfile,
    discovered: badgeIds.slice(0, 150),
    rebirths: 3,
  });
  // The changelog is release history, so it is the one page left out.
  for (const route of [
    "/",
    "/tasks",
    "/shop",
    "/badges",
    "/history",
    "/settings",
    "/about",
    "/profile",
    "/rebirth",
  ]) {
    await page.goto(route);
    await expect(page.locator("body")).toContainText("RNGdle");
    expect(await page.locator("body").innerText(), route).not.toMatch(
      /prestige/i,
    );
  }
  // The teaser stands in for it on the Rebirth page.
  await page.goto("/rebirth");
  await expect(
    page.getByText("Wait, but there is more...", { exact: true }),
  ).toBeVisible();
});
