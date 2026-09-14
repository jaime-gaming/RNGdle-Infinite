// All ranks use the entire 0..1,000,000 population, never a session/sample pool.
export const POPULATION = 1000001;
export function formatPercent(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new RangeError("Invalid percentage");
  return Number(value.toPrecision(3)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
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
