// All ranks use the entire 0..1,000,000 population, never a session/sample pool.
export const POPULATION = 1000001;
// The exact median of the full 1,000,001-number distribution, reproduced by
// `npm run audit:economy`. Used only to phrase savings estimates in ordinary
// rolls rather than the jackpot-inflated mean; it never affects a score.
export const MEDIAN_ROLL_EP = 5801;
export function formatPercent(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new RangeError("Invalid percentage");
  let rounded = Number(value.toPrecision(3));
  // Rounding must not turn a possible event into 0% or a near-certain one into 100%.
  if (rounded === 100 && value < 100) rounded = value;
  const label = rounded.toLocaleString("en-US", { maximumFractionDigits: 6 });
  if (label === "100" && value < 100) return ">99.999999";
  if (label === "0" && value > 0) return "<0.000001";
  return label;
}
export function lowerBound(sorted, score) {
  let lo = 0,
    hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function upperBound(sorted, score) {
  let lo = 0,
    hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= score) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function rankScore(sorted, score) {
  const below = lowerBound(sorted, score),
    atOrBelow = upperBound(sorted, score),
    population = sorted.length;
  const atOrAbove = population - below;
  return {
    population,
    below,
    equal: atOrBelow - below,
    atOrBelow,
    atOrAbove,
    percentile: (100 * atOrBelow) / population,
    topPercent: (100 * atOrAbove) / population,
    bottomPercent: (100 * atOrBelow) / population,
  };
}
export function formatPercentile(result) {
  const rank = result.rank;
  if (!rank) throw new Error("A full-population rank is required");
  return rank.percentile >= 50
    ? `Top ${Math.round(rank.topPercent) || "<1"}%`
    : `Bottom ${Math.round(rank.bottomPercent) || "<1"}%`;
}
export function rankExplanation(result) {
  const rank = result.rank;
  const top = rank.percentile >= 50,
    count = top ? rank.atOrAbove : rank.atOrBelow;
  const precise = `${top ? "Top" : "Bottom"} ${formatPercent(top ? rank.topPercent : rank.bottomPercent)}%`;
  return `${precise} — ${count.toLocaleString("en-US")} of ${rank.population.toLocaleString("en-US")} possible numbers score ${top ? "at least" : "at most"} ${result.totalEP.toLocaleString("en-US")} EP. Ties are included (${rank.equal.toLocaleString("en-US")} numbers share this score).`;
}

// One source for badge and tier chance labels. A displayed inverse probability
// is descriptive, not a promise that a win will happen within that many rolls.
export function chanceLabels(count, population = POPULATION) {
  if (
    !Number.isSafeInteger(population) ||
    population < 1 ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > population
  )
    throw new RangeError("Invalid outcome count");
  const inverse = population / count;
  const denominator = inverse.toLocaleString("en-US", {
    maximumFractionDigits: inverse < 10 ? 2 : 0,
  });
  return {
    percent: `${formatPercent((100 * count) / population)}%`,
    frequency:
      count === 0
        ? "No matching outcomes"
        : count === population
          ? "1 in 1"
          : denominator === "1"
            ? "Almost every roll, not guaranteed"
            : `${population % count === 0 ? "" : "About "}1 in ${denominator}`,
    outcomes: `${count.toLocaleString("en-US")} of ${population.toLocaleString("en-US")} possible numbers`,
  };
}
