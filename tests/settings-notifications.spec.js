import { test, expect } from "@playwright/test";
import {
  defaultSettings,
  parseSettings,
  SETTINGS_KEY,
} from "../src/settings.js";
import { formatEP, formatEPCompact } from "../src/roll-data.js";
import { emptyProgress, applyProgress } from "../src/progress.js";
import {
  offlineSettings,
  shopProducts,
  productById,
} from "../src/shop-data.js";

const rich = (extra = {}) => ({
  ...emptyProgress(),
  profile: { id: "p", username: "tester", createdAt: 1 },
  balance: 200000000,
  totalEarned: 200000000,
  ...extra,
});
const buy = (p, id, at = 1000) => applyProgress(p, { type: "buy", id, at });

test("settings default to a quiet, unchanged game and are keyed separately from progress", () => {
  expect(SETTINGS_KEY).not.toBe("rng-infinite-progress-v1");
  expect(defaultSettings).toEqual({
    notifyReady: false,
    notifySound: false,
    reduceMotion: "system",
    compactNumbers: false,
    showFlywheelMeter: true,
    showGoalRecap: true,
    confirmPurchases: true,
    autoRollDefault: false,
  });
  expect(parseSettings(null)).toEqual(defaultSettings);
});

test("stored settings are validated field by field and never throw on junk", () => {
  expect(parseSettings("not json")).toEqual(defaultSettings);
  expect(parseSettings(JSON.stringify(null))).toEqual(defaultSettings);
  expect(parseSettings(JSON.stringify([1, 2, 3]))).toEqual(defaultSettings);
  expect(
    parseSettings(
      JSON.stringify({
        notifyReady: "yes",
        notifySound: true,
        reduceMotion: "always",
        compactNumbers: 1,
        unknownField: "ignored",
      }),
    ),
  ).toEqual({ ...defaultSettings, notifySound: true });
  for (const reduceMotion of ["system", "on", "off"])
    expect(parseSettings(JSON.stringify({ reduceMotion })).reduceMotion).toBe(
      reduceMotion,
    );
});

test("compact EP is presentation only and never rounds a spendable amount", () => {
  expect(formatEPCompact(0)).toBe("0");
  expect(formatEPCompact(5801)).toBe("5,801");
  expect(formatEPCompact(99999)).toBe("99,999");
  expect(formatEPCompact(100000)).toBe("100K");
  expect(formatEPCompact(1234567)).toBe("1.2M");
  expect(formatEPCompact(12500000)).toBe("12.5M");
  expect(formatEPCompact(186186584)).toBe("186M");
  expect(formatEPCompact(1000000000)).toBe("1B");
  // Purchases still use exact EP regardless of the display preference.
  const item = productById.get("archive-lens");
  const spent = buy(
    rich({ balance: item.price, totalEarned: item.price }),
    item.id,
  );
  expect(spent.balance).toBe(0);
  expect(spent.history.at(-1).ep).toBe(item.price);
  expect(formatEP(item.price)).toBe(item.price.toLocaleString("en-US"));
});

test("late-game offline vaults raise the per-absence cap without touching the rate", () => {
  let p = rich();
  expect(offlineSettings([])).toEqual({ intervalMS: 600000, cap: 144 });
  for (const id of [
    "offline-roller",
    "offline-clock-1",
    "offline-vault-1",
    "offline-clock-2",
    "offline-vault-2",
    "offline-clock-3",
  ])
    p = buy(p, id);
  expect(offlineSettings(p.owned)).toEqual({ intervalMS: 180000, cap: 288 });
  // A vault without its clock prerequisite cannot be owned.
  expect(() =>
    buy(rich({ owned: ["offline-roller"] }), "offline-vault-1"),
  ).toThrow("Requires");
});

test("Persistence Core requires Auto-Roll and grants no timing, odds or EP advantage", () => {
  expect(() => buy(rich(), "persistence-core")).toThrow("Requires");
  const core = productById.get("persistence-core");
  expect(core.value).toBeUndefined();
  expect(core.charges).toBeUndefined();
  const before = rich();
  const after = buy(buy(before, "auto-roll"), "persistence-core");
  expect(after.balance).toBe(
    before.balance - core.price - productById.get("auto-roll").price,
  );
  expect(after.equipped).toBe("none");
});

test("every catalogue entry declares a known kind and late tiers stay optional", () => {
  const kinds = new Set([
    "roll",
    "cooldown",
    "pace",
    "aura",
    "utility",
    "offline",
    "offline-cap",
  ]);
  for (const product of shopProducts) {
    expect(kinds.has(product.kind)).toBe(true);
    if (product.lateGame) expect(product.requires).toBeTruthy();
    if (product.requires) expect(productById.has(product.requires)).toBe(true);
  }
});

test("new auras are cosmetic, uniquely priced and renderable by the shared number box", async () => {
  const auras = shopProducts.filter((p) => p.kind === "aura");
  expect(auras).toHaveLength(12);
  const added = ["tidepool", "verdant", "circuit", "obsidian", "singularity"];
  for (const id of added) {
    const aura = productById.get(id);
    expect(aura.kind).toBe("aura");
    expect(aura.icon).toBeTruthy();
    expect(aura.description.length).toBeGreaterThan(30);
    // An aura must never carry a gameplay payload of any kind.
    expect(aura.value ?? aura.charges ?? aura.requires).toBeUndefined();
    expect(aura.lateGame).toBeUndefined();
  }
  // The renderer must accept exactly the catalogue's auras, no more and no less.
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync("src/components/NumberBox.jsx", "utf8"),
  );
  for (const aura of auras) expect(source).toContain(`"${aura.id}"`);
  // Prices are distinct so every aura occupies its own rung of the ladder.
  const prices = auras.map((a) => a.price);
  expect(new Set(prices).size).toBe(prices.length);
});

test("buying an aura equips it and equipping another is free", () => {
  let p = rich({ balance: 6000000, totalEarned: 6000000 });
  p = buy(p, "tidepool");
  expect(p.equipped).toBe("tidepool");
  const afterPurchase = p.balance;
  p = applyProgress(p, { type: "equip", id: "none" });
  expect(p.equipped).toBe("none");
  p = applyProgress(p, { type: "equip", id: "tidepool" });
  expect(p.equipped).toBe("tidepool");
  // Re-equipping an owned aura never costs EP.
  expect(p.balance).toBe(afterPurchase);
  // An unowned aura cannot be worn.
  expect(() => applyProgress(p, { type: "equip", id: "singularity" })).toThrow(
    "Purchase this aura",
  );
});

test("the goal recap ring reflects the wallet without inventing progress", async () => {
  const { currentGoal } = await import("../src/gameplay-loop.js");
  const fresh = {
    ...emptyProgress(),
    profile: { id: "p", username: "a", createdAt: 1 },
  };
  const goal = currentGoal(fresh);
  expect(goal.id).toBe("quickwind-1");
  // The ring is a pure function of wallet over price, clamped at both ends.
  const fill = (balance) => Math.min(100, (balance / goal.price) * 100);
  expect(fill(0)).toBe(0);
  expect(fill(goal.price / 2)).toBe(50);
  expect(fill(goal.price)).toBe(100);
  expect(fill(goal.price * 3)).toBe(100);
  // Saved EP is capped at the price, so it can never overstate progress.
  expect(Math.min(goal.price * 3, goal.price)).toBe(goal.price);
});
