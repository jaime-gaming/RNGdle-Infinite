import { allBadgeMetadata as metadata } from "./infinite-badges.js";
import { formatPercentile } from "./probability.js";
export { formatPercentile } from "./probability.js";
export const badgeMetadata = new Map(metadata.map((b) => [b.id, b]));

export function groupResultBadges(badges) {
  const groups = [];
  const families = new Map();
  for (const badge of badges) {
    if (!badge.family) {
      groups.push({ lead: badge, rest: [] });
      continue;
    }
    let group = families.get(badge.family);
    if (!group) {
      group = { lead: null, rest: [] };
      families.set(badge.family, group);
      groups.push(group);
    }
    if (badge.isScoring) group.lead = badge;
    else group.rest.push(badge);
  }
  return groups.filter((g) => g.lead).sort((a, b) => b.lead.ep - a.lead.ep);
}

export const formatEP = (value) => Math.round(value).toLocaleString("en-US");
// Optional shorthand for wallet-sized amounts. Purely presentational: exact
// values are always the ones spent, saved and recorded in history.
export function formatEPCompact(value) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 100000) return formatEP(rounded);
  const units = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units)
    if (Math.abs(rounded) >= size) {
      const scaled = rounded / size;
      const digits = Math.abs(scaled) >= 100 ? 0 : 1;
      return `${Number(scaled.toFixed(digits)).toLocaleString("en-US")}${suffix}`;
    }
  return formatEP(rounded);
}
export function buildShareText(result) {
  const squares = {
    trash: "🟫",
    common: "⬜",
    uncommon: "🟩",
    rare: "🟦",
    epic: "🟪",
    anomaly: "🟧",
    mythic: "🟥",
    godly: "🟨",
  };
  return [
    `RNGdle Infinite 🎲 ${result.number}`,
    "",
    `${squares[result.tier]} ${result.tier.toUpperCase()} • ${formatPercentile(result)}`,
    "",
    ...result.badges
      .slice(0, 3)
      .map((b) => `${squares[b.rarity]} ${b.emoji} ${b.name}`),
    ...(result.badges.length > 3 ? [`+${result.badges.length - 3} more`] : []),
    "",
    `${formatEP(result.totalEP)} EP`,
  ].join("\n");
}
