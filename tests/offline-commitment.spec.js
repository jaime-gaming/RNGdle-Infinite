import { test, expect } from "./helpers/clock.js";
import {
  emptyProgress,
  applyProgress,
  settleOfflineRoll,
  parseAndRepairProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import { matchesOfflineCommitment, OFFLINE_INTERVAL } from "../src/offline.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { mockRandom } from "./helpers/random-roll.js";

const account = (now = Date.now(), numbers = [604827, 375660, 577281]) => ({
  ...emptyProgress(),
  profile: testProfile,
  owned: ["offline-roller"],
  receiptFloor: now - 1000,
  offline: {
    lastSeenAt: now,
    report: null,
    batch: {
      id: "behind-floor",
      since: now - numbers.length * OFFLINE_INTERVAL - 10000,
      numbers,
      index: 0,
      ep: 0,
      newBadges: 0,
    },
  },
});
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
function actionFor(p, index = p.offline.batch.index) {
  const b = p.offline.batch;
  return {
    type: "complete",
    source: "offline",
    id: `${b.id}:${index}`,
    result: evaluate(b.numbers[index]),
    at: b.since + (index + 1) * (b.intervalMS ?? OFFLINE_INTERVAL),
    cooldownUntil: p.cooldownUntil,
  };
}

test("new committed offline rolls behind the online receipt floor pay their real scores and an accurate summary", () => {
  let p = account();
  const initial = p;
  const expected = p.offline.batch.numbers.reduce(
    (sum, number) => sum + evaluate(number).totalEP,
    0,
  );
  while (p.offline.batch) {
    const a = actionFor(p);
    expect(a.at).toBeLessThan(p.receiptFloor);
    expect(matchesOfflineCommitment(p.offline, a)).toBe(true);
    const before = p.balance;
    p = settleOfflineRoll(p, a.result, Date.now());
    expect(p.balance - before).toBe(a.result.totalEP);
  }
  expect(p.balance).toBe(expected);
  expect(p.totalEarned).toBe(expected);
  expect(p.offline.report).toMatchObject({ rolls: 3, ep: expected });
  expect(p.tasks).toEqual(initial.tasks);
  expect(p.skillCharge).toEqual(initial.skillCharge);
  expect(p.history.filter((row) => row.source === "offline")).toHaveLength(3);
  expect(parseAndRepairProgress(JSON.stringify(p)).repairs).toEqual([]);
});

test("an offline label, future index, altered number, timestamp or batch ID cannot bypass forgotten-roll replay protection", () => {
  const p = account(),
    actual = actionFor(p);
  for (const patch of [
    { id: "different:0" },
    { id: "behind-floor:1" },
    { result: evaluate(139598) },
    { at: actual.at - 1 },
    { source: "online" },
  ]) {
    const forged = { ...actual, ...patch };
    expect(matchesOfflineCommitment(p.offline, forged)).toBe(false);
    expect(applyProgress(p, forged)).toBe(p);
  }
  expect(
    applyProgress({ ...p, offline: { ...p.offline, batch: null } }, actual)
      .balance,
  ).toBe(0);
});

test("a batch pointer advances atomically, resumes from JSON, keeps the manual roll and never pays an old index twice", () => {
  const now = Date.now();
  let p = account(now);
  p.pendingRoll = {
    id: "manual-in-flight",
    number: 375660,
    startedAt: now,
    rollMS: 45000,
    cooldownMS: 60000,
  };
  p.cooldownUntil = now + 105000;
  const first = actionFor(p);
  p = settleOfflineRoll(p, first.result, now);
  expect(p.offline.batch.index).toBe(1);
  expect(p.offline.batch.ep).toBe(first.result.totalEP);
  expect(p.pendingRoll.id).toBe("manual-in-flight");
  expect(applyProgress(p, first)).toBe(p);
  p = parseAndRepairProgress(JSON.stringify(p)).progress;
  while (p.offline.batch) p = settleOfflineRoll(p, actionFor(p).result, now);
  expect(p.pendingRoll.id).toBe("manual-in-flight");
  expect(p.cooldownUntil).toBe(now + 105000);
  expect(p.offline.report.rolls).toBe(3);
  expect(applyProgress(p, first)).toBe(p);
});

test("a capped long batch behind the watermark settles every receipt, including after the 128-ID window", () => {
  let p = account(Date.now(), Array(144).fill(604827));
  while (p.offline.batch)
    p = settleOfflineRoll(p, evaluate(604827), Date.now());
  expect(p.balance).toBe(144 * 4663);
  expect(p.offline.report.ep).toBe(p.balance);
  expect(p.offline.report.rolls).toBe(144);
  expect(p.receipts).toHaveLength(128);
  const late = {
    type: "complete",
    source: "offline",
    id: "behind-floor:0",
    result: evaluate(604827),
    at: Date.now() - 144 * OFFLINE_INTERVAL,
    cooldownUntil: 0,
  };
  expect(applyProgress(p, late)).toBe(p);
});

test("offline catch-up behind the watermark recovers after a failed chunk save and reloads without a zero-EP report or double payment", async ({
  page,
}) => {
  const now = Date.now(),
    p = account(now);
  await seedProgress(page, p);
  await mockRandom(page, [139598]);
  await page.addInitScript((key) => {
    const write = Storage.prototype.setItem;
    window.blockOfflineCredit = true;
    Storage.prototype.setItem = function (k, value) {
      if (
        window.blockOfflineCredit &&
        k === key &&
        JSON.parse(value).history.some((row) => row.source === "offline")
      )
        throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, value);
    };
  }, PROGRESS_KEY);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Retry offline rewards" }),
  ).toBeVisible();
  expect((await saved(page)).balance).toBe(0);
  expect((await saved(page)).offline.batch).toEqual(p.offline.batch);
  await page.evaluate(() => {
    window.blockOfflineCredit = false;
  });
  await page.getByRole("button", { name: "Retry offline rewards" }).click();
  await expect.poll(async () => (await saved(page)).offline.batch).toBeNull();
  const paid = await saved(page);
  const sum = p.offline.batch.numbers.reduce(
    (total, n) => total + evaluate(n).totalEP,
    0,
  );
  expect(paid.balance).toBe(sum);
  expect(paid.offline.report.ep).toBe(sum);
  await expect(
    page.getByRole("region", { name: "Offline rewards" }),
  ).not.toContainText("+0 EP");
  await page.reload();
  expect((await saved(page)).balance).toBe(sum);
  expect(
    (await saved(page)).history.filter((row) => row.source === "offline"),
  ).toHaveLength(3);
});
