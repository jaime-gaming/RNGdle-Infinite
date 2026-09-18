import { test, expect } from "@playwright/test";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  shopProducts,
  rollSettings,
  offlineSettings,
  nextUpgrade,
} from "../src/shop-data.js";
import { flywheelForDraw, flywheelRequired } from "../src/flywheel.js";
import { offlinePlan, parseOffline } from "../src/offline.js";
import { cooldownFraction } from "../src/cooldown.js";
import { recommendedGoal } from "../src/gameplay-loop.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { mockRandom, startRoll } from "./helpers/random-roll.js";
const timings = shopProducts
  .filter((p) => ["roll", "cooldown"].includes(p.kind))
  .map((p) => p.id);
const clocks = ["offline-roller", "offline-clock-1", "offline-clock-2"];
const pace = ["flywheel", "flywheel-2", "flywheel-3"];
const saved = (p) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k)), PROGRESS_KEY);
const rows = (p) => p.history.filter((e) => e.type === "roll");
const rich = (extra = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 200000000,
  totalEarned: 200000000,
  ...extra,
});
const buy = (p, id, at = 1000) => applyProgress(p, { type: "buy", id, at });
const nav = (p, name) =>
  p.getByRole("navigation").getByRole("button", { name, exact: true }).click();
async function purchase(page, id) {
  await page.locator(`[data-product="${id}"] button`).click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function collected(page, n) {
  await expect
    .poll(async () => rows(await saved(page)).length, { timeout: 20000 })
    .toBe(n);
  await expect.poll(async () => (await saved(page)).offline.batch).toBeNull();
}

test("all six late tiers require their predecessor, charge exactly once and preserve old transaction prices", () => {
  let p = rich({
    history: [
      {
        id: "legacy",
        type: "purchase",
        at: 1,
        productId: "quickwind-1",
        name: "Quickwind I",
        ep: 75000,
      },
    ],
  });
  for (const item of shopProducts.filter((p) => p.lateGame))
    expect(() => buy(p, item.id)).toThrow("Requires");
  for (const item of shopProducts) {
    const before = p.balance;
    p = buy(p, item.id);
    expect(p.balance).toBe(before - item.price);
    expect(() => buy(p, item.id)).toThrow("already own");
    p = parseProgress(JSON.stringify(p));
  }
  expect(p.history[0].ep).toBe(75000);
  expect(p.history).toHaveLength(24);
  expect(rollSettings(p.owned)).toEqual({ rollMS: 15000, cooldownMS: 5000 });
  expect(offlineSettings(p.owned).intervalMS).toBe(300000);
  expect(flywheelRequired(p.owned)).toBe(1);
  expect(p.equipped).toBe("prism");
  for (const kind of ["roll", "cooldown", "pace", "offline"])
    expect(p.owned).toContain(nextUpgrade(p.owned, kind).id);
});

test("deep orphan chains are pruned fully, independent of ownership order", () => {
  const orphan = [
    "clockwork-2",
    "clockwork-3",
    "clockwork-4",
    "clockwork-5",
    "flywheel-2",
    "flywheel-3",
    "offline-clock-1",
    "offline-clock-2",
  ];
  for (const owned of [orphan, [...orphan].reverse()])
    expect(parseProgress(JSON.stringify(rich({ owned }))).owned).toEqual([]);
  const parsed = parseProgress(
    JSON.stringify(rich({ owned: [...pace], flywheelCharge: 4 })),
  );
  expect(parsed.flywheelCharge).toBe(1);
  expect(parsed.balance).toBe(200000000);
});

for (const cooldownMS of [10000, 5000])
  test(`${cooldownMS / 1000}s cooldown commitments and halfway fills survive parsing`, () => {
    const pendingRoll = {
      id: "new-tier",
      number: 604827,
      startedAt: 1000,
      rollMS: 15000,
      cooldownMS,
    };
    const p = parseProgress(
      JSON.stringify(
        rich({
          owned: timings,
          pendingRoll,
          cooldownUntil: 16000 + cooldownMS,
        }),
      ),
    );
    expect(p.pendingRoll).toEqual(pendingRoll);
    expect(cooldownFraction(p.cooldownWindow, 16000 + cooldownMS / 2)).toBe(
      0.5,
    );
    expect(cooldownFraction(p.cooldownWindow, 1000)).toBe(0);
    expect(cooldownFraction(p.cooldownWindow, 16000 + cooldownMS)).toBe(1);
  });

test("useful recommendations combine tools with pace tiers instead of prioritising expensive clocks", () => {
  let p = rich({
    owned: [
      ...timings.filter((id) => !["clockwork-4", "clockwork-5"].includes(id)),
      "flywheel",
    ],
  });
  expect(recommendedGoal(p).id).toBe("flywheel-2");
  p.owned.push("flywheel-2");
  expect(recommendedGoal(p).id).toBe("auto-roll");
  p.owned.push("auto-roll");
  expect(recommendedGoal(p).id).toBe("clockwork-4");
  p.owned.push("clockwork-4");
  expect(recommendedGoal(p).id).toBe("offline-roller");
  expect(recommendedGoal({ ...p, profile: null }).id).toBe("flywheel-3");
});

for (const [owned, required] of [
  [pace.slice(0, 2), 2],
  [pace, 1],
])
  test(`Flywheel ${required}-charge rhythm excludes boosts, offline and duplicate completions`, () => {
    let p = rich({ owned });
    for (let n = 0; n < (required + 1) * 3; n++) {
      const boost = n % (required + 1) === required,
        id = `roll-${n}`;
      expect(flywheelForDraw(p)).toBe(boost ? "boost" : "charge");
      // The committed draw consumes a boost; this test exercises settlement rules.
      p = {
        ...p,
        flywheelCharge: boost ? 0 : p.flywheelCharge,
        pendingRoll: {
          id,
          number: 604827,
          startedAt: 1000,
          rollMS: 45000,
          cooldownMS: boost ? 0 : 60000,
          flywheel: boost ? "boost" : "charge",
        },
      };
      const action = {
        type: "complete",
        id,
        result: evaluate(604827),
        at: 46000,
        cooldownUntil: boost ? 46000 : 106000,
      };
      p = applyProgress(p, action);
      expect(applyProgress(p, action)).toBe(p);
      expect(p.flywheelCharge).toBe(boost ? 0 : (n % (required + 1)) + 1);
      const before = p.flywheelCharge;
      p = applyProgress(p, {
        ...action,
        id: `offline-${n}`,
        source: "offline",
      });
      expect(p.flywheelCharge).toBe(before);
      p = parseProgress(JSON.stringify(p));
    }
    expect(rows(p).filter((e) => e.flywheel === "boost")).toHaveLength(3);
  });

test("pace purchases preserve earned charge up to the new capacity and never rewrite a committed roll", () => {
  const pendingRoll = {
    id: "old",
    number: 604827,
    startedAt: 1000,
    rollMS: 45000,
    cooldownMS: 60000,
    flywheel: "charge",
  };
  let p = rich({
    owned: ["flywheel"],
    flywheelCharge: 3,
    pendingRoll,
    cooldownUntil: 106000,
  });
  p = buy(p, "flywheel-2");
  expect(p.flywheelCharge).toBe(2);
  expect(flywheelForDraw(p)).toBe("boost");
  p = buy(p, "flywheel-3");
  expect(p.flywheelCharge).toBe(1);
  expect(p.pendingRoll).toEqual(pendingRoll);
  expect(p.cooldownUntil).toBe(106000);
});

for (const intervalMS of [600000, 450000, 300000])
  test(`offline ${intervalMS / 60000}-minute periods keep whole-roll rounding, visibility rules and the 144 cap`, () => {
    const now = 100000000;
    const plan = (age, presence = [], visible = true) =>
      offlinePlan(
        { lastSeenAt: now - age },
        now,
        presence,
        "mine",
        visible,
        intervalMS,
      );
    expect(plan(intervalMS - 1).count).toBe(0);
    expect(plan(intervalMS).count).toBe(1);
    expect(plan(intervalMS * 144).count).toBe(144);
    expect(plan(intervalMS * 1000).count).toBe(144);
    expect(plan(-1).count).toBe(0);
    expect(plan(intervalMS * 2, [], false).count).toBe(0);
    expect(
      plan(intervalMS * 2, [{ id: "other", at: now - 1000, visible: true }])
        .count,
    ).toBe(0);
  });

test("offline upgrades are profile gated and cannot discard or re-rate owed batches; saved summaries remain intact", () => {
  const report = { id: "paid", at: 1000, rolls: 1, ep: 4663, newBadges: 0 };
  const p = rich({
    owned: ["offline-roller"],
    offline: { lastSeenAt: 1000, batch: null, report },
  });
  expect(() => buy({ ...p, profile: null }, "offline-clock-1")).toThrow(
    "profile",
  );
  expect(() => buy(p, "offline-clock-1", 601000)).toThrow(
    "Restore offline rewards",
  );
  const batch = {
    id: "old",
    since: 0,
    numbers: [604827],
    index: 0,
    ep: 0,
    newBadges: 0,
  };
  expect(() =>
    buy({ ...p, offline: { ...p.offline, batch } }, "offline-clock-1"),
  ).toThrow("Restore offline rewards");
  const bought = buy(p, "offline-clock-1", 600999);
  expect(bought.offline).toEqual({ lastSeenAt: 600999, batch: null, report });
  expect(
    offlinePlan(bought.offline, 600999 + 449999, [], "mine", true, 450000)
      .count,
  ).toBe(0);
  expect(p.balance).toBe(200000000);
  expect(p.offline.lastSeenAt).toBe(1000);
});

test("batch interval snapshots accept only supported rates and preserve legacy ten-minute batches", () => {
  const value = {
    lastSeenAt: 10000000,
    batch: {
      id: "batch",
      since: 1000,
      numbers: [604827],
      index: 0,
      ep: 0,
      newBadges: 0,
    },
    report: null,
  };
  expect(parseOffline(value, clocks)).toEqual(value);
  for (const intervalMS of [600000, 450000, 300000])
    expect(
      parseOffline({ ...value, batch: { ...value.batch, intervalMS } }, clocks)
        .batch.intervalMS,
    ).toBe(intervalMS);
  for (const intervalMS of [0, 1, 299999, 450001, "300000", -1])
    expect(() =>
      parseOffline({ ...value, batch: { ...value.batch, intervalMS } }, clocks),
    ).toThrow("Invalid offline commitment");
  expect(() => offlinePlan(value, 1000, [], "mine", true, 0)).toThrow(
    "Invalid offline interval",
  );
});

test("mobile shop exposes only the next tier, confirms exact effects and persists all late upgrades", async ({
  page,
}) => {
  const owned = [
    ...timings.filter((id) => !["clockwork-4", "clockwork-5"].includes(id)),
    "flywheel",
    "offline-roller",
  ];
  await seedProgress(page, rich({ owned }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#shop");
  for (const id of ["clockwork-5", "flywheel-3", "offline-clock-2"])
    await expect(page.locator(`[data-product="${id}"]`)).toHaveCount(0);
  for (const id of [
    "clockwork-4",
    "clockwork-5",
    "flywheel-2",
    "flywheel-3",
    "offline-clock-1",
    "offline-clock-2",
  ])
    await purchase(page, id);
  expect((await saved(page)).balance).toBe(119000000);
  await page.reload();
  await expect(page.getByTestId("cooldown-duration")).toHaveText("0:05");
  await expect(page.locator('[data-product="offline-roller"]')).toContainText(
    "5 minutes away",
  );
  await expect(page.locator('[data-product="offline-clock-2"]')).toContainText(
    "Maximum level reached",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Flywheel charge" }),
  ).toHaveAttribute("max", "1");
});

test("a late cooldown purchase keeps the current 10-second commitment and uses 5 seconds only on the next draw", async ({
  page,
}) => {
  await seedProgress(
    page,
    rich({ owned: timings.filter((id) => id !== "clockwork-5") }),
  );
  await startRoll(page, 604827);
  const before = await saved(page);
  expect(before.pendingRoll.cooldownMS).toBe(10000);
  await nav(page, "Shop");
  await purchase(page, "clockwork-5");
  expect((await saved(page)).pendingRoll).toEqual(before.pendingRoll);
  expect((await saved(page)).cooldownUntil).toBe(before.cooldownUntil);
  await page.clock.runFor(15100);
  await expect.poll(async () => rows(await saved(page)).length).toBe(1);
  await page.clock.fastForward(10100);
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await page.locator(".generate").click();
  await expect
    .poll(async () => (await saved(page)).pendingRoll?.cooldownMS)
    .toBe(5000);
  const current = (await saved(page)).pendingRoll;
  await page.reload();
  expect((await saved(page)).pendingRoll).toEqual(current);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => rows(await saved(page)).length).toBe(2);
  expect((await saved(page)).cooldownWindow).toEqual({
    startsAt: current.startedAt + 15000,
    endsAt: current.startedAt + 20000,
  });
  await expect(page.locator(".generate")).toBeDisabled();
});

for (const [owned, count] of [
  [clocks.slice(0, 2), 8],
  [clocks, 12],
])
  test(`an hour away earns ${count} ordinary rolls at the purchased offline rate, without Flywheel charge`, async ({
    page,
  }) => {
    const since = Date.now() - 3601000;
    await seedProgress(page, {
      owned: [...owned, ...pace],
      flywheelCharge: 1,
      offline: { lastSeenAt: since, batch: null, report: null },
    });
    await mockRandom(page, [604827]);
    await page.goto("/");
    await collected(page, count);
    const p = await saved(page),
      intervalMS = offlineSettings(owned).intervalMS;
    expect(p.balance).toBe(count * 4663);
    expect(p.flywheelCharge).toBe(1);
    expect(rows(p).map((e) => e.at)).toEqual(
      Array.from({ length: count }, (_, i) => since + (i + 1) * intervalMS),
    );
    await page.reload();
    expect(rows(await saved(page))).toHaveLength(count);
  });

for (const intervalMS of [undefined, 450000])
  test(`interrupted ${intervalMS ?? 600000}ms batches retain original timestamps even with the final clock owned`, async ({
    page,
  }) => {
    const now = Date.now(),
      since = now - 1200000;
    const batch = {
      id: "committed",
      since,
      numbers: [604827, 604827],
      index: 0,
      ep: 0,
      newBadges: 0,
      ...(intervalMS ? { intervalMS } : {}),
    };
    await seedProgress(page, {
      owned: clocks,
      offline: { lastSeenAt: now, batch, report: null },
    });
    await page.goto("/");
    await collected(page, 2);
    expect(rows(await saved(page)).map((e) => e.at)).toEqual([
      since + (intervalMS ?? 600000),
      since + 2 * (intervalMS ?? 600000),
    ]);
    expect((await saved(page)).balance).toBe(9326);
  });

test("final offline clock reaches the same 144-roll cap in 12 hours and cannot double-credit on reload", async ({
  page,
}) => {
  await seedProgress(page, {
    owned: clocks,
    offline: { lastSeenAt: Date.now() - 43201000, batch: null, report: null },
  });
  await mockRandom(page, [604827]);
  await page.goto("/");
  await collected(page, 144);
  expect((await saved(page)).balance).toBe(144 * 4663);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Offline rewards" }),
  ).toContainText("144 rolls");
  expect(rows(await saved(page))).toHaveLength(144);
});

test("two tabs cannot purchase a late Flywheel tier twice or lose the earned charge", async ({
  page,
  context,
}) => {
  await seedProgress(page, rich({ owned: ["flywheel"], flywheelCharge: 3 }));
  await page.goto("/#shop");
  const other = await context.newPage();
  await other.goto("/#shop");
  for (const p of [page, other])
    await p.locator('[data-product="flywheel-2"] button').click();
  await Promise.all(
    [page, other].map((p) =>
      p.getByRole("button", { name: "Confirm purchase", exact: true }).click(),
    ),
  );
  await expect
    .poll(async () => (await saved(page)).owned.includes("flywheel-2"))
    .toBe(true);
  const p = await saved(page);
  expect(p.balance).toBe(196000000);
  expect(p.flywheelCharge).toBe(2);
  expect(
    p.history.filter(
      (e) => e.type === "purchase" && e.productId === "flywheel-2",
    ),
  ).toHaveLength(1);
  await other.close();
});

test("final Flywheel boost survives reload and reduced motion still reserves all fifteen seconds", async ({
  page,
}) => {
  await seedProgress(page, { owned: [...timings, ...pace], flywheelCharge: 1 });
  await startRoll(page, 604827);
  const before = await saved(page);
  expect(before.pendingRoll).toMatchObject({
    rollMS: 15000,
    cooldownMS: 0,
    flywheel: "boost",
  });
  expect(before.flywheelCharge).toBe(0);
  await page.reload();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.runFor(50);
  await expect.poll(async () => rows(await saved(page)).length).toBe(1);
  expect((await saved(page)).balance).toBe(4663);
  expect((await saved(page)).cooldownUntil).toBe(
    before.pendingRoll.startedAt + 15000,
  );
  await expect(page.locator(".generate")).toBeDisabled();
  await page.clock.fastForward(15100);
  await page.locator(".generate").click();
  await expect.poll(async () => rows(await saved(page)).length).toBe(2);
  const p = await saved(page);
  expect(p.flywheelCharge).toBe(1);
  expect(p.cooldownWindow.endsAt - p.cooldownWindow.startsAt).toBe(5000);
  expect(rows(p)[1].flywheel).toBe("charge");
});

test("failed late-tier saves leave wallet, charge and offline rate unchanged until a successful retry", async ({
  page,
}) => {
  await seedProgress(
    page,
    rich({ owned: ["flywheel", "offline-roller"], flywheelCharge: 3 }),
  );
  await page.goto("/#shop");
  await expect
    .poll(async () => (await saved(page)).offline?.lastSeenAt)
    .toBeTruthy();
  await page.evaluate((key) => {
    const write = Storage.prototype.setItem;
    window.failLate = true;
    Storage.prototype.setItem = function (k, v) {
      if (
        k === key &&
        window.failLate &&
        JSON.parse(v).owned.some((id) =>
          ["flywheel-2", "offline-clock-1"].includes(id),
        )
      )
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  }, PROGRESS_KEY);
  for (const id of ["flywheel-2", "offline-clock-1"]) {
    await page.locator(`[data-product="${id}"] button`).click();
    await page
      .getByRole("button", { name: "Confirm purchase", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Your EP has not been spent",
    );
    const p = await saved(page);
    expect(p.balance).toBe(200000000);
    expect(p.owned).toEqual(["flywheel", "offline-roller"]);
    expect(p.flywheelCharge).toBe(3);
    expect(p.history).toEqual([]);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.evaluate(() => {
    window.failLate = false;
  });
  await purchase(page, "flywheel-2");
  await purchase(page, "offline-clock-1");
  expect((await saved(page)).balance).toBe(184000000);
  expect((await saved(page)).flywheelCharge).toBe(2);
  await page.reload();
  expect((await saved(page)).owned).toEqual([
    "flywheel",
    "offline-roller",
    "flywheel-2",
    "offline-clock-1",
  ]);
});
