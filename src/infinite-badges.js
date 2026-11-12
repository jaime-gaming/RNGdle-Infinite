import baseMetadata from "./data/badge-metadata.json" with { type: "json" };
import { POPULATION, formatPercent } from "./probability.js";

const pendulums = [];
for (let a = 1; a <= 9; a++)
  for (let b = 0; b <= 9; b++)
    if (a !== b) pendulums.push(Number(`${a}${b}${a}${b}${a}${b}`));
const lastSeconds = Array.from(
  { length: 14 },
  (_, i) => (i + 10) * 10000 + 5959,
);

const perfectNumbers = [6, 28, 496, 8128];
const narcissisticNumbers = [
  153, 370, 371, 407, 1634, 8208, 9474, 54748, 92727, 93084, 548834,
];
const triangularNumbers = [];
for (let n = 1, total = 1; total <= 1000000; n++, total += n)
  triangularNumbers.push(total);
const kaprekarNumbers = [
  9, 45, 55, 99, 297, 703, 999, 2223, 2728, 4950, 5050, 7272, 7777, 9999, 17344,
  22222, 77778, 82656, 95121, 99999, 142857, 148149, 181819, 187110, 208495,
  318682, 329967, 351352, 356643, 390313, 461539, 466830, 499500, 500500,
  533170, 538461, 609687, 643357, 648648, 670033, 681318, 791505, 812890,
  818181, 851851, 857143, 961038, 994708, 999999,
];
const automorphicNumbers = [
  5, 6, 25, 76, 376, 625, 9376, 90625, 109376, 890625,
];
const factorionNumbers = [145, 40585];

function primeSieve(limit) {
  const prime = new Uint8Array(limit + 1).fill(1);
  prime[0] = 0;
  prime[1] = 0;
  for (let p = 2; p * p <= limit; p++)
    if (prime[p]) for (let q = p * p; q <= limit; q += p) prime[q] = 0;
  return prime;
}
const prime = primeSieve(1000000);
const emirpNumbers = [];
for (let n = 11; n <= 1000000; n++) {
  if (!prime[n]) continue;
  const reversed = Number(String(n).split("").reverse().join(""));
  if (reversed !== n && prime[reversed]) emirpNumbers.push(n);
}

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
  {
    id: "INFINITE_PERFECT_NUMBER",
    name: "Perfect Number",
    description:
      "A positive number equal to the sum of its proper divisors, such as 28 = 1 + 2 + 4 + 7 + 14.",
    emoji: "➗",
    ep: 150000,
    rarity: "mythic",
    numbers: perfectNumbers,
  },
  {
    id: "INFINITE_NARCISSISTIC",
    name: "Narcissistic",
    description:
      "Each digit is raised to the number of digits, and the powers add back to the number. Single-digit cases are excluded.",
    emoji: "🤳",
    ep: 30000,
    rarity: "anomaly",
    numbers: narcissisticNumbers,
  },
  {
    id: "INFINITE_TRIANGULAR",
    name: "Triangular",
    description:
      "A sum of consecutive whole numbers starting at 1, such as 500500 = 1 + 2 + ... + 1000.",
    emoji: "🔻",
    ep: 1500,
    rarity: "uncommon",
    numbers: triangularNumbers,
  },
  {
    id: "INFINITE_KAPREKAR",
    name: "Kaprekar",
    description:
      "Square the number, split the square into a right-hand part with the same digit count and the remaining left-hand part, then add the parts to recover the number. The right-hand part is positive.",
    emoji: "✂️",
    ep: 6000,
    rarity: "rare",
    numbers: kaprekarNumbers,
  },
  {
    id: "INFINITE_AUTOMORPHIC",
    name: "Automorphic",
    description:
      "The square ends in the number itself, such as 76² = 5776. Trivial 0 and 1 are excluded.",
    emoji: "🔚",
    ep: 18000,
    rarity: "epic",
    numbers: automorphicNumbers,
  },
  {
    id: "INFINITE_FACTORION",
    name: "Factorion",
    description:
      "The sum of the factorials of its digits equals the number, such as 145 = 1! + 4! + 5!. Trivial 1 and 2 are excluded.",
    emoji: "🧾",
    ep: 120000,
    rarity: "mythic",
    numbers: factorionNumbers,
  },
  {
    id: "INFINITE_EMIRP",
    name: "Emirp",
    description:
      "A prime that becomes a different prime when its digits are reversed, such as 13 and 31. Palindromic primes are excluded.",
    emoji: "🔄",
    ep: 800,
    rarity: "uncommon",
    numbers: emirpNumbers,
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
