import { test, expect } from "@playwright/test";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  shopProducts,
  rollSettings,
  formatDuration,
} from "../src/shop-data.js";
import {
  buildRevealTimeline,
  buildReferenceTimeline,
} from "../src/roll-timeline.js";
import { showRoll, startRoll } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const nav = (page, name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
async function buy(page, id) {
  await page.locator(`[data-product="${id}"] button`).click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function signup(page, name = "Lucky_Player") {
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("textbox", { name: "Username", exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create local profile", exact: true })
    .click();
}

test("fixed reveal duration preserves choreography across digit counts, badge counts and tiers", () => {
  expect(rollSettings()).toEqual({ rollMS: 45000, cooldownMS: 60000 });
  for (const duration of [45000, 35000, 25000, 15000])
    for (const digits of [1, 4, 6, 7])
      for (const badges of [0, 1, 10, 17]) {
        const t = buildRevealTimeline(digits, badges, duration),
          ref = buildReferenceTimeline(digits, badges);
        expect(t.end).toBe(duration);
        expect(t.digitTimes[0]).toBeCloseTo((2000 * duration) / ref.end);
        expect(t.rarity).toBeLessThan(t.stats);
        expect(t.sessionCount + 1500 * t.scale).toBeLessThan(t.end);
        expect(t.settleMS).toBeCloseTo(400 * t.scale);
        expect(t.pulseMS).toBeCloseTo(700 * t.scale);
      }
  expect(formatDuration(60)).toBe("1:00");
  expect(formatDuration(59)).toBe("0:59");
  expect(formatDuration(59.5)).toBe("1:00");
  expect(formatDuration(15)).toBe("0:15");
  expect(formatDuration(0)).toBe("0:00");
});

test("upgrade tiers require predecessors, deduct once and never equip as an aura", () => {
  let state = {
    ...emptyProgress(),
    balance: 50000000,
    totalEarned: 50000000,
    owned: ["starfall"],
    equipped: "starfall",
  };
  for (const id of ["quickwind-2", "quickwind-3", "clockwork-2", "clockwork-3"])
    expect(() => applyProgress(state, { type: "buy", id })).toThrow("Requires");
  for (const product of shopProducts.filter((p) =>
    ["roll", "cooldown"].includes(p.kind),
  )) {
    const balance = state.balance;
    state = applyProgress(state, { type: "buy", id: product.id });
    expect(state.balance).toBe(balance - product.price);
    expect(state.equipped).toBe("starfall");
    expect(() => applyProgress(state, { type: "buy", id: product.id })).toThrow(
      "already own",
    );
    expect(() =>
      applyProgress(state, { type: "equip", id: product.id }),
    ).toThrow("aura");
    expect(
      rollSettings(state.owned)[
        product.kind === "roll" ? "rollMS" : "cooldownMS"
      ],
    ).toBe(product.value);
  }
  expect(rollSettings(state.owned)).toEqual({
    rollMS: 15000,
    cooldownMS: 5000,
  });
  const parsed = parseProgress(
    JSON.stringify({
      ...state,
      owned: ["quickwind-2", "quickwind-3", "clockwork-3"],
      equipped: "quickwind-3",
    }),
  );
  expect(parsed.owned).toEqual([]);
  expect(parsed.equipped).toBe("none");
});

test("guest rewards and purchases stay in memory and disappear on reload", async ({
  page,
}) => {
  await showRoll(page, 1337);
  await nav(page, "Shop");
  await expect(page.getByTestId("wallet-balance")).toHaveText("100,177,458 EP");
  await buy(page, "quickwind-1");
  await buy(page, "starfall");
  await expect(page.getByTestId("roll-duration")).toHaveText("35s");
  expect(await saved(page)).toBeNull();
  await page.reload();
  await expect(page.getByTestId("wallet-balance")).toHaveText("0 EP");
  await expect(page.getByTestId("roll-duration")).toHaveText("45s");
  await expect(page.locator('[data-product="starfall"] button')).toBeDisabled();
  await nav(page, "Badges");
  await expect(page.locator(".badge-card")).toHaveCount(0);
  expect(await saved(page)).toBeNull();
});

test("signup saves existing guest rewards, purchases, discoveries, equipment and cooldown together", async ({
  page,
}) => {
  await showRoll(page, 1337);
  await nav(page, "Shop");
  await buy(page, "quickwind-1");
  await buy(page, "clockwork-1");
  await buy(page, "aurora");
  expect(await saved(page)).toBeNull();
  await signup(page);
  await expect(
    page.getByRole("heading", { name: "Your profile, Lucky_Player" }),
  ).toBeVisible();
  const p = await saved(page);
  expect(p.profile.username).toBe("Lucky_Player");
  expect(p.balance).toBe(99782458);
  expect(p.totalEarned).toBe(100177458);
  expect(p.discovered).toHaveLength(17);
  expect(p.owned).toEqual(["quickwind-1", "clockwork-1", "aurora"]);
  expect(p.equipped).toBe("aurora");
  expect(p.receipts).toHaveLength(1);
  expect(p.cooldownUntil).toBeGreaterThan(Date.now());
  await page.reload();
  expect(await saved(page)).toEqual(p);
  await expect(page.getByTestId("roll-duration")).toHaveText("35s");
  await expect(page.getByTestId("cooldown-duration")).toHaveText("0:45");
  await expect(
    page.getByRole("button", { name: "Your profile", exact: true }),
  ).toBeVisible();
  await nav(page, "Badges");
  await expect(page.locator(".badge-card")).toHaveCount(17);
});

test("invalid or failed signup never creates a profile or discards guest progress; retry saves it", async ({
  page,
}) => {
  await showRoll(page, 604827);
  await signup(page, "bad name");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "3–20",
  );
  expect(await saved(page)).toBeNull();
  await page.evaluate((key) => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("Full", "QuotaExceededError");
      return window.restoreStorage.call(this, k, v);
    };
  }, PROGRESS_KEY);
  await page.getByRole("textbox", { name: "Username" }).fill("Lucky_Retry");
  await page.getByRole("button", { name: "Create local profile" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "guest progress is still available",
  );
  expect(await saved(page)).toBeNull();
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.restoreStorage;
  });
  await page.getByRole("button", { name: "Create local profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile, Lucky_Retry" }),
  ).toBeVisible();
  expect((await saved(page)).balance).toBe(4663);
});

test("another tab signing up neither discards a guest game nor silently saves it", async ({
  page,
  context,
}) => {
  await showRoll(page, 1337);
  await nav(page, "Shop");
  const other = await context.newPage();
  await other.goto("/");
  await signup(other, "OtherPlayer");
  await expect(
    other.getByRole("heading", { name: "Your profile, OtherPlayer" }),
  ).toBeVisible();
  await expect(page.getByTestId("wallet-balance")).toHaveText("100,177,458 EP");
  await buy(page, "quickwind-1");
  expect((await saved(page)).balance).toBe(0);
  expect((await saved(page)).owned).toEqual([]);
  await signup(page, "GuestPlayer");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "another tab",
  );
  expect((await saved(page)).profile.username).toBe("OtherPlayer");
  await other.close();
});

test("base reveal completes at forty-five seconds, then waits a full sixty seconds", async ({
  page,
}) => {
  await seedProgress(page);
  await startRoll(page, 1337);
  await page.clock.runFor(44800);
  expect((await saved(page)).receipts).toHaveLength(0);
  await expect(page.locator(".roll-experience")).not.toHaveAttribute(
    "data-phase",
    "complete",
  );
  await page.clock.runFor(250);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect.poll(async () => (await saved(page)).receipts.length).toBe(1);
  const until = (await saved(page)).cooldownUntil;
  const remaining = await page.evaluate((until) => until - Date.now(), until);
  expect(remaining).toBeGreaterThan(59500);
  expect(remaining).toBeLessThanOrEqual(60000);
  await page.clock.fastForward(59000);
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await page.clock.fastForward(1100);
  await expect(
    page.getByRole("button", { name: "ROLL AGAIN", exact: true }),
  ).toBeEnabled();
});

test("the first three tiers produce a fifteen-second reveal and fifteen-second cooldown after reload", async ({
  page,
}) => {
  await seedProgress(page, { balance: 15000000, totalEarned: 15000000 });
  await page.goto("/#shop");
  await expect(page.locator('[data-product="quickwind-2"] button')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-product="clockwork-3"] button')).toHaveCount(
    0,
  );
  for (const p of shopProducts.filter(
    (p) => ["roll", "cooldown"].includes(p.kind) && !p.lateGame,
  ))
    await buy(page, p.id);
  expect((await saved(page)).balance).toBe(11730000);
  expect((await saved(page)).equipped).toBe("none");
  await page.reload();
  await expect(page.getByTestId("roll-duration")).toHaveText("15s");
  await expect(page.getByTestId("cooldown-duration")).toHaveText("0:15");
  await startRoll(page, 1337);
  await page.clock.runFor(14800);
  expect((await saved(page)).receipts).toHaveLength(0);
  await page.clock.runFor(250);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect.poll(async () => (await saved(page)).receipts.length).toBe(1);
  const until = (await saved(page)).cooldownUntil;
  expect(await page.evaluate((t) => t - Date.now(), until)).toBeGreaterThan(
    14500,
  );
  await page.clock.fastForward(14000);
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await page.clock.fastForward(1100);
  await expect(
    page.getByRole("button", { name: "ROLL AGAIN", exact: true }),
  ).toBeEnabled();
});

test("purchasing during a reveal or cooldown affects only rolls started afterward", async ({
  page,
}) => {
  await seedProgress(page, { balance: 15000000, totalEarned: 15000000 });
  await startRoll(page, 1337);
  await page.clock.runFor(1000);
  await nav(page, "Shop");
  await buy(page, "quickwind-1");
  await buy(page, "clockwork-1");
  await page.clock.runFor(42800);
  expect((await saved(page)).receipts).toHaveLength(0);
  await page.clock.runFor(1300);
  await expect.poll(async () => (await saved(page)).receipts.length).toBe(1);
  const deadline = (await saved(page)).cooldownUntil;
  expect(await page.evaluate((t) => t - Date.now(), deadline)).toBeGreaterThan(
    59500,
  );
  await buy(page, "quickwind-2");
  await buy(page, "clockwork-2");
  expect((await saved(page)).cooldownUntil).toBe(deadline);
  await page.clock.fastForward(60100);
  await page.getByRole("button", { name: "Back to rolling" }).click();
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await page.clock.runFor(24800);
  expect((await saved(page)).receipts).toHaveLength(1);
  await page.clock.runFor(250);
  await expect.poll(async () => (await saved(page)).receipts.length).toBe(2);
  expect(
    await page.evaluate(
      (t) => t - Date.now(),
      (await saved(page)).cooldownUntil,
    ),
  ).toBeGreaterThan(29500);
});
