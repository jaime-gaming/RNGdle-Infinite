// Companions are collectable friends that carry a wallet multiplier and one
// exclusive skill.
//
// Deliberate boundary: a companion multiplies only the EP that lands in your
// wallet. It never touches the uniform 0–1,000,000 draw, the badge rules, the
// scored EP of a roll, its tier or its rank. Two players rolling the same
// number always score identically; only their spending power differs. That
// keeps the leaderboard-facing numbers honest while letting prices stay where
// they are.
//
// The multipliers are deliberately modest — their signature skill is the real
// prize — so the shop still costs what the balance pass decided it should.
//
// Companion artwork is drawn for the game rather than borrowed from an emoji
// font: every id here has a matching glyph in `components/game-icons.jsx`, and a
// test fails if the two ever drift apart.
export const PETS = [
  {
    id: "pebble",
    name: "Pebble",
    multiplier: 1.05,
    price: 45000,
    dropWeight: 40,
    description:
      "A small loyal rock. Does very little, extremely reliably. Adds 5% to the EP that reaches your wallet.",
  },
  {
    id: "moth",
    name: "Lumen Moth",
    multiplier: 1.09,
    price: 120000,
    dropWeight: 30,
    description:
      "Drawn to bright numbers. Flutters around the reveal and adds 9% to banked EP.",
  },
  {
    id: "kit",
    name: "Static Kit",
    multiplier: 1.13,
    price: 320000,
    dropWeight: 22,
    description:
      "A fox with a permanent case of bed-hair. Adds 13% to banked EP.",
  },
  {
    id: "snail",
    name: "Lunar Snail",
    multiplier: 1.17,
    price: 560000,
    dropWeight: 16,
    description:
      "Crosses the whole screen during a single cooldown. Adds 17% to banked EP.",
  },
  {
    id: "jelly",
    name: "Tide Jelly",
    multiplier: 1.21,
    price: 900000,
    dropWeight: 12,
    description:
      "Drifts through the cooldown without a care. Adds 21% to banked EP.",
  },
  {
    id: "bee",
    name: "Amber Bee",
    multiplier: 1.26,
    price: 1400000,
    dropWeight: 9,
    description:
      "Counts every digit on the way past, three times. Adds 26% to banked EP.",
  },
  {
    id: "corvid",
    name: "Ledger Corvid",
    multiplier: 1.31,
    price: 2100000,
    dropWeight: 7,
    description:
      "Keeps meticulous notes on every number you roll. Adds 31% to banked EP.",
  },
  {
    id: "owl",
    name: "Archive Owl",
    multiplier: 1.37,
    price: 3200000,
    dropWeight: 5,
    description:
      "Has read the entire badge catalogue twice. Adds 37% to banked EP.",
  },
  {
    id: "turtle",
    name: "Patient Turtle",
    multiplier: 1.43,
    price: 4800000,
    dropWeight: 4,
    description:
      "Slow, unhurried, and never in a rush for a bad number. Adds 43% to banked EP.",
  },
  {
    id: "griffin",
    name: "Storm Griffin",
    multiplier: 1.5,
    price: 7000000,
    dropWeight: 3,
    description:
      "Circles the reveal three times before it settles. Adds 50% to banked EP.",
  },
  {
    id: "unicorn",
    name: "Astral Unicorn",
    multiplier: 1.6,
    price: 10000000,
    dropWeight: 2,
    description:
      "Rare, radiant and slightly smug about it. Adds 60% to banked EP.",
  },
  {
    id: "serpent",
    name: "Void Serpent",
    multiplier: 1.7,
    price: 14000000,
    dropWeight: 1,
    description:
      "Swallows whole cooldowns and looks for more. Adds 70% to banked EP.",
  },
  {
    id: "dragonet",
    name: "Ember Dragonet",
    multiplier: 1.8,
    price: 20000000,
    dropWeight: 1,
    description:
      "Small, smug and faintly on fire. The largest companion bonus: 80%.",
  },
];

export const petById = new Map(PETS.map((pet) => [pet.id, pet]));
export const PET_IDS = PETS.map((pet) => pet.id);

// A rare chance for a pet to show up on its own, so they are not purely a
// shopping list. Rolled independently of the number, after it is drawn, so it
// can never bias the draw itself. The Trail and Drift skills multiply this
// window for the single roll they fire on, and nothing else touches it.
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
export function petDrop(sample, owned = [], luck = 1) {
  if (!(sample >= 0 && sample < 1)) return null;
  const window = Math.min(1, PET_DROP_CHANCE * luck);
  if (sample >= window) return null;
  const missing = PETS.filter((pet) => !owned.includes(pet.id));
  if (!missing.length) return null;
  // Rarer pets are rarer drops too; position within the drop window decides.
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
