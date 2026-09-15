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
