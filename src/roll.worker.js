import manifest from "./data/game-index.json" with { type: "json" };
import { createGameIndex } from "./game-index.js";
import { randomNumber } from "./random.js";

import { readIndex } from "./load-index.js";

let indexPromise;
function load() {
  if (!indexPromise)
    indexPromise = Promise.all([
      readIndex(manifest.files.ep, import.meta.env.BASE_URL),
      readIndex(manifest.files.badge, import.meta.env.BASE_URL),
    ])
      .then(([ep, badges]) => createGameIndex(ep, badges))
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  return indexPromise;
}

const BATCH_MAX = 360;
function validCount(count) {
  return Number.isSafeInteger(count) && count >= 1 && count <= BATCH_MAX;
}
function validNumbers(numbers) {
  return (
    Array.isArray(numbers) &&
    numbers.length >= 1 &&
    numbers.length <= BATCH_MAX &&
    numbers.every((n) => Number.isSafeInteger(n) && n >= 0 && n < 1000001)
  );
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (
      !["init", "roll", "restore", "roll-many", "restore-many"].includes(type)
    )
      throw new Error("Unknown request");
    const index = await load();
    let result;
    if (type === "roll") result = index.evaluate(randomNumber());
    else if (type === "restore") result = index.evaluate(data.number);
    else if (type === "roll-many") {
      if (!validCount(data.count)) throw new Error("Invalid batch size");
      const numbers = [];
      for (let i = 0; i < data.count; i++) numbers.push(randomNumber());
      result = numbers;
    } else if (type === "restore-many") {
      if (!validNumbers(data.numbers)) throw new Error("Invalid batch numbers");
      result = data.numbers.map((number) => index.evaluate(number));
    } else result = null;
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error.message || "Unable to generate a roll. Please retry.",
    });
  }
};
