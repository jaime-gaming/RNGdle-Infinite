import { test, expect } from "@playwright/test";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
import { evaluate } from "./helpers/index.js";
import { mockRandom, showRoll, startRoll } from "./helpers/random-roll.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

test("wallet rules: one credit per roll, all earned badges unlocked, no duplicate or unaffordable purchases", () => {
  const result = evaluate(1337),
    action = { type: "complete", result, id: "test-roll", cooldownUntil: 5000 };
  const earned = applyProgress(emptyProgress(), action);
  expect(earned.balance).toBe(result.totalEP);
  expect(earned.discovered).toHaveLength(17);
  expect(earned.discovered).toContain("LEET"); // Superseded still counts as discovered.
  expect(applyProgress(earned, action)).toBe(earned);
  expect(() =>
    applyProgress(emptyProgress(), { type: "buy", id: "starfall" }),
  ).toThrow("Not enough");
  expect(() => applyProgress(earned, { type: "buy", id: "invented" })).toThrow(
    "not available",
  );
  expect(() =>
    applyProgress(emptyProgress(), { type: "equip", id: "orbit" }),
  ).toThrow("Purchase");
  let state = earned;
  for (const item of shopProducts) {
    const before = state.balance;
    state = applyProgress(state, { type: "buy", id: item.id });
    expect(state.balance).toBe(before - item.price);
    if (item.kind === "aura") expect(state.equipped).toBe(item.id);
    else expect(state.equipped).toBe("none");
    expect(() => applyProgress(state, { type: "buy", id: item.id })).toThrow(
      "already own",
    );
  }
  const reset = applyProgress(state, { type: "equip", id: "none" });
  expect(reset.balance).toBe(state.balance);
  expect(reset.totalEarned).toBe(result.totalEP);
  expect(reset.equipped).toBe("none");
});

test("saved progress is versioned, validated, and cannot equip an unowned item", () => {
  expect(parseProgress(null)).toEqual(emptyProgress());
  for (const value of [
    "broken",
    JSON.stringify({ version: 999 }),
    JSON.stringify({ ...emptyProgress(), balance: -1 }),
    JSON.stringify({ ...emptyProgress(), balance: 10 }),
    JSON.stringify({ ...emptyProgress(), balance: 1.5, totalEarned: 2 }),
  ])
    expect(() => parseProgress(value)).toThrow();
  const p = parseProgress(
    JSON.stringify({
      ...emptyProgress(),
      discovered: ["PRIME", "unknown", "PRIME"],
      owned: ["starfall", "bad"],
      equipped: "orbit",
    }),
  );
  expect(p.discovered).toEqual(["PRIME"]);
  expect(p.owned).toEqual(["starfall"]);
  expect(p.equipped).toBe("none");
});

test("undiscovered badges are absent from collection, search, and demo cards", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".best-card .badge-pill")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Leaderboard", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".best-card .badge-pill")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Badges", exact: true })
    .click();
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No badges discovered yet" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search badges" }).fill("Exact Leet");
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("completed random rolls unlock only their badges and preserve EP/discoveries on reload", async ({
  page,
}) => {
  await seedProgress(page);
  await showRoll(page, 1337);
  await expect
    .poll(async () => (await saved(page))?.discovered.length)
    .toBe(17);
  const before = await saved(page);
  expect(before.balance).toBe(100177458);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Badges", exact: true })
    .click();
  await expect(page.locator(".badge-card")).toHaveCount(17);
  await expect(
    page.locator(".badge-card").filter({
      has: page.getByRole("heading", { name: "Leet", exact: true }),
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Prime Number", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".badge-card")).toHaveCount(17);
  expect(await saved(page)).toEqual(before);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shop", exact: true })
    .click();
  await expect(page.getByTestId("wallet-balance")).toHaveText("100,177,458 EP");
});

test("there is no button or keyboard shortcut to skip the reveal", async ({
  page,
}) => {
  await startRoll(page, 1337);
  await expect(
    page.getByRole("button", { name: "Skip reveal", exact: true }),
  ).toHaveCount(0);
  for (const key of ["Space", "Enter", "Escape"])
    await page.keyboard.press(key);
  await page.locator(".number-artifact").click({ force: true });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  expect(await saved(page)).toBe(null);
});

test("purchases require confirmation, deduct once, persist ownership, and equip without changing scores", async ({
  page,
}) => {
  await seedProgress(page, { balance: 125000, totalEarned: 125000 });
  await mockRandom(page, [604827]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#shop");
  const card = page.locator('[data-product="starfall"]');
  await card.getByRole("button", { name: "Buy for 125,000 EP" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect((await saved(page)).balance).toBe(125000);
  await card.getByRole("button", { name: "Buy for 125,000 EP" }).click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByTestId("wallet-balance")).toHaveText("0 EP");
  expect((await saved(page)).owned).toEqual(["starfall"]);
  await expect(
    card.getByRole("button", { name: "Equipped", exact: true }),
  ).toBeDisabled();
  await expect(page.locator('[data-product="aurora"] button')).toBeDisabled();
  await page.reload();
  await expect(
    card.getByRole("button", { name: "Equipped", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".artifact-stage")).toHaveAttribute(
    "data-aura",
    "starfall",
  );
  await expect(page.locator(".roll-ep")).toHaveText("4,663 EP");
  await expect.poll(async () => (await saved(page))?.balance).toBe(4663);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shop", exact: true })
    .click();
  await page.getByRole("button", { name: "Use original appearance" }).click();
  await expect.poll(async () => (await saved(page))?.equipped).toBe("none");
  expect((await saved(page)).balance).toBe(4663);
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await expect(page.locator(".artifact-stage")).toHaveAttribute(
    "data-aura",
    "none",
  );
});

test("cross-tab purchases cannot overspend a shared wallet", async ({
  page,
  context,
}) => {
  await seedProgress(page, { balance: 500000, totalEarned: 500000 });
  await page.goto("/#shop");
  const other = await context.newPage();
  await other.goto("/#shop");
  await page.locator('[data-product="aurora"] button').click();
  await other.locator('[data-product="starfall"] button').click();
  await Promise.all([
    page
      .getByRole("button", { name: "Confirm purchase", exact: true })
      .evaluate((b) => b.click()),
    other
      .getByRole("button", { name: "Confirm purchase", exact: true })
      .evaluate((b) => b.click()),
  ]);
  await expect.poll(async () => (await saved(page))?.owned.length).toBe(1);
  const p = await saved(page);
  const item = shopProducts.find((item) => item.id === p.owned[0]);
  expect(p.balance).toBe(500000 - item.price);
  await expect(other.getByTestId("wallet-balance")).toHaveText(
    `${p.balance.toLocaleString("en-US")} EP`,
  );
  await other.close();
});

test("a failed save does not spend EP or grant a purchase", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key) throw new DOMException("Full", "QuotaExceededError");
        return original.call(this, k, v);
      };
    },
    {
      key: PROGRESS_KEY,
      data: {
        ...emptyProgress(),
        profile: testProfile,
        balance: 125000,
        totalEarned: 125000,
      },
    },
  );
  await page.goto("/#shop");
  await page.locator('[data-product="starfall"] button').click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "has not been spent",
  );
  const p = await saved(page);
  expect(p.balance).toBe(125000);
  expect(p.owned).toEqual([]);
});

test("malformed localStorage fails safely and shop layouts fit mobile", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "broken"),
    PROGRESS_KEY,
  );
  for (const width of [1200, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#shop");
    await expect(page.getByTestId("wallet-balance")).toHaveText("0 EP");
    await expect(page.locator(".progress-warning")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("cooldown begins immediately even while another tab holds the save lock", async ({
  page,
}) => {
  await seedProgress(page);
  await mockRandom(page, [604827]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(async (key) => {
    let ready;
    const acquired = new Promise((resolve) => {
      ready = resolve;
    });
    const gate = new Promise((resolve) => {
      window.releaseSave = resolve;
    });
    navigator.locks.request(key, () => {
      ready();
      return gate;
    });
    await acquired;
  }, PROGRESS_KEY);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await page.evaluate(() => window.releaseSave());
  await expect.poll(async () => (await saved(page))?.balance).toBe(4663);
});
