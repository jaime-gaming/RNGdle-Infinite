// CLEANUP Nov 4, 2026: delete this file with the World.
import {
  randomWorldNumber,
  randomWorldMiniNumber,
} from "./rngween-world-random.js";

self.onmessage = ({ data }) => {
  const { id, drawn, zone = "valley" } = data;
  try {
    self.postMessage({
      id,
      number:
        zone === "valley"
          ? randomWorldNumber(drawn)
          : randomWorldMiniNumber(zone),
    });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
