import { test, expect } from "@playwright/test";
import {
  availableGoals,
  currentGoal,
  recommendedGoal,
  rollReceipt,
} from "../src/gameplay-loop.js";
import {
  emptyProgress,
  parseProgress,
  applyProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { showRoll, mockRandom } from "./helpers/random-roll.js";
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const home = (p) =>
  p.getByRole("button", { name: "Back to rolling", exact: true }).click();
const complete = (id) => ({
  type: "complete",
  id,
  at: 1000,
  cooldownUntil: 106000,
  result: evaluate(604827),
});
const settled = (p) =>
  expect(p.locator(".roll-experience")).toHaveAttribute("data-settled", "true");

// No chance, reward, or timing rules live in the guidance layer.
test("recommendations respect progression, custom choices and the completed workshop", () => {
  let p = emptyProgress();
  expect(currentGoal(p).id).toBe("quickwind-1");
  expect(availableGoals(p).some((i) => i.id === "quickwind-2")).toBe(false);
  p = { ...p, owned: ["quickwind-1"] };
  expect(currentGoal(p).id).toBe("clockwork-1");
  p = { ...p, owned: [...p.owned, "clockwork-1"] };
  expect(currentGoal(p).id).toBe("quickwind-2");
  expect(currentGoal({ ...p, goalId: "starfall" }).id).toBe("starfall");
  expect(currentGoal({ ...p, goalId: "quickwind-3" }).id).toBe("quickwind-2");
  const all = shopProducts.map((i) => i.id);
  expect(currentGoal({ ...p, owned: all })).toBeNull();
  expect(availableGoals({ ...p, owned: all })).toEqual([]);
  const guest = { ...p, owned: all.filter((id) => id !== "offline-roller") };
  expect(recommendedGoal(guest)).toBeNull();
  expect(currentGoal({ ...guest, goalId: "offline-roller" }).id).toBe(
    "offline-roller",
  );
});

test("goal preferences migrate safely, never spend EP, and clear after their confirmed purchase", () => {
  let p = { ...emptyProgress(), balance: 100000, totalEarned: 100000 };
  delete p.goalId;
  expect(parseProgress(JSON.stringify(p)).goalId).toBeNull();
  for (const goalId of ["missing", "quickwind-3", {}, false])
    expect(parseProgress(JSON.stringify({ ...p, goalId })).balance).toBe(
      100000,
    );
  for (const id of ["missing", "quickwind-3"])
    expect(() => applyProgress(p, { type: "goal", id })).toThrow();
  p = applyProgress(p, { type: "goal", id: "starfall" });
  expect(p.goalId).toBe("starfall");
  expect(p.history).toEqual([]);
  expect(p.balance).toBe(100000);
  expect(p.cooldownUntil).toBe(0);
  expect(applyProgress(p, { type: "goal", id: "starfall" })).toBe(p);
  expect(parseProgress(JSON.stringify(p))).toEqual(p);
  const bought = applyProgress(p, { type: "buy", id: "starfall" });
  expect(bought.goalId).toBeNull();
  expect(bought.balance).toBe(50000);
  expect(bought.history).toHaveLength(1);
  expect(currentGoal(bought).id).toBe("quickwind-1");
  expect(() =>
    applyProgress(bought, { type: "goal", id: "starfall" }),
  ).toThrow();
  const cleared = applyProgress(p, { type: "goal", id: null });
  expect(cleared.balance).toBe(p.balance);
  expect(cleared.goalId).toBeNull();
});

test("recaps use actual settlement and unlock receipts, never balances or pending outcomes", () => {
  let p = { ...emptyProgress(), balance: 100000, totalEarned: 100000 };
  expect(rollReceipt(p)).toBeNull();
  p = applyProgress(p, complete("first"));
  expect(rollReceipt(p).unlocked).toHaveLength(evaluate(604827).badges.length);
  expect(rollReceipt(p, "pending-id")).toBeNull();
  p = applyProgress(p, complete("repeat"));
  expect(rollReceipt(p).roll.ep).toBe(4663);
  expect(rollReceipt(p).unlocked).toEqual([]);
  p = applyProgress(p, { ...complete("offline"), source: "offline" });
  expect(rollReceipt(p).roll.id).toBe("repeat");
  expect(rollReceipt(p, "first").unlocked).toHaveLength(
    evaluate(604827).badges.length,
  );
});

test("the first visit explains the loop without exposing undiscovered badges or invented progress", async ({
  page,
}) => {
  await page.goto("/");
  const hub = page.getByRole("region", { name: "Your next steps" });
  await expect(hub).toContainText("ROLL · DISCOVER · UPGRADE");
  await expect(
    hub.getByRole("progressbar", { name: "Savings for Quickwind I" }),
  ).toHaveAttribute("value", "0");
  await expect(
    hub.getByRole("progressbar", { name: "Your discovered badges" }),
  ).toHaveAttribute("value", "0");
  await expect(hub.getByRole("button", { name: /View new badge/ })).toHaveCount(
    0,
  );
  await expect(hub).not.toContainText("EP added to your balance");
  expect(await saved(page)).toBeNull();
});

test("post-roll feedback waits for the full reveal and repeated numbers do not invent discoveries", async ({
  page,
}) => {
  await seedProgress(page);
  await mockRandom(page, [604827]);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await page.locator(".generate").click();
  await expect.poll(async () => !!(await saved(page)).pendingRoll).toBe(true);
  await expect(page.locator(".loop-hub")).toHaveCount(0);
  await page.clock.fastForward(44000);
  expect((await saved(page)).history).toHaveLength(0);
  await expect(page.locator(".loop-hub")).toHaveCount(0);
  await page.clock.runFor(1200);
  await settled(page);
  await expect(page.locator(".loop-receipt")).toContainText("+4,663 EP");
  await expect(page.locator(".loop-receipt")).toContainText(
    `${evaluate(604827).badges.length} new badges`,
  );
  await expect(
    page.getByRole("progressbar", { name: "Savings for Quickwind I" }),
  ).toHaveAttribute("value", "4663");
  await expect(page.locator(".loop-badge-chips button")).toHaveCount(2);
  await page.locator(".loop-badge-chips button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Discovered");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.clock.fastForward(60000);
  await page.locator(".generate").click();
  await expect.poll(async () => !!(await saved(page)).pendingRoll).toBe(true);
  await page.clock.fastForward(46000);
  await settled(page);
  await expect(page.locator(".loop-receipt")).toContainText("0 new badges");
  await expect(page.locator(".loop-badge-chips button")).toHaveCount(0);
  await expect(
    page.getByRole("progressbar", { name: "Savings for Quickwind I" }),
  ).toHaveAttribute("value", "9326");
});

test("a chosen goal persists, focuses its shop card, requires confirmation and advances after buying", async ({
  page,
}) => {
  await seedProgress(page, { balance: 100000, totalEarned: 100000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#shop");
  await page
    .getByLabel("Track a goal", { exact: true })
    .selectOption("quickwind-1");
  await expect.poll(async () => (await saved(page)).goalId).toBe("quickwind-1");
  expect((await saved(page)).history).toHaveLength(0);
  expect((await saved(page)).balance).toBe(100000);
  await page.reload();
  await expect(page.getByLabel("Track a goal", { exact: true })).toHaveValue(
    "quickwind-1",
  );
  await home(page);
  await expect(page.locator(".goal-card")).toContainText("Ready to buy");
  await page
    .getByRole("button", { name: "Review upgrade", exact: true })
    .click();
  const card = page.locator('[data-product="quickwind-1"]');
  await expect(card).toBeFocused();
  expect((await saved(page)).owned).toEqual([]);
  await card.getByRole("button").click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).goalId).toBe("quickwind-1");
  expect((await saved(page)).balance).toBe(100000);
  await card.getByRole("button").click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).goalId).toBeNull();
  expect((await saved(page)).balance).toBe(25000);
  expect((await saved(page)).owned).toEqual(["quickwind-1"]);
  await expect(
    page.getByRole("complementary", { name: "Purchase complete" }),
  ).toContainText("Quickwind I is yours.");
  await page
    .getByRole("button", { name: "Continue rolling", exact: true })
    .click();
  await expect(page.locator(".goal-card")).toContainText("Clockwork I");
  await expect(page.locator(".roll-hint")).toContainText("35s reveal");
  await expect(page.locator(".goal-card")).toContainText("100,000 to go");
});

test("failed goal writes preserve the previous choice and wallet and can be retried", async ({
  page,
}) => {
  await seedProgress(page, {
    goalId: "starfall",
    balance: 12345,
    totalEarned: 12345,
  });
  await page.goto("/#shop");
  await page.evaluate((k) => {
    const write = Storage.prototype.setItem;
    window.failGoal = true;
    Storage.prototype.setItem = function (key, value) {
      if (
        window.failGoal &&
        key === k &&
        JSON.parse(value).goalId === "flywheel"
      )
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, key, value);
    };
  }, PROGRESS_KEY);
  await page
    .getByLabel("Track a goal", { exact: true })
    .selectOption("flywheel");
  await expect(page.locator(".toast")).toContainText("goal could not be saved");
  await expect(page.getByLabel("Track a goal", { exact: true })).toHaveValue(
    "starfall",
  );
  expect((await saved(page)).balance).toBe(12345);
  expect((await saved(page)).goalId).toBe("starfall");
  await page.evaluate(() => {
    window.failGoal = false;
  });
  await page
    .getByLabel("Track a goal", { exact: true })
    .selectOption("flywheel");
  await expect.poll(async () => (await saved(page)).goalId).toBe("flywheel");
});

test("cross-tab goal changes sync without overwriting spending or an in-flight roll", async ({
  page,
  context,
}) => {
  await seedProgress(page, { balance: 1000000, totalEarned: 1000000 });
  await mockRandom(page, [604827]);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await page.locator(".generate").click();
  await expect.poll(async () => !!(await saved(page)).pendingRoll).toBe(true);
  const before = await saved(page);
  await nav(page, "Shop");
  const other = await context.newPage();
  await other.goto("/#shop");
  await page.getByLabel("Track a goal", { exact: true }).selectOption("aurora");
  await expect(other.getByLabel("Track a goal", { exact: true })).toHaveValue(
    "aurora",
  );
  await other.locator('[data-product="starfall"] button').click();
  await other
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(other.getByRole("dialog")).not.toBeVisible();
  const after = await saved(page);
  expect(after.balance).toBe(950000);
  expect(after.goalId).toBe("aurora");
  expect(after.pendingRoll).toEqual(before.pendingRoll);
  expect(after.cooldownUntil).toBe(before.cooldownUntil);
  await other.close();
});

test("Auto-Roll pauses for badge inspection and resumes without replacing its completed result", async ({
  page,
}) => {
  await seedProgress(page, { owned: ["auto-roll"] });
  await mockRandom(page, [604827]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto("/");
  await expect(page.locator(".generate")).toBeEnabled();
  await page.getByRole("switch", { name: "Auto-Roll" }).click();
  await page.clock.runFor(300);
  await settled(page);
  await page.locator(".loop-badge-chips button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.clock.fastForward(120000);
  expect(
    (await saved(page)).history.filter((e) => e.type === "roll"),
  ).toHaveLength(1);
  await expect(page.locator(".auto-roll-control")).toContainText(
    "Paused while you browse",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.clock.runFor(500);
  await expect
    .poll(
      async () =>
        (await saved(page)).history.filter((e) => e.type === "roll").length,
    )
    .toBe(2);
  await page.getByRole("switch", { name: "Auto-Roll" }).click();
});

test("guest goals are temporary until signup; signup preserves the choice without spending EP", async ({
  page,
}) => {
  await page.goto("/#shop");
  await page
    .getByLabel("Track a goal", { exact: true })
    .selectOption("starfall");
  await expect(page.getByLabel("Track a goal", { exact: true })).toHaveValue(
    "starfall",
  );
  expect(await saved(page)).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Track a goal", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Track a goal", { exact: true })
    .selectOption("flywheel");
  await expect(page.locator(".toast")).toContainText("Goal updated");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("GoalKeeper");
  await page
    .getByRole("button", { name: "Create local profile", exact: true })
    .click();
  await expect.poll(async () => (await saved(page))?.goalId).toBe("flywheel");
  expect((await saved(page)).balance).toBe(0);
  expect((await saved(page)).owned).toEqual([]);
  expect((await saved(page)).history).toHaveLength(0);
  await page.reload();
  await expect(page.getByLabel("Track a goal", { exact: true })).toHaveValue(
    "flywheel",
  );
});

test("the completed workshop and collection have honest end states with no invented upgrades", async ({
  page,
}) => {
  await seedProgress(page, {
    owned: shopProducts.map((p) => p.id),
    discovered: allBadgeMetadata.map((b) => b.id),
  });
  await page.goto("/");
  await expect(page.locator(".goal-card")).toContainText(
    "Your workshop is complete",
  );
  await expect(page.locator(".collection-card")).toContainText(
    "Your collection is complete",
  );
  await page
    .getByRole("button", { name: "Open your workshop", exact: true })
    .click();
  await expect(page.getByLabel("Track a goal", { exact: true })).toBeDisabled();
});

test("feedback and goals fit narrow screens in both themes and respect reduced motion", async ({
  page,
}) => {
  await seedProgress(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await showRoll(page, 1337);
  for (const theme of ["dark", "light"]) {
    await page
      .getByRole("button", { name: `${theme} theme`, exact: true })
      .click();
    await expect(page.locator(".loop-hub")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".cooldown-fill")
        .evaluate((e) => getComputedStyle(e).transitionDuration),
    ).toBe("0s");
    await page.locator(".loop-badge-chips button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Review upgrade", exact: true })
      .click();
    await expect(page.locator('[data-product="quickwind-1"]')).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await home(page);
  }
});

test("a funded offline goal still explains the profile requirement instead of claiming it is purchasable", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: null,
    balance: 20000000,
    totalEarned: 20000000,
    goalId: "offline-roller",
  });
  await page.goto("/");
  await expect(page.locator(".goal-card")).toContainText(
    "Requires a saved profile",
  );
  await expect(page.locator(".goal-card")).toContainText("Profile needed");
  await expect(page.locator(".goal-card")).not.toContainText("Ready to buy");
  await expect(page.locator(".goal-card")).not.toContainText("to go");
  await page
    .getByRole("button", { name: "View goal in shop", exact: true })
    .click();
  await expect(page.locator('[data-product="offline-roller"]')).toBeFocused();
  await page.locator('[data-product="offline-roller"] button').click();
  await expect(
    page.getByRole("button", { name: "Create local profile", exact: true }),
  ).toBeVisible();
});
