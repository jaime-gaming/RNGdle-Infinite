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
// The restore request re-evaluates a committed draw after reload. No editor,
// preset or number-selection control exists in the game UI.
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (!["init", "roll", "restore"].includes(type))
      throw new Error("Unknown request");
    const index = await load();
    const result =
      type === "roll"
        ? index.evaluate(randomNumber())
        : type === "restore"
          ? index.evaluate(data.number)
          : null;
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error.message || "Unable to generate a roll. Please retry.",
    });
  }
};
