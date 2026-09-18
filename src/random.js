import { POPULATION } from "./probability.js";

// Rejection sampling removes the bias from taking uint32 % 1,000,001 directly.
// Repeats are allowed: the previous roll never changes the next roll's odds.
export function randomNumber(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.getRandomValues)
    throw new Error("Secure randomness is unavailable in this browser.");
  const limit = Math.floor(0x100000000 / POPULATION) * POPULATION;
  const word = new Uint32Array(1);
  do {
    cryptoProvider.getRandomValues(word);
  } while (word[0] >= limit);
  return word[0] % POPULATION;
}
