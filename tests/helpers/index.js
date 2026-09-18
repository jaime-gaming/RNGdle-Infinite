import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createGameIndex } from "../../src/game-index.js";
import snapshots from "../../src/data/roll-samples.json" with { type: "json" };
import { badgeMetadata } from "../../src/roll-data.js";
export const sampleResults = snapshots.map((r) => ({
  ...r,
  badges: r.badges.map((b) => ({ ...badgeMetadata.get(b.id), ...b })),
}));
export const sampleByNumber = new Map(sampleResults.map((r) => [r.number, r]));
export const inflate = (name) =>
  Uint8Array.from(
    gunzipSync(
      fs.readFileSync(
        new URL(`../../public/data/${name}-table.bin.gz`, import.meta.url),
      ),
    ),
  ).buffer;
let index;
export function evaluate(number) {
  index ??= createGameIndex(inflate("ep"), inflate("badge"));
  return index.evaluate(number);
}
