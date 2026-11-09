import { POPULATION } from "./probability.js";

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

export function randomUnit(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.getRandomValues)
    throw new Error("Secure randomness is unavailable in this browser.");
  const word = new Uint32Array(1);
  cryptoProvider.getRandomValues(word);
  return word[0] / 0x100000000;
}
