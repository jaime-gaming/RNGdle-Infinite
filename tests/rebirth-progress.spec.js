import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
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
  expect(
    rebirthProgress(
      save({ discovered: badgeIds.slice(0, 47), history: earned(125000) }),
    ).percent,
  ).toBe(72);
  expect(blendedPercent(47, 125000, rebirthRequirement(0))).toBe(72);
  expect(
    rebirthProgress(save({ discovered: badgeIds.slice(0, 47) })).percent,
  ).toBe(47);
  expect(rebirthProgress(save({ history: earned(250000) })).percent).toBe(50);

  expect(
    rebirthProgress(
      save({ discovered: badgeIds.slice(0, 47), history: earned(249999) }),
    ).percent,
  ).toBe(97);
  expect(
    rebirthProgress(
      save({ discovered: badgeIds.slice(0, 47), history: earned(250000) }),
    ).percent,
  ).toBe(97);
});

test("the Rollback asks for 65% of the collection and 60 million EP, above the prestige gate", () => {
  expect(rollbackRequirement()).toEqual({
    percent: 65,
    badges: 158,
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

  expect(nextStep({ rebirths: 6, ultraRebirths: 3, rollbacks: 1 }).kind).toBe(
    "rollback",
  );
  expect(nextStep({ rebirths: 6, ultraRebirths: 3, rollbacks: 5 }).kind).toBe(
    "rollback",
  );

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
  await waitForApp(page);
  await expect(page.locator(".rebirth-gauge")).toHaveAttribute(
    "aria-label",
    /^72% of this step/,
  );
  await expect(page.locator(".rebirth-gauge > span")).toHaveText("72%");
  await expect(page.locator(".rebirth-nav")).toHaveAttribute(
    "aria-label",
    /72% overall/,
  );
  await expect(
    page.locator(".rebirth-ladder > li.is-current .rebirth-rung-bar > span"),
  ).toHaveAttribute("style", /width: 72%/);
});

test("no screen names Prestige before the sixth rebirth", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedProgress(page, {
    profile: testProfile,
    discovered: badgeIds.slice(0, 150),
    rebirths: 3,
  });

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
    await waitForApp(page);
    await expect(page.locator("body")).toContainText("RNGdle");
    expect(await page.locator("body").innerText(), route).not.toMatch(
      /prestige/i,
    );
  }

  await page.goto("/rebirth");
  await waitForApp(page);
  await expect(
    page.getByText("Wait, but there is more...", { exact: true }),
  ).toBeVisible();
});
