import baseMetadata from "./data/badge-metadata.json" with { type: "json" };
import { POPULATION, formatPercent } from "./probability.js";

// Infinite-only additions. Keep the pinned upstream bitsets and EP table intact.
// Six actual decimal digits are required: no implicit leading zeroes.
const pendulums = [];
for (let a = 1; a <= 9; a++)
  for (let b = 0; b <= 9; b++)
    if (a !== b) pendulums.push(Number(`${a}${b}${a}${b}${a}${b}`));
const lastSeconds = Array.from(
  { length: 14 },
  (_, i) => (i + 10) * 10000 + 5959,
);
const definitions = [
  {
    id: "INFINITE_PENDULUM",
    name: "Pendulum",
    description:
      "Six digits swing between two different digits: ABABAB. A cannot be zero.",
    emoji: "↕️",
    ep: 25000,
    rarity: "anomaly",
    numbers: pendulums,
  },
  {
    id: "INFINITE_LAST_SECOND",
    name: "Last Second",
    description:
      "A six-digit 24-hour time at its final second: HH5959, with hours from 10 through 23. No leading zeroes.",
    emoji: "⏳",
    ep: 75000,
    rarity: "mythic",
    numbers: lastSeconds,
  },
];
export const infiniteBadges = definitions.map(({ numbers, ...badge }) => ({
  ...badge,
  family: null,
  matchingNumbers: numbers.length,
  probabilityPercent: (100 * numbers.length) / POPULATION,
  probability: `${formatPercent((100 * numbers.length) / POPULATION)}%`,
}));
export const originalsByNumber = new Map();
definitions.forEach(({ numbers }, i) =>
  numbers.forEach((n) =>
    originalsByNumber.set(n, [
      ...(originalsByNumber.get(n) ?? []),
      infiniteBadges[i],
    ]),
  ),
);
export const allBadgeMetadata = [...baseMetadata, ...infiniteBadges];
