import { test, expect } from "@playwright/test";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { evaluate } from "./helpers/index.js";
import { showRoll, startRoll } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { productById } from "../src/shop-data.js";
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const nav = (page, name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
async function register(page) {
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("ActivityPlayer");
  await page.getByRole("button", { name: "Create local profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile, ActivityPlayer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue playing" }).click();
}
async function openDelete(page) {
  await page.getByRole("button", { name: "Your profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete account & progress", exact: true })
    .click();
}
async function confirmDelete(page) {
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete", exact: true })
    .click();
}
async function buy(page, id) {
  await page.locator(`[data-product="${id}"] button`).click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("activity logs every completed roll, first unlock only, immutable purchases and free equipment changes", () => {
  const result = evaluate(1337),
    first = {
      type: "complete",
      id: "first",
      at: 1000,
      cooldownUntil: 61000,
      result,
    };
  let p = applyProgress(emptyProgress(), first);
  expect(p.history.map((e) => e.type)).toEqual(["roll", "unlock"]);
  expect(p.history[0]).toMatchObject({
    number: 1337,
    ep: 100177458,
    tier: "godly",
    at: 1000,
  });
  expect(p.history[1].badges).toHaveLength(17);
  for (let i = 0; i < 150; i++)
    p = applyProgress(p, { ...first, id: `repeat-${i}`, at: 2000 + i });
  expect(p.receipts).toHaveLength(128);
  expect(p.history.filter((e) => e.type === "roll")).toHaveLength(151);
  expect(p.history.filter((e) => e.type === "unlock")).toHaveLength(1);
  expect(applyProgress(p, first)).toBe(p);
  p = applyProgress(p, {
    type: "buy",
    id: "starfall",
    eventId: "purchase",
    at: 5000,
  });
  expect(p.history.at(-1)).toMatchObject({
    type: "purchase",
    productId: "starfall",
    ep: productById.get("starfall").price,
  });
  p = applyProgress(p, {
    type: "equip",
    id: "none",
    eventId: "equip",
    at: 5001,
  });
  expect(p.history.at(-1)).toMatchObject({
    type: "equip",
    name: "Original appearance",
  });
  expect(applyProgress(p, { type: "equip", id: "none" })).toBe(p);
  expect(parseProgress(JSON.stringify(p))).toEqual(p);
});

test("old saves gain an empty feed without invented history, malformed entries cannot break it", () => {
  const legacy = { ...emptyProgress(), balance: 1000000, totalEarned: 1000000 };
  delete legacy.history;
  expect(parseProgress(JSON.stringify(legacy))).toMatchObject({
    balance: 1000000,
    history: [],
  });
  const valid = {
    id: "good",
    type: "roll",
    number: 0,
    at: 1000,
    tier: "godly",
    ep: 139927162,
    badges: ["EVEN"],
  };
  const p = parseProgress(
    JSON.stringify({
      ...legacy,
      history: [
        null,
        {},
        valid,
        valid,
        { ...valid, id: "bad-time", at: 9e15 },
        { ...valid, id: "bad-number", number: 1000001 },
      ],
    }),
  );
  expect(p.history).toEqual([valid]);
});

test("guest feed, filters, badge details, shop transactions and repeated rolls persist together at signup", async ({
  page,
}) => {
  await showRoll(page, 1337);
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toHaveCount(2);
  await expect(
    page.locator('[data-event-type="unlock"] .badge-pill'),
  ).toHaveCount(17);
  await expect(page.locator(".activity-roll .number-box")).toHaveText("1337");
  expect(await saved(page)).toBeNull();
  await page
    .getByRole("button", { name: "Badge unlocks", exact: true })
    .click();
  await expect(page.locator(".activity-event")).toHaveCount(1);
  await page.locator(".activity-badges button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Discovered");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav(page, "Shop");
  await buy(page, "starfall");
  await page.getByRole("button", { name: "Use original appearance" }).click();
  await expect(
    page.getByRole("button", { name: "Original equipped" }),
  ).toBeDisabled();
  await nav(page, "History");
  await page.getByRole("button", { name: "Shop", exact: true }).last().click();
  await expect(page.locator(".activity-event")).toHaveCount(2);
  await expect(page.locator('[data-event-type="purchase"]')).toContainText(
    "−50,000 EP",
  );
  await expect(page.locator('[data-event-type="equip"]')).toContainText(
    "No EP spent",
  );
  await register(page);
  const before = await saved(page);
  expect(before.history).toHaveLength(4);
  await page.reload();
  expect((await saved(page)).history).toEqual(before.history);
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await page.clock.install();
  await page.clock.fastForward(105100);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await nav(page, "History");
  await expect(page.locator('[data-event-type="roll"]')).toHaveCount(2);
  await expect(page.locator('[data-event-type="unlock"]')).toHaveCount(1);
  await expect(page.locator(".activity-event").first()).toHaveAttribute(
    "data-event-type",
    "roll",
  );
  await page.getByRole("button", { name: "Rolls", exact: true }).click();
  await expect(page.locator(".activity-event")).toHaveCount(2);
  await page.locator("summary").first().click();
  await expect(
    page.locator(".activity-event").first().locator(".badge-pill"),
  ).toHaveCount(17);
});

test("the entire feed is accessible through pagination and works on mobile", async ({
  page,
}) => {
  const history = Array.from({ length: 123 }, (_, i) => ({
    id: `roll-${i}`,
    type: "roll",
    at: 1700000000000 + i,
    number: i,
    tier: "common",
    ep: 2200,
    badges: ["EVEN"],
  }));
  await seedProgress(page, {
    history,
    balance: 123 * 2200,
    totalEarned: 123 * 2200,
    discovered: ["EVEN"],
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#history");
  await expect(page.locator(".activity-event")).toHaveCount(50);
  await expect(page.locator(".activity-roll .number-box").first()).toHaveText(
    "122",
  );
  await page.getByRole("button", { name: /Load more activity/ }).click();
  await expect(page.locator(".activity-event")).toHaveCount(100);
  await page.getByRole("button", { name: /Load more activity/ }).click();
  await expect(page.locator(".activity-event")).toHaveCount(123);
  await expect(page.locator(".activity-roll .number-box").last()).toHaveText(
    "0",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
  expect((await saved(page)).history).toHaveLength(123);
});

test("deletion requires confirmation, supports cancellation, clears every game field and permits fresh signup", async ({
  page,
}) => {
  await showRoll(page, 1337);
  await register(page);
  await nav(page, "Shop");
  await buy(page, "starfall");
  const before = await saved(page);
  await openDelete(page);
  await expect(
    page.getByRole("button", { name: "Permanently delete" }),
  ).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(
    page.getByRole("button", { name: "Permanently delete" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await saved(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Delete account & progress", exact: true })
    .click();
  await confirmDelete(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  expect(await saved(page)).toBeNull();
  await expect(page.getByTestId("wallet-balance")).toHaveText("0 EP");
  await expect(page.locator('[data-product="starfall"] button')).toBeDisabled();
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toHaveCount(0);
  await nav(page, "Badges");
  await expect(page.locator(".badge-card")).toHaveCount(0);
  await page.reload();
  expect(await saved(page)).toBeNull();
  await register(page);
  expect(await saved(page)).toMatchObject({
    balance: 0,
    totalEarned: 0,
    owned: [],
    discovered: [],
    history: [],
    receipts: [],
    cooldownUntil: 0,
    equipped: "none",
  });
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
});

test("failed deletion leaves the account and complete history intact and supports retry", async ({
  page,
}) => {
  await showRoll(page, 604827);
  await register(page);
  const before = await saved(page);
  await page.evaluate((key) => {
    window.restoreRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k) {
      if (k === key) throw new DOMException("Blocked", "SecurityError");
      return window.restoreRemove.call(this, k);
    };
  }, PROGRESS_KEY);
  await openDelete(page);
  await confirmDelete(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Deletion failed",
  );
  expect(await saved(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Your profile", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.removeItem = window.restoreRemove;
  });
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  expect(await saved(page)).toBeNull();
});

test("deleting in another tab cancels an active reveal and clears its temporary cooldown state", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await register(page);
  await startRoll(page, 1337);
  await page.clock.runFor(3000);
  const other = await context.newPage();
  await other.goto("/");
  await openDelete(other);
  await confirmDelete(other);
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".number-artifact")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward(60000);
  expect(await saved(page)).toBeNull();
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toHaveCount(0);
  await other.close();
});

test("a stale tab missing the deletion storage event cannot resurrect the account on completion", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await register(page);
  await startRoll(page, 1337);
  await page.evaluate(() =>
    window.addEventListener(
      "storage",
      (e) => e.stopImmediatePropagation(),
      true,
    ),
  );
  const other = await context.newPage();
  await other.goto("/");
  await openDelete(other);
  await confirmDelete(other);
  await page.clock.fastForward(45010);
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  expect(await saved(page)).toBeNull();
  await expect(page.locator(".number-artifact")).toHaveCount(0);
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toHaveCount(0);
  await other.close();
});

test("no demo best roll, fake players or UI Preview labels remain", async ({
  page,
}) => {
  for (const hash of ["", "#history", "#shop", "#badges"]) {
    await page.goto("/" + hash);
    await expect(
      page.locator(".best-card,.best-number,.profile-number,.preview-label"),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        /TODAY’S BEST ROLL|UI preview|wrongtypeofhero|76,593 rolls/,
      ),
    ).toHaveCount(0);
  }
});

test("failed purchases add no transactions; failed draw commits reveal no new number", async ({
  page,
}) => {
  await page.goto("/");
  await register(page);
  await showRoll(page, 1337);
  const before = await saved(page);
  await page.evaluate((key) => {
    window.restoreWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("Full", "QuotaExceededError");
      return window.restoreWrite.call(this, k, v);
    };
  }, PROGRESS_KEY);
  await nav(page, "Shop");
  await page.locator('[data-product="starfall"] button').click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "has not been spent",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await saved(page)).toEqual(before);
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await page.clock.install();
  await page.clock.fastForward(105100);
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await nav(page, "History");
  await expect(page.locator('[data-event-type="roll"]')).toHaveCount(1);
  await expect(page.locator('[data-event-type="purchase"]')).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.restoreWrite;
  });
  await nav(page, "Shop");
  await buy(page, "starfall");
  expect(
    (await saved(page)).history.filter((e) => e.type === "roll"),
  ).toHaveLength(1);
  expect(
    (await saved(page)).history.filter((e) => e.type === "purchase"),
  ).toHaveLength(1);
});

test("a draw queued behind account deletion cannot recreate progress or leave a cooldown", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await register(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  const other = await context.newPage();
  await other.goto("/");
  await openDelete(other);
  await page.evaluate(async (key) => {
    let ready;
    const acquired = new Promise((r) => (ready = r)),
      gate = new Promise((r) => (window.releaseDeletionLock = r));
    navigator.locks.request(key, () => {
      ready();
      return gate;
    });
    await acquired;
  }, PROGRESS_KEY);
  await confirmDelete(other);
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.locks.query()).pending.length),
    )
    .toBe(1);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "DRAWING…", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.locks.query()).pending.length),
    )
    .toBe(2);
  await page.evaluate(() => window.releaseDeletionLock());
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  expect(await saved(page)).toBeNull();
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toHaveCount(0);
  await other.close();
});
