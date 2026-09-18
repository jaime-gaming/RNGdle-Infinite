// Reproducible full-population audit; no random sample and no reward changes.
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import manifest from "../src/data/game-index.json" with { type: "json" };
import { originalsByNumber } from "../src/infinite-badges.js";
import { flywheelRequired } from "../src/flywheel.js";
import {
  shopProducts,
  rollSettings,
  offlineSettings,
} from "../src/shop-data.js";
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
      onlineCadence: [
        { stage: "Base", owned: [] },
        { stage: "First useful pair", owned: ["quickwind-1", "clockwork-1"] },
        {
          stage: "Previous pace ceiling",
          owned: [
            "quickwind-1",
            "quickwind-2",
            "quickwind-3",
            "clockwork-1",
            "clockwork-2",
            "clockwork-3",
            "flywheel",
          ],
        },
        {
          stage: "Late workshop",
          owned: [
            "quickwind-1",
            "quickwind-2",
            "quickwind-3",
            "clockwork-1",
            "clockwork-2",
            "clockwork-3",
            "clockwork-4",
            "flywheel",
            "flywheel-2",
          ],
        },
        {
          stage: "Final online pace",
          owned: shopProducts
            .filter((p) => ["roll", "cooldown", "pace"].includes(p.kind))
            .map((p) => p.id),
        },
      ].map(({ stage, owned }) => {
        const { rollMS, cooldownMS } = rollSettings(owned),
          charges = flywheelRequired(owned);
        const averageCycleSeconds =
          (rollMS +
            cooldownMS *
              (owned.includes("flywheel") ? charges / (charges + 1) : 1)) /
          1000;
        return {
          stage,
          priceEP: shopProducts
            .filter((p) => owned.includes(p.id))
            .reduce((s, p) => s + p.price, 0),
          averageCycleSeconds,
          idealRollsPerHour: 3600 / averageCycleSeconds,
        };
      }),
      offlineCadence: [
        [],
        ["offline-clock-1"],
        ["offline-clock-1", "offline-clock-2"],
      ].map((upgrades) => {
        const owned = ["offline-roller", ...upgrades],
          { intervalMS } = offlineSettings(owned);
        return {
          stage: upgrades.at(-1) ?? "offline-roller",
          priceEP: shopProducts
            .filter((p) => owned.includes(p.id))
            .reduce((s, p) => s + p.price, 0),
          intervalMinutes: intervalMS / 60000,
          rollsAfter8Hours: Math.min(
            144,
            Math.floor((8 * 3600000) / intervalMS),
          ),
          hoursTo144: (144 * intervalMS) / 3600000,
          rollsAfter24Hours: 144,
        };
      }),
      cadenceNote:
        "Online cadence averages complete Flywheel cycles without user or processing delays. Offline upgrades fill the same per-absence cap sooner; a single daily return still pays at most 144 rolls.",
      note: "Median-roll equivalents compare prices; they are not expected waiting times. Independent rolls can repeat. Jackpot-heavy averages are not guaranteed income.",
    },
    null,
    2,
  ),
);
