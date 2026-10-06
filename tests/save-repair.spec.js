import { test, expect } from "@playwright/test";
import {
  emptyProgress,
  parseProgress,
  parseAndRepairProgress,
  PROGRESS_KEY,
  PRE_REPAIR_BACKUP_KEY,
} from "../src/progress.js";
import { skillById } from "../src/skills.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const base = () => ({ ...emptyProgress(), profile: { ...testProfile } });
const load = (overrides) =>
  parseAndRepairProgress(JSON.stringify({ ...base(), ...overrides }));
const notes = (result) => result.repairs.join(" ");

test("a v0.3 save with an overcharged circle loads with the circle clamped", () => {
  // The real incident: Maw held 10 charges from an older balance while the
  // current circle holds 8, and the whole save was rejected over it.
  const max = skillById.get("serpent-maw").charges;
  const { progress, repairs } = load({
    skillCharge: { "serpent-maw": max + 2, surge: 3 },
  });
  expect(progress.skillCharge).toEqual({ "serpent-maw": max, surge: 3 });
  expect(notes({ repairs })).toMatch(/Maw/);
  expect(progress.profile.username).toBe(testProfile.username);
});

test("unreadable skill charges reset the affected circles only", () => {
  const negative = load({ skillCharge: { surge: -1, trail: 2 } });
  expect(negative.progress.skillCharge).toEqual({ trail: 2 });
  expect(notes(negative)).toMatch(/Surge/);
  const shaped = load({ skillCharge: ["surge"] });
  expect(shaped.progress.skillCharge).toEqual({});
  expect(notes(shaped)).toMatch(/skill charges were unreadable/);
  // Unknown keys are future skills, not corruption: dropped silently.
  const future = load({ skillCharge: { surge: 3, ghost: 9 } });
  expect(future.progress.skillCharge).toEqual({ surge: 3 });
  expect(future.repairs).toEqual([]);
});

test("wallet figures repair without ever inventing EP", () => {
  const overdrawn = load({ balance: 500, totalEarned: 100 });
  expect(overdrawn.progress.balance).toBe(100);
  expect(overdrawn.progress.totalEarned).toBe(100);
  expect(notes(overdrawn)).toMatch(/wallet balance/);
  const garbageWallet = load({ balance: -1, totalEarned: 100 });
  expect(garbageWallet.progress.balance).toBe(0);
  expect(garbageWallet.progress.totalEarned).toBe(100);
  // An unreadable all-time total is rebuilt from a healthy wallet.
  const garbageTotal = load({ balance: 500, totalEarned: "lots" });
  expect(garbageTotal.progress.balance).toBe(500);
  expect(garbageTotal.progress.totalEarned).toBe(500);
  expect(notes(garbageTotal)).toMatch(/all-time earned/);
  const garbageClock = load({ cooldownUntil: -50 });
  expect(garbageClock.progress.cooldownUntil).toBe(0);
  expect(notes(garbageClock)).toMatch(/cooldown timer/);
});

test("Flywheel charge clamps to what the owned model holds", () => {
  const clamped = load({ owned: ["flywheel"], flywheelCharge: 99 });
  expect(clamped.progress.flywheelCharge).toBe(4);
  expect(notes(clamped)).toMatch(/Flywheel charge/);
  const negative = load({ owned: ["flywheel"], flywheelCharge: -2 });
  expect(negative.progress.flywheelCharge).toBe(0);
  expect(notes(negative)).toMatch(/Flywheel charge/);
  // Without a Flywheel there is nothing to hold a charge: zero, silently.
  const modeless = load({ flywheelCharge: 99 });
  expect(modeless.progress.flywheelCharge).toBe(0);
  expect(modeless.repairs).toEqual([]);
});

test("an unreadable cycle total is recalculated from history", () => {
  const roll = {
    id: "roll-1",
    type: "roll",
    at: 1700000000000,
    number: 1337,
    tier: "common",
    ep: 42,
    badges: [],
  };
  const { progress, repairs } = load({
    history: [roll],
    cycleEarnedEP: "lots",
  });
  expect(progress.cycleEarnedEP).toBe(42);
  expect(notes({ repairs })).toMatch(/cycle EP total/);
});

test("unreadable lists reset, rebuildable ones rebuild from the save itself", () => {
  const collections = load({ discovered: "PRIME", owned: 42, receipts: 7 });
  expect(collections.progress.discovered).toEqual([]);
  expect(collections.progress.owned).toEqual([]);
  expect(collections.progress.receipts).toEqual([]);
  expect(notes(collections)).toMatch(/badge collection/);
  // The activity log remembers every companion found or bought.
  const pets = load({
    pets: "pebble",
    history: [
      {
        id: "drop-1",
        type: "pet",
        at: 1700000000000,
        productId: "pebble",
        name: "Pebble",
      },
      {
        id: "buy-1",
        type: "purchase",
        at: 1700000000000,
        productId: "moth",
        name: "Moth",
        ep: 45000,
      },
    ],
  });
  expect(pets.progress.pets).toEqual(["pebble", "moth"]);
  expect(notes(pets)).toMatch(/companion list/);
  // Purchases plus rebirths re-unlock every skill.
  const skills = load({
    skills: "surge",
    owned: ["surge"],
    rebirths: 1,
  });
  expect(skills.progress.skills).toEqual(["surge", "reborn-drive"]);
  expect(notes(skills)).toMatch(/unlocked skills/);
  const rack = load({ equippedSkills: "surge" });
  expect(rack.progress.equippedSkills).toEqual([]);
  expect(notes(rack)).toMatch(/skill rack/);
});

test("an unverifiable committed roll is discarded and the cooldown is kept", () => {
  const { progress, repairs } = load({
    pendingRoll: { id: "forged" },
    cooldownUntil: 999,
  });
  expect(progress.pendingRoll).toBeNull();
  expect(progress.cooldownUntil).toBe(999);
  expect(notes({ repairs })).toMatch(/committed roll/);
});

test("the profile repairs piece by piece instead of degrading to a guest", () => {
  const renamed = load({
    balance: 50,
    totalEarned: 50,
    profile: { ...testProfile, username: "x" },
  });
  expect(renamed.progress.profile.id).toBe(testProfile.id);
  expect(renamed.progress.profile.username).toMatch(/^player-.{8}$/);
  expect(renamed.progress.balance).toBe(50);
  expect(notes(renamed)).toMatch(/profile name/);
  const reissued = load({
    profile: { ...testProfile, id: "", createdAt: -5 },
  });
  expect(reissued.progress.profile.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(reissued.progress.profile.username).toBe(testProfile.username);
  expect(reissued.progress.profile.createdAt).toBeGreaterThan(0);
  expect(notes(reissued)).toMatch(/profile id/);
  // Even a profile that is not an object keeps the save funded.
  const replaced = load({
    balance: 50,
    totalEarned: 50,
    profile: "LuckyTester",
  });
  expect(replaced.progress.profile.username).toMatch(/^player-/);
  expect(replaced.progress.balance).toBe(50);
  expect(notes(replaced)).toMatch(/new one was issued/);
});

test("unreadable history entries are dropped with a note", () => {
  const kept = {
    id: "roll-1",
    type: "roll",
    at: 1700000000000,
    number: 1337,
    tier: "common",
    ep: 42,
    badges: [],
  };
  const { progress, repairs } = load({
    history: [kept, { garbage: true }, null],
  });
  expect(progress.history).toHaveLength(1);
  expect(notes({ repairs })).toMatch(/activity-log/);
});

test("unreadable offline rewards are discarded but the timestamp is kept", () => {
  const salvaged = load({
    owned: ["offline-roller"],
    offline: { lastSeenAt: 1000, batch: { id: "forged" } },
  });
  expect(salvaged.progress.offline).toEqual({
    lastSeenAt: 1000,
    batch: null,
    report: null,
  });
  expect(notes(salvaged)).toMatch(/offline rewards/);
  const dropped = load({
    owned: ["offline-roller"],
    offline: "yesterday",
  });
  expect(dropped.progress.offline).toBeNull();
  expect(notes(dropped)).toMatch(/offline rewards/);
});

test("only data that is not a save at all is still rejected", () => {
  for (const raw of [
    "broken",
    "",
    JSON.stringify({ version: 999 }),
    JSON.stringify([1, 2]),
    JSON.stringify("a save"),
  ])
    expect(() => parseProgress(raw)).toThrow();
  expect(parseAndRepairProgress(null)).toEqual({
    progress: emptyProgress(),
    repairs: [],
  });
});

test("repairs are stable: a repaired save loads silently the second time", () => {
  const damaged = {
    ...base(),
    balance: 900,
    totalEarned: 100,
    skillCharge: { "serpent-maw": 99, surge: -2 },
    flywheelCharge: 42,
    rebirths: "many",
    surplusBanked: 101,
    cycleEarnedEP: -1,
    pendingRoll: { id: "forged" },
    profile: { ...testProfile, username: "x" },
    history: [{ garbage: true }],
    offline: { lastSeenAt: 1000, batch: { id: "forged" } },
    pets: 7,
    skills: 9,
  };
  const first = parseAndRepairProgress(JSON.stringify(damaged));
  expect(first.repairs.length).toBeGreaterThan(5);
  const second = parseAndRepairProgress(JSON.stringify(first.progress));
  expect(second.repairs).toEqual([]);
  expect(second.progress).toEqual(first.progress);
});

test("a valid save loads silently and byte-for-byte unchanged", () => {
  const valid = {
    ...base(),
    balance: 100,
    totalEarned: 500,
    discovered: ["PRIME"],
    owned: ["starfall", "flywheel"],
    equipped: "starfall",
    flywheelCharge: 2,
    rebirths: 1,
    surplusBanked: 5,
    skillCharge: { surge: 3 },
    cooldownUntil: 12345,
    receipts: ["roll-1"],
  };
  const { progress, repairs } = parseAndRepairProgress(JSON.stringify(valid));
  expect(repairs).toEqual([]);
  expect(progress).toEqual(parseProgress(JSON.stringify(valid)));
  expect(progress.balance).toBe(100);
  expect(progress.skillCharge).toEqual({ surge: 3 });
});

test("booting with a damaged save repairs it, says so, and keeps a backup", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 500,
    totalEarned: 500,
    skillCharge: { "serpent-maw": 10 },
    pendingRoll: { id: "forged" },
  });
  await page.goto("/");
  await expect(page.locator(".progress-warning")).toContainText(
    "Your save was repaired",
  );
  const healed = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(healed.skillCharge).toEqual({ "serpent-maw": 8 });
  expect(healed.pendingRoll).toBeNull();
  expect(healed.balance).toBe(500);
  const backup = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PRE_REPAIR_BACKUP_KEY,
  );
  expect(backup.skillCharge).toEqual({ "serpent-maw": 10 });
});
