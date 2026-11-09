import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
} from "../src/progress.js";
import { evaluate } from "./helpers/index.js";

const result = evaluate(1337);
const settle = (id, at) => ({
  type: "complete",
  id,
  at,
  cooldownUntil: at + 60000,
  result,
});

test("a forgotten roll is refused even after its history entry is gone", () => {
  let p = emptyProgress();
  for (let i = 0; i < 128; i++)
    p = applyProgress(p, settle(`roll-${i}`, 1000 + i * 1000));
  expect(p.receipts).toHaveLength(128);
  expect(p.receiptFloor).toBe(0);

  p = applyProgress(p, settle("roll-128", 129000));
  expect(p.receipts).toHaveLength(128);
  expect(p.receipts).not.toContain("roll-0");
  expect(p.receiptFloor).toBe(129000);

  const log = { ...p, history: p.history.filter((e) => e.id !== "roll-0") };
  expect(applyProgress(log, settle("roll-0", 1000))).toBe(log);

  expect(applyProgress(p, settle("roll-5", 6000))).toBe(p);

  const next = applyProgress(p, settle("roll-129", 130000));
  expect(next.balance).toBeGreaterThan(p.balance);
  expect(next.receiptFloor).toBe(130000);
});

test("the pending roll settles even when its time is behind the watermark", () => {
  let p = emptyProgress();
  for (let i = 0; i < 128; i++)
    p = applyProgress(p, settle(`roll-${i}`, 1000 + i * 1000));
  p = applyProgress(p, settle("roll-128", 129000));

  const pending = {
    ...p,
    pendingRoll: {
      id: "live",
      number: 1337,
      startedAt: 1000,
      rollMS: 45000,
      cooldownMS: 60000,
    },
  };
  const settled = applyProgress(pending, settle("live", 500));
  expect(settled.balance).toBeGreaterThan(pending.balance);
  expect(settled.receipts).toContain("live");
});

test("the watermark survives a save round trip and is one number, not a list", () => {
  let p = emptyProgress();
  for (let i = 0; i < 130; i++)
    p = applyProgress(p, settle(`roll-${i}`, 1000 + i * 1000));
  const saved = JSON.parse(JSON.stringify(p));
  const reloaded = parseProgress(JSON.stringify(saved));
  expect(reloaded.receiptFloor).toBe(p.receiptFloor);
  expect(reloaded.receipts).toHaveLength(128);

  const old = { ...saved };
  delete old.receiptFloor;
  expect(parseProgress(JSON.stringify(old)).receiptFloor).toBe(0);
});
