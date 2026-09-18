import { test, expect } from "@playwright/test";
import {
  emptyProgress,
  parsePending,
  parseProgress,
  applyProgress,
  recoverUnsavedRolls,
  PROGRESS_KEY,
} from "../src/progress.js";
import { seedProgress } from "./helpers/progress.js";
import { startRoll, showRoll, mockRandom } from "./helpers/random-roll.js";
import { evaluate, inflate } from "./helpers/index.js";
import manifest from "../src/data/game-index.json" with { type: "json" };
const guestKey = "rng-infinite-guest-roll-v1";
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
const guest = (page) =>
  page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), guestKey);
const settled = (page) =>
  expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
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

test("registered refresh resumes the committed number and never resets its deadline or pays twice", async ({
  page,
}) => {
  await seedProgress(page);
  await startRoll(page, 604827);
  await page.clock.runFor(2500);
  const before = await saved(page);
  expect(before.pendingRoll.number).toBe(604827);
  expect(before.balance).toBe(0);
  await page.reload();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  expect((await saved(page)).pendingRoll).toEqual(before.pendingRoll);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  const after = await saved(page);
  expect(after.balance).toBe(4663);
  expect(after.cooldownUntil).toBe(before.cooldownUntil);
  expect(
    after.history.filter((e) => e.type === "roll").map((e) => e.id),
  ).toEqual([before.pendingRoll.id]);
  await page.reload();
  expect((await saved(page)).balance).toBe(4663);
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
});

test("guest refresh cannot discard a number or cooldown, but does not persist the wallet", async ({
  page,
}) => {
  await startRoll(page, 1337);
  const before = await guest(page);
  expect(await saved(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  expect((await guest(page)).pendingRoll).toEqual(before.pendingRoll);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  expect((await guest(page)).pendingRoll).toBeNull();
  expect((await guest(page)).cooldownUntil).toBe(before.cooldownUntil);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await nav(page, "History");
  await expect(page.locator(".activity-event")).toHaveCount(0);
  expect(await saved(page)).toBeNull();
});

test("simultaneous account tabs join one committed roll and credit only once", async ({
  page,
  context,
}) => {
  await seedProgress(page);
  await mockRandom(page, [604827]);
  await page.goto("/");
  const other = await context.newPage();
  await mockRandom(other, [1337]);
  await other.goto("/");
  for (const p of [page, other])
    await expect(
      p.getByRole("button", { name: "GENERATE", exact: true }),
    ).toBeEnabled();
  await Promise.all(
    [page, other].map((p) =>
      p
        .getByRole("button", { name: "GENERATE", exact: true })
        .evaluate((b) => b.click()),
    ),
  );
  for (const p of [page, other])
    await expect(p.locator(".roll-experience")).toHaveAttribute(
      "data-phase",
      "digits",
    );
  const pending = (await saved(page)).pendingRoll;
  expect((await saved(other)).pendingRoll).toEqual(pending);
  await Promise.all(
    [page, other].map((p) => p.emulateMedia({ reducedMotion: "reduce" })),
  );
  for (const p of [page, other]) await settled(p);
  const after = await saved(page);
  expect(after.history.filter((e) => e.type === "roll")).toHaveLength(1);
  expect(after.balance).toBe(evaluate(pending.number).totalEP);
  expect(after.cooldownUntil).toBe(
    pending.startedAt + pending.rollMS + pending.cooldownMS,
  );
  await other.close();
});

test("reduced-motion toggling reveals accessibly without shortening the full roll cycle", async ({
  page,
}) => {
  await seedProgress(page);
  await startRoll(page, 1337);
  const before = await saved(page);
  await page.clock.runFor(1000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect((await saved(page)).cooldownUntil).toBe(before.cooldownUntil);
  await page.clock.fastForward(60000);
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await page.clock.fastForward(44100);
  await expect(
    page.getByRole("button", { name: "ROLL AGAIN", exact: true }),
  ).toBeEnabled();
});

test("invalid pending data is rejected, and temporary recovery never restores spent EP", () => {
  const p = {
    id: "run",
    number: 1337,
    startedAt: 1000,
    rollMS: 45000,
    cooldownMS: 60000,
  };
  expect(parsePending(p)).toEqual(p);
  for (const changes of [
    { number: -1 },
    { number: 1000001 },
    { rollMS: 0 },
    { cooldownMS: 1 },
    { id: "" },
    { startedAt: NaN },
  ])
    expect(() => parsePending({ ...p, ...changes })).toThrow();
  const base = applyProgress(emptyProgress(), {
    type: "complete",
    id: "first",
    result: evaluate(1337),
    cooldownUntil: 0,
    at: 1000,
  });
  const temporary = applyProgress(base, {
    type: "complete",
    id: "second",
    result: evaluate(604827),
    cooldownUntil: 200000,
    at: 2000,
  });
  const spent = applyProgress(base, { type: "buy", id: "starfall", at: 3000 });
  const recovered = recoverUnsavedRolls(spent, temporary);
  expect(recovered.balance).toBe(base.balance - 50000 + 4663);
  expect(recovered.owned).toEqual(["starfall"]);
  expect(recovered.history.filter((e) => e.type === "purchase")).toHaveLength(
    1,
  );
  expect(recoverUnsavedRolls(recovered, temporary)).toBe(recovered);
});

test("GODLY starts at 500,000 EP with exact population odds, ten seeded stars and the supplied palette", async ({
  page,
}) => {
  expect(manifest.tiers.findLast((t) => 499999 >= t.minEP).id).toBe("mythic");
  expect(manifest.tiers.findLast((t) => 500000 >= t.minEP).id).toBe("godly");
  const scores = new Uint32Array(inflate("ep"));
  const count = scores.reduce((n, ep) => n + Number(ep >= 500000), 0);
  expect(count).toBe(2075);
  expect(evaluate(1337).tierProbability).toBe((100 * count) / 1000001);
  await showRoll(page, 1337);
  const box = page.locator(".number-artifact");
  await expect(box).toHaveAttribute("data-tier", "godly");
  await expect(box.locator(".godly-particles i")).toHaveCount(10);
  await expect(box.locator(".box-shimmer")).toHaveCount(1);
  await expect(page.locator(".rank-pill")).toHaveText("godly");
  const styles = await box.evaluate((e) => {
    const s = getComputedStyle(e),
      ink = getComputedStyle(e.querySelector(".number-box-content"));
    return {
      border: s.borderTopColor,
      width: s.borderTopWidth,
      radius: s.borderRadius,
      background: s.backgroundImage,
      ink: ink.backgroundImage,
      animated: e.getAnimations().length,
    };
  });
  expect(styles.border).toBe("rgb(245, 158, 11)");
  expect(styles.width).toBe("3px");
  expect(styles.radius).toBe("12px");
  expect(styles.background).toContain("rgb(253, 230, 138)");
  expect(styles.ink).toContain("linear-gradient");
  expect(styles.animated).toBe(0);
  const legacy = {
    ...emptyProgress(),
    history: [
      {
        id: "old",
        type: "roll",
        number: 1337,
        ep: 100177458,
        tier: "mythic",
        at: 1000,
        badges: [],
      },
    ],
  };
  expect(parseProgress(JSON.stringify(legacy)).history[0].tier).toBe("godly");
});

test("only the next upgrade in each path is shown, with a maxed card after the final purchase", async ({
  page,
}) => {
  await seedProgress(page, { balance: 10000000, totalEarned: 10000000 });
  await page.goto("/#shop");
  await expect(
    page.locator(
      '.shop-grid-upgrades .shop-card[data-kind="roll"], .shop-grid-upgrades .shop-card[data-kind="cooldown"]',
    ),
  ).toHaveCount(2);
  await expect(
    page.locator(
      '[data-product="quickwind-2"],[data-product="quickwind-3"],[data-product="clockwork-2"]',
    ),
  ).toHaveCount(0);
  for (const id of ["quickwind-1", "quickwind-2", "quickwind-3"]) {
    await buy(page, id);
    await expect(
      page.locator(
        '.shop-grid-upgrades .shop-card[data-kind="roll"], .shop-grid-upgrades .shop-card[data-kind="cooldown"]',
      ),
    ).toHaveCount(2);
  }
  await expect(
    page.locator('[data-product="quickwind-1"],[data-product="quickwind-2"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-product="quickwind-3"]')).toContainText(
    "Maximum level reached",
  );
  await expect(
    page.locator('[data-product="quickwind-3"] button'),
  ).toBeDisabled();
  expect((await saved(page)).owned).toEqual([
    "quickwind-1",
    "quickwind-2",
    "quickwind-3",
  ]);
});

test("new cosmetics persist and Archive Lens searches the complete history without paywalling the feed", async ({
  page,
}) => {
  const history = Array.from({ length: 60 }, (_, i) => ({
    id: `row-${i}`,
    type: "roll",
    number: i === 0 ? 1337 : 604827,
    ep: i === 0 ? 100177458 : 4663,
    tier: i === 0 ? "godly" : "common",
    at: 1000 + i,
    badges: [],
  }));
  await seedProgress(page, { balance: 4000000, totalEarned: 4000000, history });
  await page.goto("/#history");
  await expect(page.locator(".activity-event")).toHaveCount(50);
  await expect(
    page.getByRole("searchbox", { name: "Search a rolled number" }),
  ).toHaveCount(0);
  await nav(page, "Shop");
  for (const id of ["frostglass", "emberwake", "archive-lens"])
    await buy(page, id);
  await page.reload();
  expect((await saved(page)).owned).toEqual([
    "frostglass",
    "emberwake",
    "archive-lens",
  ]);
  expect((await saved(page)).equipped).toBe("emberwake");
  expect((await saved(page)).balance).toBe(2500000);
  await nav(page, "History");
  await page
    .getByRole("searchbox", { name: "Search a rolled number" })
    .fill("1337");
  await page.getByLabel("Roll tier", { exact: true }).selectOption("godly");
  await expect(page.locator('[data-event-type="roll"]')).toHaveCount(1);
  await expect(page.locator(".activity-roll .number-box")).toHaveText("1337");
  await page.getByRole("button", { name: "Clear archive filters" }).click();
  await expect(page.locator(".activity-event")).toHaveCount(50);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
});

test("changing Date.now in an open tab does not bypass the monotonic cooldown", async ({
  page,
}) => {
  await seedProgress(page);
  await startRoll(page, 604827);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  const deadline = (await saved(page)).cooldownUntil;
  await page.evaluate(() => {
    const future = Date.now() + 86400000;
    Date.now = () => future;
  });
  await page.clock.fastForward(60100);
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  expect((await saved(page)).cooldownUntil).toBe(deadline);
  await page.clock.fastForward(45000);
  await expect(
    page.getByRole("button", { name: "ROLL AGAIN", exact: true }),
  ).toBeEnabled();
});

test("failed settlement is merged with later cross-tab spending rather than overwriting it or duplicating Flywheel charge", async ({
  page,
  context,
}) => {
  await seedProgress(page, {
    balance: 500000,
    totalEarned: 500000,
    owned: ["flywheel"],
    flywheelCharge: 3,
  });
  await startRoll(page, 604827);
  await page.evaluate((key) => {
    const write = Storage.prototype.setItem;
    window.failSettlement = true;
    Storage.prototype.setItem = function (k, v) {
      if (
        window.failSettlement &&
        k === key &&
        JSON.parse(v).history.some((e) => e.type === "roll")
      )
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  }, PROGRESS_KEY);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  expect((await saved(page)).balance).toBe(500000);
  expect((await saved(page)).flywheelCharge).toBe(3);
  expect((await saved(page)).pendingRoll).not.toBeNull();
  const other = await context.newPage();
  await other.goto("/#shop");
  await buy(other, "starfall");
  await nav(page, "Shop");
  await expect(page.getByTestId("wallet-balance")).toHaveText("454,663 EP");
  await page.evaluate(() => {
    window.failSettlement = false;
  });
  await buy(page, "clockwork-1");
  const after = await saved(page);
  expect(after.balance).toBe(394663);
  expect(after.owned).toEqual(["flywheel", "starfall", "clockwork-1"]);
  expect(after.flywheelCharge).toBe(4);
  expect(after.history.filter((e) => e.type === "roll")).toHaveLength(1);
  expect(after.history.filter((e) => e.type === "purchase")).toHaveLength(2);
  expect(after.pendingRoll).toBeNull();
  await other.close();
});

test("registered browsers without Web Locks fail closed before exposing a new number", async ({
  page,
}) => {
  await seedProgress(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-load-error")).toContainText(
    "Web Locks support",
  );
  await expect(page.locator(".number-artifact")).toHaveCount(0);
  expect((await saved(page)).pendingRoll).toBeNull();
  expect((await saved(page)).history).toHaveLength(0);
});

test("guests cannot expose a roll when the temporary commit guard cannot be written", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("Blocked", "SecurityError");
      return write.call(this, k, v);
    };
  }, guestKey);
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-load-error")).toContainText(
    "No number was revealed",
  );
  await expect(page.locator(".number-artifact")).toHaveCount(0);
  expect(await saved(page)).toBeNull();
  expect(await guest(page)).toBeNull();
});

test("an unsettled committed result blocks the next draw after its deadline and supports retry", async ({
  page,
}) => {
  await seedProgress(page);
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) {
        if (window.holdSettlement && message.type === "restore") {
          window.settlementHeld = true;
          return;
        }
        super.postMessage(message, ...rest);
      }
    };
  });
  await startRoll(page, 604827);
  const committed = (await saved(page)).pendingRoll;
  await page.evaluate(() => {
    window.holdSettlement = true;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => page.evaluate(() => window.settlementHeld))
    .toBe(true);
  await page.clock.fastForward(105100);
  await expect(
    page.getByRole("button", { name: "RESULT PENDING", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry result settlement", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).pendingRoll).toEqual(committed);
  await page.evaluate(() => {
    window.holdSettlement = false;
  });
  await page
    .getByRole("button", { name: "Retry result settlement", exact: true })
    .click();
  await settled(page);
  expect((await saved(page)).balance).toBe(4663);
  expect(
    (await saved(page)).history.filter((e) => e.type === "roll"),
  ).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "ROLL AGAIN", exact: true }),
  ).toBeEnabled();
});
