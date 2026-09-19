// Pets are cosmetic companions that carry a small wallet multiplier.
//
// Deliberate boundary: a pet multiplies only the EP that lands in your wallet.
// It never touches the uniform 0–1,000,000 draw, the badge rules, the scored
// EP of a roll, its tier or its rank. Two players rolling the same number
// always score identically; only their spending power differs. That keeps the
// leaderboard-facing numbers honest while letting prices stay where they are.
//
// Multipliers are small on purpose (+4% to +20%) so the shop still costs what
// the balance pass decided it should cost.
export const PETS = [
  {
    id: "pebble",
    name: "Pebble",
    emoji: "🪨",
    multiplier: 1.04,
    price: 45000,
    dropWeight: 40,
    description:
      "A small loyal rock. Does very little, extremely reliably. Adds 4% to the EP that reaches your wallet.",
  },
  {
    id: "moth",
    name: "Lumen Moth",
    emoji: "🦋",
    multiplier: 1.06,
    price: 120000,
    dropWeight: 26,
    description:
      "Drawn to bright numbers. Flutters around the reveal and adds 6% to banked EP.",
  },
  {
    id: "kit",
    name: "Static Kit",
    emoji: "🦊",
    multiplier: 1.09,
    price: 320000,
    dropWeight: 16,
    description:
      "A fox with a permanent case of bed-hair. Adds 9% to banked EP.",
  },
  {
    id: "jelly",
    name: "Tide Jelly",
    emoji: "🪼",
    multiplier: 1.12,
    price: 700000,
    dropWeight: 10,
    description: "Drifts through the cooldown without a care. Adds 12%.",
  },
  {
    id: "corvid",
    name: "Ledger Corvid",
    emoji: "🐦‍⬛",
    multiplier: 1.15,
    price: 1400000,
    dropWeight: 6,
    description:
      "Keeps meticulous notes on every number you roll. Adds 15% to banked EP.",
  },
  {
    id: "dragonet",
    name: "Ember Dragonet",
    emoji: "🐉",
    multiplier: 1.2,
    price: 3000000,
    dropWeight: 2,
    description:
      "Small, smug and faintly on fire. The largest companion bonus: 20%.",
  },
];

export const petById = new Map(PETS.map((pet) => [pet.id, pet]));
export const PET_IDS = PETS.map((pet) => pet.id);

// A rare chance for a pet to show up on its own, so they are not purely a
// shopping list. Rolled independently of the number, after it is drawn, so it
// can never bias the draw itself.
export const PET_DROP_CHANCE = 0.004; // 1 in 250 rolls.

export function petMultiplier(activePet) {
  return petById.get(activePet)?.multiplier ?? 1;
}

// Wallet credit for a scored roll. The scored EP is passed through untouched;
// only the banked amount grows, and always by whole EP.
export function walletEP(scoredEP, activePet) {
  const multiplier = petMultiplier(activePet);
  return multiplier === 1 ? scoredEP : Math.round(scoredEP * multiplier);
}

export function petBonusEP(scoredEP, activePet) {
  return walletEP(scoredEP, activePet) - scoredEP;
}

// Which pet a roll awards, if any. `sample` is a uniform 0–1 value taken from
// a dedicated random source so pet luck never consumes or shifts roll luck.
export function petDrop(sample, owned = []) {
  if (!(sample >= 0 && sample < 1)) return null;
  if (sample >= PET_DROP_CHANCE) return null;
  const missing = PETS.filter((pet) => !owned.includes(pet.id));
  if (!missing.length) return null;
  // Rarer pets are rarer drops too; position within the drop window decides.
  const total = missing.reduce((sum, pet) => sum + pet.dropWeight, 0);
  let cursor = (sample / PET_DROP_CHANCE) * total;
  for (const pet of missing) {
    cursor -= pet.dropWeight;
    if (cursor < 0) return pet.id;
  }
  return missing[missing.length - 1].id;
}

export function formatMultiplier(multiplier) {
  return `${multiplier.toFixed(2).replace(/0$/, "").replace(/\.$/, "")}×`;
}

export function petBonusLabel(multiplier) {
  return `+${Math.round((multiplier - 1) * 100)}% EP`;
}
