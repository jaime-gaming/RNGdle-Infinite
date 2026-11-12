import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import fs from "node:fs";
import { allBadgeMetadata } from "../src/infinite-badges.js";
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
  validUsername,
} from "../src/progress.js";
import {
  CHANGELOG,
  LATEST_VERSION,
  hasUnseenVersion,
  markSeen,
  readSeenVersion,
} from "../src/changelog.js";
import { buildShareText, GAME_URL } from "../src/roll-data.js";
import { skillForPet } from "../src/skills.js";
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

  const scored = plain.history.find((e) => e.type === "roll");
  const boosted = withPet.history.find((e) => e.type === "roll");
  expect(boosted.ep).toBe(scored.ep);
  expect(boosted.number).toBe(scored.number);
  expect(boosted.tier).toBe(scored.tier);

  expect(withPet.balance - 5000000).toBe(walletEP(result.totalEP, "dragonet"));
  expect(boosted.petBonus).toBe(petBonusEP(result.totalEP, "dragonet"));
  expect(plain.history.find((e) => e.type === "roll").petBonus).toBeUndefined();

  expect(withPet.discovered).toEqual(plain.discovered);
});

test("companion multipliers stay ordered, and never reach the draw", () => {
  expect(PETS).toHaveLength(16);
  const multipliers = PETS.map((p) => p.multiplier);
  expect(Math.min(...multipliers)).toBeGreaterThanOrEqual(1.01);

  expect(Math.max(...multipliers)).toBeLessThanOrEqual(1.8);

  const signatures = PETS.map((p) => skillForPet(p.id)?.id);
  expect(signatures.every(Boolean)).toBe(true);
  expect(new Set(signatures).size).toBe(PETS.length);
  for (const signature of PETS.map((p) => skillForPet(p.id))) {
    expect(signature.source).toBe("pet");
    expect(signature.charges).toBeGreaterThan(0);
  }

  const weights = PETS.map((p) => p.dropWeight);
  expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  expect([...multipliers].sort((a, b) => a - b)).toEqual(multipliers);
  expect(PETS.map((p) => p.price).sort((a, b) => a - b)).toEqual(
    PETS.map((p) => p.price),
  );
  expect(PETS.map((pet) => pet.price)).toEqual([
    125000, 300000, 450000, 600000, 900000, 1250000, 1650000, 2050000, 2500000,
    3100000, 3400000, 3800000, 5000000, 7000000, 8500000, 10000000,
  ]);
  expect(petMultiplier("none")).toBe(1);
  expect(petMultiplier("not-a-pet")).toBe(1);
  expect(walletEP(5801, "none")).toBe(5801);
  expect(petBonusLabel(1.2)).toBe("+20% EP");

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

  const balance = p.balance;
  p = applyProgress(p, { type: "equip-pet", id: "none" });
  expect(p.activePet).toBe("none");
  p = applyProgress(p, { type: "equip-pet", id: "kit" });
  expect(p.balance).toBe(balance);
  expect(() => applyProgress(p, { type: "equip-pet", id: "dragonet" })).toThrow(
    "before equipping",
  );

  const forged = parseProgress(
    JSON.stringify({ ...p, pets: ["kit", "ghost"], activePet: "ghost" }),
  );
  expect(forged.pets).toEqual(["kit"]);
  expect(forged.activePet).toBe("none");
});

test("companion drops are rare, weighted and cannot duplicate or auto-swap", () => {
  expect(PET_DROP_CHANCE).toBeLessThanOrEqual(0.01);

  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = petDrop((i / 1000) * PET_DROP_CHANCE, []);
    expect(petById.has(id)).toBe(true);
    seen.add(id);
  }
  expect(seen.size).toBeGreaterThan(1);

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
  expect(p.activePet).toBe("pebble");

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
  expect(GAME_URL).toBe("https://rngdle-infinite.jaime-gaming.com");
  const text = buildShareText(evaluate(1337));
  expect(text.trim().endsWith(GAME_URL)).toBe(true);
  expect(text).toContain("RNGdle Infinite");
});

test("the changelog lists every release and flags an unseen version", () => {
  expect(CHANGELOG.map((e) => e.version)).toEqual([
    "v0.6",
    "v0.5.2",
    "v0.5.1",
    "v0.5",
    "v0.4.1",
    "v0.4",
    "v0.3",
    "v0.2",
    "v0.1",
  ]);
  expect(LATEST_VERSION).toBe("v0.6");
  expect(hasUnseenVersion("v0.2")).toBe(true);
  const launch = CHANGELOG.at(-1);
  expect(launch.title).toBe("launch");
  expect(launch.body[0]).toContain("the game is live");

  for (const entry of CHANGELOG) {
    expect(entry.body.length).toBeGreaterThan(0);
  }

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

  for (const [, value] of css.matchAll(/translateY\((-?[\d.]+)px\)/g))
    expect(Math.abs(Number(value))).toBeLessThanOrEqual(8);

  const styles = fs.readFileSync("src/styles.css", "utf8");
  expect(styles).toContain("prefers-reduced-motion: reduce");
  expect(styles).toContain("animation: none !important");
  expect(styles).toContain("transition: none !important");
});

test("the changelog reads like release notes, not like a chat log", () => {
  for (const entry of CHANGELOG) {
    expect(entry.version).toMatch(/^v\d+\.\d+(\.\d+)?$/);
    expect(entry.title.length).toBeGreaterThan(5);
    expect(entry.title).toMatch(/^[a-z]/);
    for (const line of entry.body) {
      expect(line).toMatch(/^[a-z]/);

      if (entry.version === "v0.4.1") {
        expect(line).toBe("qol, like basic UI changes :D");
        continue;
      }

      expect(line.length).toBeLessThanOrEqual(140);

      expect(line.trim().endsWith(".")).toBe(true);

      expect(line).not.toMatch(/\b(uhh+|tf|lol|idk|tbh|omg|pls|u)\b/i);
    }
  }

  // The newest note stays tight; every note stays within its eight-line cap.
  expect(CHANGELOG[0].body.length).toBeLessThanOrEqual(7);

  for (const entry of CHANGELOG)
    expect(entry.body.length).toBeLessThanOrEqual(8);

  const v02 = CHANGELOG.find((entry) => entry.version === "v0.2");
  const v06 = CHANGELOG.find((entry) => entry.version === "v0.6");
  const oldNamed = v02.body.find((line) => line.startsWith("new badges:"));
  const newNamed = v06.body.join(" ");
  for (const badge of allBadgeMetadata.filter((b) =>
    b.id.startsWith("INFINITE_"),
  )) {
    const named = ["INFINITE_PENDULUM", "INFINITE_LAST_SECOND"].includes(
      badge.id,
    )
      ? oldNamed
      : newNamed;
    expect(named).toContain(badge.name);
  }
});

test("the badge names in the v0.2 note are links that open the badge window", async ({
  page,
}) => {
  await page.goto("/changelog");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "Changelog", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("What changed, and when.")).toBeVisible();
  const v02 = page.locator(".changelog-entry", {
    has: page.getByText("v0.2", { exact: true }),
  });
  const links = v02.locator(".changelog-badge-link");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveText("Pendulum");
  await expect(links.nth(1)).toHaveText("Last Second");

  const line = links.first().locator("xpath=..");
  await expect(line).toContainText(
    "New badges: Pendulum (anomaly) and Last Second (mythic).",
  );
  await expect(line.locator(".emoji img")).toHaveCount(2);
  await links.nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#modal-title")).toHaveText("Last Second");
  await expect(dialog).toContainText("Mythic");
  await expect(dialog).toContainText("Not discovered yet");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("every companion wears its own colour and has its own face", async () => {
  const icons = await import("node:fs").then((fs) =>
    fs.readFileSync("src/components/game-icons.jsx", "utf8"),
  );
  const token = await import("node:fs").then((fs) =>
    fs.readFileSync("src/pet-figure.css", "utf8"),
  );
  const colours = new Set();
  for (const pet of PETS) {
    expect(pet.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(colours.has(pet.accent)).toBe(false);
    colours.add(pet.accent);

    expect(icons).toContain(`  ${pet.id}: (`);
    expect(skillForPet(pet.id)?.petId).toBe(pet.id);
  }

  expect(token).toContain("var(--pet-accent,");
  const icon = await import("node:fs").then((fs) =>
    fs.readFileSync("src/components/PetIcon.jsx", "utf8"),
  );
  expect(icon).toContain('"--pet-accent": accent');
  expect(icon).toContain("petById.get(pet)?.accent");
});

test("share is the single copy action and carries the link with it", () => {
  const source = fs.readFileSync("src/components/RollExperience.jsx", "utf8");

  expect(source).not.toContain("share-link");
  expect(source).not.toContain("copyLink");
  expect(source.match(/async function share\(/g)).toHaveLength(1);
  expect(source).not.toContain("Game link");
  const text = buildShareText(evaluate(1337));
  expect(text).toContain(GAME_URL);
});

test("the goal recap is a ring and a shop link, with the figures still announced", () => {
  const source = fs.readFileSync("src/components/GoalRecap.jsx", "utf8");

  expect(source).not.toContain("<progress");
  expect(source).not.toContain("goal-recap-figures");
  expect(source).not.toContain("SAVING TOWARDS");
  expect(source).toContain("goal-recap-ring");

  expect(source).toContain("aria-label={label}");
  expect(source).toContain("Saving towards");
  const css = fs.readFileSync("src/goal-recap.css", "utf8");
  expect(css).toContain("conic-gradient");
});

test("sign-up validates the name live and states what is and is not kept", () => {
  const source = fs.readFileSync("src/components/LocalProfile.jsx", "utf8");

  expect(source).toContain("disabled={pending || !ready}");
  expect(source).toContain("validUsername");
  expect(source).toContain("aria-invalid");
  expect(source).toContain("Choose a name to save progress on this device.");
  expect(source).toContain("Your current guest progress will be kept.");
  expect(source).toContain(
    "Guest progress from this session will not carry over.",
  );
  expect(source).toContain("This profile stays on this device.");
  expect(source).not.toContain("A fresh start:");

  for (const good of ["abc", "Lucky_Otter-12", "Zoë99"])
    expect(validUsername(good)).toBe(true);
  for (const bad of ["ab", "", "a".repeat(21), "has space", "bad!"])
    expect(validUsername(bad)).toBe(false);
});
