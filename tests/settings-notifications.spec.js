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
  expect(formatEP(item.price)).toBe("150,000");
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
