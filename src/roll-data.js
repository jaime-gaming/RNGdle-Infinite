import { allBadgeMetadata as metadata } from "./infinite-badges.js";
import { formatPercentile } from "./probability.js";
import { gameUrlForLocation } from "./site-links.js";
export { GAME_URL, gameUrlForLocation } from "./site-links.js";
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

const TIER_SQUARES = {
  trash: "\u{1F7EB}",
  common: "\u2B1C",
  uncommon: "\u{1F7E9}",
  rare: "\u{1F7E6}",
  epic: "\u{1F7EA}",
  anomaly: "\u{1F7E7}",
  mythic: "\u{1F7E5}",
  godly: "\u{1F7E8}",
};

function shareLines(number, tier, badges, ep, extra = "") {
  return [
    `RNGdle Infinite \u{1F3B2} ${number}`,
    "",
    `${TIER_SQUARES[tier] ?? ""} ${tier.toUpperCase()}${extra}`,
    "",
    ...badges
      .slice(0, 3)
      .map(
        (badge) =>
          `${TIER_SQUARES[badge.rarity] ?? ""} ${badge.emoji} ${badge.name}`,
      ),
    ...(badges.length > 3 ? [`+${badges.length - 3} more`] : []),
    "",
    `${formatEP(ep)} EP`,
    "",
    gameUrlForLocation(),
  ].join("\n");
}

export function buildShareText(result) {
  return shareLines(
    result.number,
    result.tier,
    result.badges,
    result.totalEP,
    ` \u2022 ${formatPercentile(result)}`,
  );
}

export function buildShareTextFromHistory(event) {
  const badges = (event.badges ?? [])
    .map((id) => badgeMetadata.get(id))
    .filter(Boolean);
  const bonus = event.petBonus ?? 0;
  return shareLines(
    event.number,
    event.tier,
    badges,
    event.ep,
    event.source === "offline"
      ? " \u2022 OFFLINE ROLL"
      : bonus > 0
        ? ` \u2022 +${formatEP(bonus)} EP companion bonus`
        : "",
  );
}
