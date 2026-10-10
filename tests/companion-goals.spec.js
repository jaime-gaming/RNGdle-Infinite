import { test, expect } from "./helpers/clock.js";
import { currentGoal, goalItem, validGoal } from "../src/gameplay-loop.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { petById } from "../src/pets.js";
import { shelfOfProduct, shopProducts } from "../src/shop-data.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";

// A companion can be the savings goal, like any shop item. Choosing it spends
// nothing; it is met the moment it is found, by buying it or by a lucky drop;
// and a goal on one survives a rebirth, because companions go back in the wild
// at a rebirth just as the rest of the run does.

const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const kit = petById.get("kit");
const pebble = petById.get("pebble");

const ids = allBadgeMetadata.map((b) => b.id);
const rebirthState = (extra = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  discovered: ids,
  balance: 50000000,
  totalEarned: 50000000,
  owned: shopProducts.map((p) => p.id),
  equipped: "prism",
  flywheelCharge: 4,
  ...extra,
});
// The cycle in play has earned enough EP for the first rung of the ladder.
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

test("an unfound companion is a valid goal; a found one is not", () => {
  expect(validGoal("kit", [], [])).toBe(true);
  expect(validGoal("kit", [], ["kit"])).toBe(false);
  expect(validGoal("missing", [], [])).toBe(false);
  expect(validGoal(null, [], [])).toBe(false);
  // Products keep their own rules, whatever the companions say.
  expect(validGoal("quickwind-3", [], [])).toBe(false);
});

test("a companion goal reads like a product goal and lands on its shelf", () => {
  const p = { ...emptyProgress(), goalId: "kit" };
  const goal = currentGoal(p);
  expect(goal).toMatchObject({
    id: "kit",
    name: kit.name,
    price: kit.price,
    kind: "companion",
    icon: "companion",
  });
  expect(shelfOfProduct(goal)).toBe("companions");
  expect(goalItem("missing")).toBeNull();
});

test("choosing a companion as the goal spends nothing and survives a reload", () => {
  let p = emptyProgress();
  p = applyProgress(p, { type: "goal", id: "kit" });
  expect(p.goalId).toBe("kit");
  expect(p.balance).toBe(0);
  expect(parseProgress(JSON.stringify(p)).goalId).toBe("kit");
  expect(() => applyProgress(p, { type: "goal", id: "missing" })).toThrow();
  // Clearing still hands the shop's own recommendation back.
  expect(applyProgress(p, { type: "goal", id: null }).goalId).toBeNull();
});

test("a goal on an owned companion is dropped on load, and buying it meets the goal", () => {
  const owned = {
    ...emptyProgress(),
    pets: ["kit"],
    activePet: "kit",
    goalId: "kit",
  };
  expect(parseProgress(JSON.stringify(owned)).goalId).toBeNull();
  const funded = { ...emptyProgress(), balance: kit.price, goalId: "kit" };
  const bought = applyProgress(funded, { type: "buy-pet", id: "kit" });
  expect(bought.pets).toEqual(["kit"]);
  expect(bought.balance).toBe(0);
  expect(bought.goalId).toBeNull();
  // A different companion bought leaves the goal alone.
  const other = applyProgress(
    { ...emptyProgress(), balance: pebble.price, goalId: "kit" },
    { type: "buy-pet", id: "pebble" },
  );
  expect(other.goalId).toBe("kit");
});

test("a companion drop meets a goal set on it, and any other drop leaves it", () => {
  const roll = (petDrop) => ({
    type: "complete",
    id: `drop:${petDrop}`,
    at: 1000,
    cooldownUntil: 106000,
    result: evaluate(604827),
    petDrop,
  });
  const base = { ...emptyProgress(), goalId: "kit" };
  const met = applyProgress(base, roll("kit"));
  expect(met.pets).toEqual(["kit"]);
  expect(met.goalId).toBeNull();
  const kept = applyProgress(base, roll("pebble"));
  expect(kept.pets).toEqual(["pebble"]);
  expect(kept.goalId).toBe("kit");
});

test("a companion goal survives a rebirth, since companions go back in the wild", () => {
  const state = rebirthState({
    goalId: "kit",
    pets: ["pebble"],
    activePet: "pebble",
    history: earned(300000),
  });
  const reborn = applyProgress(state, {
    type: "rebirth",
    expectedRebirths: 0,
    at: 200000,
  });
  expect(reborn.rebirths).toBe(1);
  expect(reborn.pets).toEqual([]);
  expect(reborn.goalId).toBe("kit");
});

test("companions have no Set as goal button, but the shared goal banner can track one", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 10000000,
    totalEarned: 10000000,
  });
  await page.goto("/shop/companions");
  await page.locator(`[data-cage="kit"]`).click();
  const current = page.locator(".pet-slide.is-current");
  await expect(current).toHaveAttribute("data-pet", "kit");
  await expect(
    current.getByRole("button", { name: "Set as goal", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".shop-goal")
    .getByRole("button", { name: "Set goal", exact: true })
    .click();
  await current.locator(".pet-cage").click();
  await expect(page.locator(".shop-goal")).toContainText(
    `Your goal: ${kit.name}`,
  );
  const done = page.locator('.toast[data-kind="done"]');
  await expect(done).toContainText("Goal updated");
  await expect(done.locator(".toast-mark svg")).toHaveClass(/lucide-check/);
  await expect(current.getByText("Your goal", { exact: true })).toBeVisible();
  expect((await saved(page)).goalId).toBe("kit");
  // The roll screen's goal line lands on the companion's own cage.
  await page.goto("/");
  await page.getByRole("button", { name: kit.name, exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/companions/);
  await expect(page.locator(".pet-slide.is-current")).toHaveAttribute(
    "data-pet",
    "kit",
  );
});

test("pick mode makes a companion on the stage the goal when tapped", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 10000000,
    totalEarned: 10000000,
  });
  await page.goto("/shop/companions");
  await page.locator(`[data-cage="kit"]`).click();
  await page
    .locator(".shop-goal")
    .getByRole("button", { name: "Set goal", exact: true })
    .click();
  const current = page.locator(".pet-slide.is-current");
  await expect(current).toHaveClass(/is-pickable/);
  await current.locator(".pet-cage").click();
  await expect(page.locator(".shop-goal")).toContainText(
    `Your goal: ${kit.name}`,
  );
  // Pick mode is done the moment the goal lands.
  await expect(page.locator(".shop-goal-picking")).toHaveCount(0);
  expect((await saved(page)).goalId).toBe("kit");
});

test("buying the companion you were saving for clears the goal", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 10000000,
    totalEarned: 10000000,
    goalId: "kit",
  });
  await page.goto("/shop/companions");
  await page.locator(`[data-cage="kit"]`).click();
  await page
    .locator(".pet-slide.is-current")
    .getByRole("button", { name: /EP$/ })
    .click();
  await expect(page.locator(".shop-goal")).toContainText("Recommended next");
  const after = await saved(page);
  expect(after.goalId).toBeNull();
  expect(after.pets).toEqual(["kit"]);
});
