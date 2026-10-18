// CLEANUP Nov 4, 2026: delete this file with the World. Ordinary rolls never
// used it.
import { WORLD_MINI_RANGES } from "./rngween-world-badges.js";

// An independent, finite world. Main-game rolls still allow repeats and keep
// their ordinary 0–1,000,000 distribution. No scored EP or skills live here.
export function randomWorldNumber(
  drawn = [],
  cryptoProvider = globalThis.crypto,
) {
  const max = 9999;
  if (!cryptoProvider?.getRandomValues)
    throw new Error("Secure randomness is unavailable in this browser.");
  const used = new Uint8Array(max + 1);
  let remaining = max;
  for (const number of drawn) {
    if (!Number.isInteger(number) || number < 1 || number > max || used[number])
      throw new Error("The world's saved number pool could not be verified.");
    used[number] = 1;
    remaining--;
  }
  if (!remaining) throw new Error("This world's number pool is exhausted.");
  const limit = Math.floor(0x100000000 / remaining) * remaining;
  const word = new Uint32Array(1);
  do {
    cryptoProvider.getRandomValues(word);
  } while (word[0] >= limit);
  let index = word[0] % remaining;
  for (let number = 1; number <= max; number++) {
    if (used[number]) continue;
    if (index-- === 0) return number;
  }
  throw new Error("No unseen number remains.");
}

// The three public badge phases allow repeats and use independent fair samples.
// Objectives, collections and speed never enter the random calculation.
export function randomWorldMiniNumber(
  zone,
  cryptoProvider = globalThis.crypto,
) {
  const max = zone !== "valley" && WORLD_MINI_RANGES[zone]?.max;
  if (!max) throw new Error("Unknown World badge hunt.");
  if (!cryptoProvider?.getRandomValues)
    throw new Error("Secure randomness is unavailable in this browser.");
  const limit = Math.floor(0x100000000 / max) * max;
  const word = new Uint32Array(1);
  do {
    cryptoProvider.getRandomValues(word);
  } while (word[0] >= limit);
  return (word[0] % max) + 1;
}
