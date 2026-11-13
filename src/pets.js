export const PETS = [
  {
    id: "pebble",
    name: "Pebble",
    accent: "#a8a29e",
    multiplier: 1.05,
    price: 125000,
    dropWeight: 40,
    description:
      "A small loyal rock. Does very little, extremely reliably. Adds 5% to the EP that reaches your wallet.",
  },
  {
    id: "moth",
    name: "Lumen Moth",
    accent: "#fbbf24",
    multiplier: 1.09,
    price: 300000,
    dropWeight: 30,
    description:
      "Drawn to bright numbers. Flutters around the reveal and adds 9% to banked EP.",
  },
  {
    id: "moss",
    name: "Moss Beetle",
    accent: "#84cc16",
    multiplier: 1.11,
    price: 450000,
    dropWeight: 26,
    description:
      "Carries a tiny garden on its back and never hurries a number. Adds 11% to banked EP.",
  },
  {
    id: "kit",
    name: "Static Kit",
    accent: "#fb923c",
    multiplier: 1.13,
    price: 600000,
    dropWeight: 22,
    description:
      "A fox with a permanent case of bed-hair. Adds 13% to banked EP.",
  },
  {
    id: "snail",
    name: "Lunar Snail",
    accent: "#a78bfa",
    multiplier: 1.17,
    price: 900000,
    dropWeight: 16,
    description:
      "Crosses the whole screen during a single cooldown. Adds 17% to banked EP.",
  },
  {
    id: "jelly",
    name: "Tide Jelly",
    accent: "#38bdf8",
    multiplier: 1.21,
    price: 1250000,
    dropWeight: 12,
    description:
      "Drifts through the cooldown without a care. Adds 21% to banked EP.",
  },
  {
    id: "bee",
    name: "Amber Bee",
    accent: "#facc15",
    multiplier: 1.26,
    price: 1650000,
    dropWeight: 9,
    description:
      "Counts every digit on the way past, three times. Adds 26% to banked EP.",
  },
  {
    id: "corvid",
    name: "Ledger Corvid",
    accent: "#818cf8",
    multiplier: 1.31,
    price: 2050000,
    dropWeight: 7,
    description:
      "Keeps meticulous notes on every number you roll. Adds 31% to banked EP.",
  },
  {
    id: "owl",
    name: "Archive Owl",
    accent: "#f59e0b",
    multiplier: 1.37,
    price: 2500000,
    dropWeight: 5,
    description:
      "Has read the entire badge catalogue twice. Adds 37% to banked EP.",
  },
  {
    id: "turtle",
    name: "Patient Turtle",
    accent: "#34d399",
    multiplier: 1.43,
    price: 3100000,
    dropWeight: 4,
    description:
      "Slow, unhurried, and never in a rush for a bad number. Adds 43% to banked EP.",
  },
  {
    id: "crab",
    name: "Clockwork Crab",
    accent: "#f97316",
    multiplier: 1.46,
    price: 3400000,
    dropWeight: 4,
    description:
      "Winds itself between rolls and keeps the rack moving. Adds 46% to banked EP.",
  },
  {
    id: "griffin",
    name: "Storm Griffin",
    accent: "#60a5fa",
    multiplier: 1.5,
    price: 3800000,
    dropWeight: 3,
    description:
      "Circles the reveal three times before it settles. Adds 50% to banked EP.",
  },
  {
    id: "unicorn",
    name: "Astral Unicorn",
    accent: "#f472b6",
    multiplier: 1.6,
    price: 5000000,
    dropWeight: 2,
    description:
      "Rare, radiant and slightly smug about it. Adds 60% to banked EP.",
  },
  {
    id: "serpent",
    name: "Void Serpent",
    accent: "#8b5cf6",
    multiplier: 1.7,
    price: 7000000,
    dropWeight: 1,
    description:
      "Swallows whole cooldowns and looks for more. Adds 70% to banked EP.",
  },
  {
    id: "axolotl",
    name: "Comet Axolotl",
    accent: "#22d3ee",
    multiplier: 1.75,
    price: 8500000,
    dropWeight: 1,
    description:
      "Swims through the reveal with a tail of cold light. Adds 75% to banked EP.",
  },
  {
    id: "dragonet",
    name: "Ember Dragonet",
    accent: "#ef4444",
    multiplier: 1.8,
    price: 10000000,
    dropWeight: 1,
    description:
      "Small, smug and faintly on fire. The largest companion bonus: 80%.",
  },
];

export const petById = new Map(PETS.map((pet) => [pet.id, pet]));
export const PET_IDS = PETS.map((pet) => pet.id);

export const PET_DROP_CHANCE = 0.004;

export function petMultiplier(activePet) {
  return petById.get(activePet)?.multiplier ?? 1;
}

export function walletEP(scoredEP, activePet) {
  const multiplier = petMultiplier(activePet);
  return multiplier === 1 ? scoredEP : Math.round(scoredEP * multiplier);
}

export function petBonusEP(scoredEP, activePet) {
  return walletEP(scoredEP, activePet) - scoredEP;
}

export function petDrop(sample, owned = [], luck = 1) {
  if (!(sample >= 0 && sample < 1)) return null;
  const window = Math.min(1, PET_DROP_CHANCE * luck);
  if (sample >= window) return null;
  const missing = PETS.filter((pet) => !owned.includes(pet.id));
  if (!missing.length) return null;

  const total = missing.reduce((sum, pet) => sum + pet.dropWeight, 0);
  let cursor = (sample / window) * total;
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
