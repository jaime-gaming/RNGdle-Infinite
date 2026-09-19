import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  PETS,
  petById,
  petDrop,
  walletEP,
  petBonusEP,
  petMultiplier,
  PET_DROP_CHANCE,
  petBonusLabel,
} from "../src/pets.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import {
  CHANGELOG,
  LATEST_VERSION,
  hasUnseenVersion,
  markSeen,
  readSeenVersion,
} from "../src/changelog.js";
import { buildShareText, GAME_URL } from "../src/roll-data.js";
import { evaluate } from "./helpers/index.js";

const fund = (balance) => ({
  ...emptyProgress(),
  balance,
  totalEarned: balance,
});

test("a companion multiplies banked EP only, never the scored roll", () => {
  const result = evaluate(1337);
  const plain = applyProgress(emptyProgress(), {
    type: "complete",
    result,
    id: "a",
    cooldownUntil: 1,
    at: 1,
  });
  const withPet = applyProgress(
    { ...fund(5000000), pets: ["dragonet"], activePet: "dragonet" },
    { type: "complete", result, id: "a", cooldownUntil: 1, at: 1 },
  );
  // The recorded roll is identical: same number, tier and scored EP.
  const scored = plain.history.find((e) => e.type === "roll");
  const boosted = withPet.history.find((e) => e.type === "roll");
  expect(boosted.ep).toBe(scored.ep);
  expect(boosted.number).toBe(scored.number);
  expect(boosted.tier).toBe(scored.tier);
  // Only the wallet differs, and the bonus is disclosed on the event.
  expect(withPet.balance - 5000000).toBe(walletEP(result.totalEP, "dragonet"));
  expect(boosted.petBonus).toBe(petBonusEP(result.totalEP, "dragonet"));
  expect(plain.history.find((e) => e.type === "roll").petBonus).toBeUndefined();
  // Discoveries are unaffected by companions.
  expect(withPet.discovered).toEqual(plain.discovered);
});

test("companion multipliers stay small and ordered, and never reach the draw", () => {
  expect(PETS).toHaveLength(6);
  const multipliers = PETS.map((p) => p.multiplier);
  expect(Math.min(...multipliers)).toBeGreaterThanOrEqual(1.01);
  // A deliberate ceiling: companions nudge the economy, they do not replace it.
  expect(Math.max(...multipliers)).toBeLessThanOrEqual(1.25);
  expect([...multipliers].sort((a, b) => a - b)).toEqual(multipliers);
  expect(PETS.map((p) => p.price).sort((a, b) => a - b)).toEqual(
    PETS.map((p) => p.price),
  );
  expect(petMultiplier("none")).toBe(1);
  expect(petMultiplier("not-a-pet")).toBe(1);
  expect(walletEP(5801, "none")).toBe(5801);
  expect(petBonusLabel(1.2)).toBe("+20% EP");
  // Every credited amount stays a whole number of EP.
  for (const pet of PETS)
    expect(Number.isInteger(walletEP(5801, pet.id))).toBe(true);
});

test("companions are bought or found, equip freely and cannot be faked", () => {
  let p = fund(4000000);
  p = applyProgress(p, { type: "buy-pet", id: "kit", at: 1 });
  expect(p.pets).toEqual(["kit"]);
  expect(p.activePet).toBe("kit");
  expect(p.balance).toBe(4000000 - petById.get("kit").price);
  expect(p.history.at(-1)).toMatchObject({
    type: "purchase",
    productId: "kit",
    ep: petById.get("kit").price,
  });
  expect(() => applyProgress(p, { type: "buy-pet", id: "kit" })).toThrow(
    "already have",
  );
  expect(() => applyProgress(fund(0), { type: "buy-pet", id: "kit" })).toThrow(
    "Not enough",
  );
  expect(() => applyProgress(p, { type: "buy-pet", id: "nope" })).toThrow(
    "not available",
  );
  // Swapping is free; an unowned companion cannot be worn.
  const balance = p.balance;
  p = applyProgress(p, { type: "equip-pet", id: "none" });
  expect(p.activePet).toBe("none");
  p = applyProgress(p, { type: "equip-pet", id: "kit" });
  expect(p.balance).toBe(balance);
  expect(() => applyProgress(p, { type: "equip-pet", id: "dragonet" })).toThrow(
    "before equipping",
  );
  // Corrupt saves cannot smuggle in a companion or a bonus.
  const forged = parseProgress(
    JSON.stringify({ ...p, pets: ["kit", "ghost"], activePet: "ghost" }),
  );
  expect(forged.pets).toEqual(["kit"]);
  expect(forged.activePet).toBe("none");
});

test("companion drops are rare, weighted and cannot duplicate or auto-swap", () => {
  expect(PET_DROP_CHANCE).toBeLessThanOrEqual(0.01);
  // Deterministic sweep across the drop window: every sample is a valid pet.
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = petDrop((i / 1000) * PET_DROP_CHANCE, []);
    expect(petById.has(id)).toBe(true);
    seen.add(id);
  }
  expect(seen.size).toBeGreaterThan(1);
  // Outside the window, and with everything owned, nothing drops.
  expect(petDrop(PET_DROP_CHANCE, [])).toBeNull();
  expect(petDrop(0.5, [])).toBeNull();
  expect(petDrop(-1, [])).toBeNull();
  expect(
    petDrop(
      0.0001,
      PETS.map((p) => p.id),
    ),
  ).toBeNull();

  const result = evaluate(1337);
  // A drop is credited once, logged, and equipped only if nothing is worn.
  let p = applyProgress(emptyProgress(), {
    type: "complete",
    result,
    id: "r1",
    cooldownUntil: 1,
    at: 1,
    petDrop: "pebble",
  });
  expect(p.pets).toEqual(["pebble"]);
  expect(p.activePet).toBe("pebble");
  expect(p.history.find((e) => e.type === "pet")).toMatchObject({
    productId: "pebble",
  });
  p = applyProgress(p, {
    type: "complete",
    result,
    id: "r2",
    cooldownUntil: 1,
    at: 2,
    petDrop: "moth",
  });
  expect(p.pets).toEqual(["pebble", "moth"]);
  expect(p.activePet).toBe("pebble"); // A later find never swaps your choice.
  // An already-owned or invalid drop is ignored rather than duplicated.
  p = applyProgress(p, {
    type: "complete",
    result,
    id: "r3",
    cooldownUntil: 1,
    at: 3,
    petDrop: "pebble",
  });
  expect(p.pets).toEqual(["pebble", "moth"]);
});

test("guest play is not saved and signing up starts a clean account", () => {
  const result = evaluate(1337);
  let guest = applyProgress(emptyProgress(), {
    type: "complete",
    result,
    id: "guest-roll",
    cooldownUntil: 9,
    at: 1,
  });
  guest = { ...guest, pets: ["pebble"], activePet: "pebble" };
  expect(guest.balance).toBeGreaterThan(0);
  expect(guest.discovered.length).toBeGreaterThan(0);
  const account = applyProgress(guest, {
    type: "register",
    id: "u1",
    username: "tester",
    createdAt: 2,
  });
  // Nothing rolled before signing up carries into the account.
  expect(account.profile).toMatchObject({ username: "tester" });
  expect(account.balance).toBe(0);
  expect(account.totalEarned).toBe(0);
  expect(account.history).toEqual([]);
  expect(account.discovered).toEqual([]);
  expect(account.owned).toEqual([]);
  expect(account.pets).toEqual([]);
  expect(account.receipts).toEqual([]);
  expect(account.cooldownUntil).toBe(0);
});

test("share text ends with the public game link", () => {
  expect(GAME_URL).toBe("https://jaime-gaming.github.io/RNGdle-Infinite");
  const text = buildShareText(evaluate(1337));
  expect(text.trim().endsWith(GAME_URL)).toBe(true);
  expect(text).toContain("RNGdle Infinite");
});

test("the changelog lists both releases and flags an unseen version", () => {
  expect(CHANGELOG.map((e) => e.version)).toEqual(["v0.2", "v0.1"]);
  expect(LATEST_VERSION).toBe("v0.2");
  const launch = CHANGELOG.at(-1);
  expect(launch.title).toBe("launch");
  expect(launch.body).toEqual(["so uhhhh we launched RNGdle infinite"]);
  for (const entry of CHANGELOG) expect(entry.body.length).toBeGreaterThan(0);
  // The flag shows until the newest version is acknowledged.
  expect(hasUnseenVersion("")).toBe(true);
  expect(hasUnseenVersion("v0.1")).toBe(true);
  expect(hasUnseenVersion(LATEST_VERSION)).toBe(false);
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  expect(readSeenVersion(storage)).toBe("");
  markSeen(LATEST_VERSION, storage);
  expect(readSeenVersion(storage)).toBe(LATEST_VERSION);
  // Unavailable storage must never throw into the render path.
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  expect(readSeenVersion(broken)).toBe("");
  expect(markSeen(LATEST_VERSION, broken)).toBe(false);
});

test("ambient animations are subtle and fully disabled by reduced motion", () => {
  const css = fs.readFileSync("src/ambient.css", "utf8");
  // Nothing should travel far enough to be distracting.
  for (const [, value] of css.matchAll(/translateY\((-?[\d.]+)px\)/g))
    expect(Math.abs(Number(value))).toBeLessThanOrEqual(8);
  // The global reset in styles.css kills every animation and transition.
  const styles = fs.readFileSync("src/styles.css", "utf8");
  expect(styles).toContain("prefers-reduced-motion: reduce");
  expect(styles).toContain("animation: none !important");
  expect(styles).toContain("transition: none !important");
});
