import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockWorldNumbers } from "./helpers/world-random.js";
import {
  completedWorldObjectives,
  completedWorldRoll,
  revealWorld,
  savedWorld,
} from "./helpers/world-roll.js";
import {
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
  preservePermanentCosmetics,
  PROGRESS_KEY,
  PRE_REPAIR_BACKUP_KEY,
} from "../src/progress.js";
import {
  RNGWEEN_AURAS,
  RNGWEEN_MISSIONS,
  RNGWEEN_WORLD_SKIN,
} from "../src/rngween.js";
import {
  RNGWEEN_PET,
  RNGWEEN_SKILL,
  RNGWEEN_WORLD_KEY,
  retireRngweenLimited,
} from "../src/rngween-limited.js";
import { rngweenValleyUnlocked } from "../src/rngween-world-zones.js";
import { worldMiniSummary } from "../src/rngween-world-badges.js";

const at = Date.UTC(2026, 9, 26, 12);
const sales = Date.UTC(2026, 10, 2, 12);
const end = Date.UTC(2026, 10, 4);
const account = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 100000000,
  totalEarned: 100000000,
  ...patch,
});
function funded() {
  const p = account();
  p.rngweenLimited.pumpkoins = 50000;
  return p;
}
const read = (p) => parseAndRepairProgress(JSON.stringify(p));
const buy = (p, id, time = at) =>
  applyProgress(p, { type: "buy-rngween-limited", id, at: time });
function claimed() {
  let p = account();
  for (const mission of RNGWEEN_MISSIONS) {
    p.tasks.rngween.counts[mission.metric] = mission.goal;
    p = applyProgress(p, { type: "claim-rngween-aura", id: mission.id, at });
  }
  return p;
}
function fourGraves() {
  let p = account({ owned: ["starfall"], equipped: "starfall" });
  for (const number of [66, 13, 49, 66])
    p = completedWorldRoll(p, { zone: "graveyard", number, at });
  return p;
}

// Repairs restore proven entitlements, never reroll, spend or pay a wallet.
test("ordinary aura purchase receipts recover ownership and equipped appearance without refunding EP", () => {
  const purchased = applyProgress(account(), {
    type: "buy",
    id: "starfall",
    at,
  });
  const broken = { ...purchased, owned: [] };
  const fixed = read(broken);
  expect(fixed.progress.owned).toContain("starfall");
  expect(fixed.progress.equipped).toBe("starfall");
  expect(fixed.progress.balance).toBe(purchased.balance);
  expect(fixed.progress.totalEarned).toBe(purchased.totalEarned);
  expect(fixed.progress.history).toEqual(purchased.history);
  expect(fixed.repairs.join(" ")).toContain("aura ownership");
  expect(read(fixed.progress).repairs).toEqual([]);
  expect(() =>
    applyProgress(fixed.progress, { type: "buy", id: "starfall", at }),
  ).toThrow("already own");
});

test("owned Halloween looks backfill permanent receipts, including Hexbound, without manufacturing currencies or mission completion", () => {
  const ids = [...RNGWEEN_AURAS.map((aura) => aura.id), RNGWEEN_WORLD_SKIN.id];
  const fixed = read(account({ owned: ids, equipped: "hexbound" }));
  expect(fixed.repairs).toEqual([]);
  expect(fixed.progress.rngweenLimited.auras).toEqual(
    ids.filter((id) => id !== "hexbound"),
  );
  expect(fixed.progress.rngweenLimited.skinEarned).toBe(true);
  expect(fixed.progress.rngweenLimited.pumpkoins).toBe(0);
  expect(fixed.progress.tasks.rngween.earned).toEqual([]);
  const retired = retireRngweenLimited(fixed.progress, end);
  retired.owned = [];
  const restored = read(retired).progress;
  expect(restored.owned.sort()).toEqual([...ids].sort());
  expect(restored.equipped).toBe("hexbound");
  expect(restored.rngweenLimited).not.toHaveProperty("pumpkoins");
});

test("claimed aura missions keep an independent permanent ledger when task/history/owned fields later disappear", () => {
  const p = claimed();
  expect(p.rngweenLimited.auras).toEqual(RNGWEEN_AURAS.map((aura) => aura.id));
  const expectedCoins = p.rngweenLimited.pumpkoins;
  const broken = { ...p, owned: [], history: [], tasks: emptyProgress().tasks };
  const fixed = read(broken).progress;
  expect(fixed.owned).toEqual(p.owned);
  expect(fixed.equipped).toBe(p.equipped);
  expect(fixed.rngweenLimited.pumpkoins).toBe(expectedCoins);
  expect(
    applyProgress(fixed, { type: "claim-rngween-coins", at }).rngweenLimited
      .pumpkoins,
  ).toBe(expectedCoins);
});

test("paid aura receipts recover missing inventory and ledger entries both before and after retirement", () => {
  const p = buy(funded(), "witchfire", sales);
  for (const saved of [p, retireRngweenLimited(p, end)]) {
    const broken = structuredClone(saved);
    broken.owned = [];
    broken.rngweenLimited.auras = [];
    const fixed = read(broken).progress;
    expect(fixed.owned).toContain("witchfire");
    expect(fixed.equipped).toBe("witchfire");
    expect(fixed.rngweenLimited.auras).toEqual(["witchfire"]);
    expect(fixed.balance).toBe(saved.balance);
    expect(fixed.rngweenLimited.pumpkoins).toBe(saved.rngweenLimited.pumpkoins);
    expect(read(fixed).repairs).toEqual([]);
  }
});

test("surviving paid temporary entitlements repair an active save without charging again, but never reopen a retired season", () => {
  let p = funded();
  for (const id of [RNGWEEN_PET.id, RNGWEEN_SKILL.id, RNGWEEN_WORLD_KEY.id])
    p = buy(p, id);
  const broken = structuredClone(p);
  broken.rngweenLimited.bought = [];
  const fixed = read(broken).progress;
  expect(fixed.rngweenLimited.bought).toEqual(p.rngweenLimited.bought);
  expect(fixed.rngweenLimited.pumpkoins).toBe(p.rngweenLimited.pumpkoins);
  expect(fixed.owned).toContain(RNGWEEN_SKILL.id);
  expect(fixed.pets).toContain(RNGWEEN_PET.id);
  expect(rngweenValleyUnlocked(fixed.rngweenLimited)).toBe(true);
  expect(() => buy(fixed, RNGWEEN_WORLD_KEY.id)).toThrow("already");
  const retired = read(retireRngweenLimited(broken, end)).progress;
  expect(retired.rngweenLimited.retired).toBe(true);
  expect(retired.rngweenLimited).not.toHaveProperty("bought");
  expect(retired.rngweenLimited).not.toHaveProperty("pumpkoins");
  expect(retired.owned).not.toContain(RNGWEEN_SKILL.id);
  expect(retired.pets).not.toContain(RNGWEEN_PET.id);
});

test("speed purchase receipts are repaired before parsing a committed deadline, so the pending number is not discarded", () => {
  let p = applyProgress(funded(), {
    type: "buy-rngween-world",
    id: "wisp-lantern",
    at,
  });
  p = applyProgress(p, {
    type: "rngween-world-roll",
    zone: "graveyard",
    number: 66,
    at,
  });
  const pending = p.rngweenLimited.world.pending;
  const broken = structuredClone(p);
  broken.rngweenLimited.world.upgrades = [];
  const fixed = read(broken);
  expect(fixed.progress.rngweenLimited.world.upgrades).toEqual([
    "wisp-lantern",
  ]);
  expect(fixed.progress.rngweenLimited.world.pending).toEqual(pending);
  expect(pending.revealsAt - pending.startedAt).toBe(8000);
  expect(fixed.progress.rngweenLimited.pumpkoins).toBe(
    p.rngweenLimited.pumpkoins,
  );
  expect(fixed.progress.rngweenLimited.world.mini.graveyard.rolls).toBe(0);
  expect(read(fixed.progress).repairs).toEqual([]);
});

test("a surviving final speed receipt proves the previously paid prefix, not a new spend or shortened pending reveal", () => {
  let p = funded();
  for (const id of ["wisp-lantern", "phantom-clock", "reapers-hourglass"])
    p = applyProgress(p, { type: "buy-rngween-world", id, at });
  p = applyProgress(p, {
    type: "rngween-world-roll",
    zone: "haunted-house",
    number: 666,
    at,
  });
  const broken = structuredClone(p);
  broken.rngweenLimited.world.upgrades = [];
  broken.history = broken.history.slice(-1);
  const fixed = read(broken).progress;
  expect(fixed.rngweenLimited.world.upgrades).toEqual(
    p.rngweenLimited.world.upgrades,
  );
  expect(fixed.rngweenLimited.world.pending).toEqual(
    p.rngweenLimited.world.pending,
  );
  expect(fixed.rngweenLimited.pumpkoins).toBe(p.rngweenLimited.pumpkoins);
});

test("forge receipts restore the already-earned distinct fragments and key, never the badge score or a coin reward", () => {
  let p = completedWorldObjectives(account(), "pumpkin-patch", at);
  p = completedWorldObjectives(p, "graveyard", at + 30000);
  p = completedWorldObjectives(p, "haunted-house", at + 60000);
  p = completedWorldObjectives(p, "blood-moon-ridge", at + 150000);
  p = applyProgress(p, { type: "forge-rngween-key", at: at + 200000 });
  const broken = structuredClone(p);
  broken.rngweenLimited.world.fragments = {
    "pumpkin-patch": false,
    graveyard: false,
    "haunted-house": false,
    "blood-moon-ridge": false,
  };
  broken.rngweenLimited.world.keyForged = false;
  const fixed = read(broken).progress;
  expect(fixed.rngweenLimited.world.fragments).toEqual(
    p.rngweenLimited.world.fragments,
  );
  expect(fixed.rngweenLimited.world.keyForged).toBe(true);
  expect(fixed.rngweenLimited.world.mini).toEqual(p.rngweenLimited.world.mini);
  expect(fixed.balance).toBe(p.balance);
  expect(fixed.rngweenLimited.pumpkoins).toBe(p.rngweenLimited.pumpkoins);
  expect(() => applyProgress(fixed, { type: "forge-rngween-key", at })).toThrow(
    "already unlocked",
  );
});

test("outside-event, unknown and wrong-price history entries cannot mint keys, upgrades, auras or Pumpkoins", () => {
  const p = account();
  p.history = [
    {
      id: "foreign-key",
      type: "rngween-purchase",
      productId: RNGWEEN_WORLD_KEY.id,
      name: "Key",
      pumpkoins: 2000,
      at: Date.UTC(2027, 9, 26),
    },
    {
      id: "future-aura",
      type: "rngween-purchase",
      productId: "witchfire",
      name: "Aura",
      pumpkoins: 12000,
      at: Date.UTC(2027, 9, 26),
    },
    {
      id: "wrong-speed",
      type: "rngween-world-purchase",
      productId: "reapers-hourglass",
      name: "Hourglass",
      pumpkoins: 1,
      at,
    },
    {
      id: "rngween-forged-key:wrong-event",
      type: "rngween-forged-key",
      at,
      name: "Key",
    },
  ];
  const fixed = read(p).progress;
  expect(fixed.rngweenLimited.bought).toEqual([]);
  expect(fixed.rngweenLimited.auras).toEqual([]);
  expect(fixed.rngweenLimited.world.upgrades).toEqual([]);
  expect(fixed.rngweenLimited.world.keyForged).toBe(false);
  expect(fixed.owned).toEqual([]);
  expect(fixed.rngweenLimited.pumpkoins).toBe(0);
});

test("permanent skin proof survives a redundant retired pool leak while every temporary field is removed", () => {
  const p = account();
  p.rngweenLimited = {
    ...p.rngweenLimited,
    retired: true,
    drawn: [6666],
    pumpkoins: 99999,
    bought: [RNGWEEN_WORLD_KEY.id],
  };
  const fixed = read(p).progress;
  expect(fixed.rngweenLimited).toEqual({
    id: "rngween-2026",
    retired: true,
    auras: [],
    skinEarned: true,
  });
  expect(fixed.owned).toContain("hexbound");
  expect(fixed.rngweenLimited).not.toHaveProperty("world");
  expect(fixed.rngweenLimited).not.toHaveProperty("pumpkoins");
});

test("same-account reconciliation preserves all known permanent skins, not temporary equipment, currencies or prior equipment preference", () => {
  const previous = account({
    owned: ["starfall", "witchfire", "hexbound", RNGWEEN_SKILL.id],
    equipped: "hexbound",
  });
  const next = account({ balance: 777, owned: [], equipped: "none" });
  const merged = preservePermanentCosmetics(previous, next);
  expect(merged.owned).toEqual(["starfall", "witchfire", "hexbound"]);
  expect(merged.equipped).toBe("none");
  expect(merged.balance).toBe(777);
  expect(merged.rngweenLimited.auras).toEqual(["witchfire"]);
  expect(merged.rngweenLimited.skinEarned).toBe(true);
  expect(merged.rngweenLimited.pumpkoins).toBe(0);
  expect(merged.tasks).toEqual(next.tasks);
  expect(preservePermanentCosmetics(previous, merged)).toBe(merged);
});

test("another account never inherits previous skins and a retired incoming snapshot never restores World progress or temporary stock", () => {
  const previous = claimed();
  previous.owned.push("hexbound", RNGWEEN_SKILL.id);
  const foreign = account({
    profile: { ...testProfile, id: "another-account" },
  });
  expect(preservePermanentCosmetics(previous, foreign)).toBe(foreign);
  expect(foreign.owned).toEqual([]);
  const retired = retireRngweenLimited(account(), end);
  const merged = preservePermanentCosmetics(previous, retired);
  expect(merged.owned).toContain("hexbound");
  expect(merged.owned).not.toContain(RNGWEEN_SKILL.id);
  expect(merged.rngweenLimited.retired).toBe(true);
  expect(merged.rngweenLimited).not.toHaveProperty("pumpkoins");
  expect(merged.rngweenLimited).not.toHaveProperty("world");
});

test("ordinary EP purchases and a pending Valley jackpot cannot be used as permanent event-skin receipts", () => {
  const p = account();
  p.history = [
    {
      id: "invalid-hex-buy",
      type: "purchase",
      productId: "hexbound",
      name: "Hexbound",
      ep: 1,
      at,
    },
  ];
  p.rngweenLimited.bought = [RNGWEEN_WORLD_KEY.id];
  const pending = applyProgress(p, {
    type: "rngween-world-roll",
    zone: "valley",
    number: 6666,
    expectedCount: 0,
    at,
  });
  const fixed = read(pending).progress;
  expect(fixed.owned).not.toContain("hexbound");
  expect(fixed.rngweenLimited.skinEarned).toBe(false);
  expect(fixed.rngweenLimited.world.pending.number).toBe(6666);
});

test("a repaired aura and its equipped choice heal the actual stored bytes once, with an exact pre-repair backup", async ({
  page,
}) => {
  const purchased = applyProgress(account(), {
    type: "buy",
    id: "starfall",
    at,
  });
  const broken = { ...purchased, owned: [] };
  await mockSeasonClock(page, at);
  await seedProgress(page, broken);
  await page.goto("/rngween-world");
  await expect(page.locator(".world-number-box")).toHaveAttribute(
    "data-cosmetic",
    "starfall",
  );
  const fixed = await savedWorld(page);
  expect(fixed.owned).toContain("starfall");
  const backup = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PRE_REPAIR_BACKUP_KEY,
  );
  expect(backup.owned).toEqual([]);
  expect(backup.equipped).toBe("starfall");
  await page.reload();
  await expect(page.locator(".world-number-box")).toHaveAttribute(
    "data-cosmetic",
    "starfall",
  );
  await expect(page.locator(".world-alert")).toHaveCount(0);
  expect(read(await savedWorld(page)).repairs).toEqual([]);
});

test("linked snapshots persist their canonical repairs, not the damaged wire bytes, and keep the exact pending result", async ({
  page,
}) => {
  let peer = applyProgress(funded(), {
    type: "buy-rngween-world",
    id: "wisp-lantern",
    at,
  });
  peer = applyProgress(peer, {
    type: "rngween-world-roll",
    zone: "graveyard",
    number: 66,
    at,
  });
  const pending = peer.rngweenLimited.world.pending;
  peer.rngweenLimited.world.upgrades = [];
  await mockSeasonClock(page, at);
  await seedProgress(page);
  await page.goto("/rngween-world");
  const accepted = await page.evaluate((raw) => {
    const event = new CustomEvent("rng-sync-state", {
      detail: raw,
      cancelable: true,
    });
    window.dispatchEvent(event);
    return event.progressSaved === true;
  }, JSON.stringify(peer));
  expect(accepted).toBe(true);
  const fixed = await savedWorld(page);
  expect(fixed.rngweenLimited.world.upgrades).toEqual(["wisp-lantern"]);
  expect(fixed.rngweenLimited.world.pending).toEqual(pending);
  expect(fixed.rngweenLimited.pumpkoins).toBe(peer.rngweenLimited.pumpkoins);
  expect(read(fixed).repairs).toEqual([]);
  await revealWorld(page);
  await expect
    .poll(async () => (await savedWorld(page)).rngweenLimited.world.pending)
    .toBeNull();
  expect(
    (await savedWorld(page)).rngweenLimited.world.mini.graveyard.rolls,
  ).toBe(1);
  expect(
    worldMiniSummary(
      "graveyard",
      (await savedWorld(page)).rngweenLimited.world.mini.graveyard,
    ).score,
  ).toBe(121);
});

test("a failed linked save never replaces the current account or acknowledges its stamp; the same code can retry durably", async ({
  page,
}) => {
  const existing = account({ owned: ["starfall"], equipped: "starfall" });
  const peer = completedWorldObjectives(
    account({
      profile: {
        ...testProfile,
        id: "incoming-profile",
        username: "IncomingUser",
      },
    }),
    "graveyard",
    at,
  );
  await mockSeasonClock(page, at);
  await seedProgress(page, existing);
  await page.goto("/rngween-world");
  // Let the account's one-time event stamp save first, so the blocked
  // storage below only sees the linked-save attempt.
  await expect
    .poll(async () => (await savedWorld(page))?.events?.["rngween-2026"]?.at)
    .toBeGreaterThan(0);
  const attempt = await page.evaluate(
    async ({ key, peer }) => {
      const sync = await import("/src/sync.js");
      const before = sync.syncStatus();
      window.peerRetryCode = `RNGDLE-ACCOUNT-1:${btoa(JSON.stringify({ v: 1, at: before.savedAt + 5000, save: JSON.stringify(peer) }))}`;
      window.restoreLinkedStorage = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, value) {
        if (k === key) throw new DOMException("Full", "QuotaExceededError");
        return window.restoreLinkedStorage.call(this, k, value);
      };
      const result = sync.adoptPeerCode(window.peerRetryCode);
      return { result, before, after: sync.syncStatus() };
    },
    { key: PROGRESS_KEY, peer },
  );
  expect(attempt.result).toEqual({ ok: false, reason: "storage" });
  expect(attempt.after.savedAt).toBe(attempt.before.savedAt);
  expect(attempt.after.lastSyncAt).toBe(attempt.before.lastSyncAt);
  expect((await savedWorld(page)).profile.id).toBe(testProfile.id);
  await expect(page.locator(".world-number-box")).toHaveAttribute(
    "data-cosmetic",
    "starfall",
  );
  await expect(page.locator(".world-alert")).toContainText(
    "keeping its current progress",
  );
  const retry = await page.evaluate(async () => {
    Storage.prototype.setItem = window.restoreLinkedStorage;
    return (await import("/src/sync.js")).adoptPeerCode(window.peerRetryCode);
  });
  expect(retry).toEqual({ ok: true });
  expect((await savedWorld(page)).profile.id).toBe(peer.profile.id);
  expect((await savedWorld(page)).owned).not.toContain("starfall");
  expect((await savedWorld(page)).rngweenLimited.world.mini).toEqual(
    peer.rngweenLimited.world.mini,
  );
  await page.reload();
  await expect(page.locator("[data-world-points]")).toHaveText("337");
});

test("same-account old linked snapshots cannot remove known skins; explicit new equipment preferences still work", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, {
    owned: ["starfall", "witchfire", "hexbound"],
    equipped: "hexbound",
  });
  await page.goto("/rngween-world");
  const stale = account({ owned: [], equipped: "none" });
  await page.evaluate(
    (raw) =>
      window.dispatchEvent(
        new CustomEvent("rng-sync-state", { detail: raw, cancelable: true }),
      ),
    JSON.stringify(stale),
  );
  await expect(page.locator(".world-number-box")).toHaveAttribute(
    "data-cosmetic",
    "none",
  );
  const p = await savedWorld(page);
  expect(p.owned.sort()).toEqual(["hexbound", "starfall", "witchfire"]);
  expect(p.rngweenLimited.skinEarned).toBe(true);
  expect(p.rngweenLimited.auras).toEqual(["witchfire"]);
  await page.reload();
  expect((await savedWorld(page)).owned.sort()).toEqual([
    "hexbound",
    "starfall",
    "witchfire",
  ]);
});

test("a Valley jackpot permanently unlocks Hexbound without replacing another equipped skin", async ({
  page,
}) => {
  const p = account({ owned: ["starfall"], equipped: "starfall" });
  p.rngweenLimited.bought = [RNGWEEN_WORLD_KEY.id];
  await mockSeasonClock(page, at);
  await mockWorldNumbers(page, [6666]);
  await seedProgress(page, p);
  await page.goto("/rngween-world");
  await page.locator('[data-world-zone="valley"]').click();
  await page.getByRole("button", { name: /Roll in the Valley/ }).click();
  await expect
    .poll(
      async () => (await savedWorld(page)).rngweenLimited.world.pending?.number,
    )
    .toBe(6666);
  await expect(page.locator(".world-number-box")).toHaveAttribute(
    "data-cosmetic",
    "starfall",
  );
  expect((await savedWorld(page)).owned).not.toContain("hexbound");
  await revealWorld(page);
  await expect(page.locator(".world-result-copy")).toContainText(
    "Hexbound unlocked",
  );
  const won = await savedWorld(page);
  expect(won.owned).toContain("hexbound");
  expect(won.equipped).toBe("starfall");
  expect(won.rngweenLimited.skinEarned).toBe(true);
  await expect(page.locator(".world-six")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".world-number-box")).toHaveAttribute(
    "data-cosmetic",
    "starfall",
  );
});

test("live linked browsers recover an unwritable badge head automatically, sharing one writer and one fragment payout", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const primary = await a.newPage(),
      secondary = await b.newPage();
    let p = fourGraves();
    p.rngweenLimited.pumpkoins = 1700;
    for (const id of ["wisp-lantern", "phantom-clock", "reapers-hourglass"])
      p = applyProgress(p, { type: "buy-rngween-world", id, at });
    await mockSeasonClock(primary, at + 60000);
    await mockWorldNumbers(primary, { graveyard: [6] });
    await seedProgress(primary, p);
    await primary.goto("/settings/link");
    await primary.getByTestId("sync-create").click();
    await expect(primary.getByTestId("sync-link")).toBeVisible();
    const link = await primary.getByTestId("sync-link").inputValue();
    await mockSeasonClock(secondary, at + 60000);
    await mockWorldNumbers(secondary, { graveyard: [99] });
    await secondary.clock.setFixedTime(new Date(Date.UTC(2099, 0, 1)));
    await secondary.goto(link);
    await expect
      .poll(
        async () =>
          (await savedWorld(secondary))?.rngweenLimited.world.mini.graveyard
            .rolls,
        { timeout: 15000 },
      )
      .toBe(4);
    await secondary.goto("/rngween-world");
    await expect(secondary.locator("[data-world-points]")).toHaveText("326");
    await secondary.evaluate((key) => {
      window.restoreLiveLinkedStorage = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, value) {
        if (k === key) throw new DOMException("Full", "QuotaExceededError");
        return window.restoreLiveLinkedStorage.call(this, k, value);
      };
    }, PROGRESS_KEY);
    await secondary.getByRole("button", { name: /Roll in Graveyard/ }).click();
    await expect
      .poll(
        async () =>
          (await savedWorld(primary)).rngweenLimited.world.mini.graveyard.rolls,
        { timeout: 15000 },
      )
      .toBe(5);
    expect((await savedWorld(primary)).rngweenLimited.world.last.number).toBe(
      6,
    );
    expect(
      (await savedWorld(primary)).rngweenLimited.world.fragments.graveyard,
    ).toBe(true);
    expect(
      (await savedWorld(secondary)).rngweenLimited.world.mini.graveyard.rolls,
    ).toBe(4);
    await expect(secondary.locator(".world-alert")).toContainText(
      "keeping its current progress",
    );
    await secondary.evaluate(() => {
      Storage.prototype.setItem = window.restoreLiveLinkedStorage;
    });
    await expect
      .poll(
        async () =>
          (await savedWorld(secondary)).rngweenLimited.world.mini.graveyard
            .rolls,
        { timeout: 10000 },
      )
      .toBe(5);
    const first = await savedWorld(primary),
      other = await savedWorld(secondary);
    expect(other.rngweenLimited.world).toEqual(first.rngweenLimited.world);
    expect(other.equipped).toBe("starfall");
    expect(other.rngweenLimited.pumpkoins).toBe(0);
    expect(other.rngweenLimited.drawn).toEqual([]);
    await expect(secondary.locator("[data-world-points]")).toHaveText("337");
    await expect(secondary.locator(".world-fragment-owned")).toContainText(
      "Fragment owned",
    );
    await secondary.reload();
    await expect(secondary.locator(".world-number-box")).toHaveAttribute(
      "data-cosmetic",
      "starfall",
    );
    expect(
      (await savedWorld(secondary)).rngweenLimited.world.mini.graveyard.rolls,
    ).toBe(5);
  } finally {
    await b.close();
    await a.close();
  }
});
