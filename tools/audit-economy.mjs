// Reproducible full-population audit; no random sample and no reward changes.
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import manifest from "../src/data/game-index.json" with { type: "json" };
import { originalsByNumber } from "../src/infinite-badges.js";
import { shopProducts } from "../src/shop-data.js";
const buffer = gunzipSync(
  fs.readFileSync(new URL("../public/data/ep-table.bin.gz", import.meta.url)),
);
const scores = Uint32Array.from(
  { length: manifest.population },
  (_, n) =>
    buffer.readUInt32LE(n * 4) +
    (originalsByNumber.get(n) ?? []).reduce((sum, b) => sum + b.ep, 0),
).sort();
const percentile = (p) => scores[Math.floor((scores.length - 1) * p)];
const median = percentile(0.5);
console.log(
  JSON.stringify(
    {
      population: scores.length,
      meanEP: scores.reduce((sum, n) => sum + n, 0) / scores.length,
      medianEP: median,
      percentilesEP: Object.fromEntries(
        [0.1, 0.5, 0.75, 0.9, 0.95, 0.99].map((p) => [p * 100, percentile(p)]),
      ),
      below10000EP: scores.filter((n) => n < 10000).length,
      tiers: manifest.tiers.map((t, i) => ({
        tier: t.id,
        count: scores.filter(
          (ep) =>
            ep >= t.minEP &&
            (i === manifest.tiers.length - 1 ||
              ep < manifest.tiers[i + 1].minEP),
        ).length,
      })),
      prices: shopProducts.map((p) => ({
        id: p.id,
        priceEP: p.price,
        medianRollEquivalents: Math.ceil(p.price / median),
      })),
      note: "Median-roll equivalents compare prices; they are not expected waiting times. Independent rolls can repeat. Jackpot-heavy averages are not guaranteed income.",
    },
    null,
    2,
  ),
);
