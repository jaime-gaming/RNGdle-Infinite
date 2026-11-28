// RETIREMENT: Black Friday 2026 is over. This module keeps only what players
// already earned: the limited skin, its aura family and the save record.
import { RNGWEEN_COSMETICS } from "./rngween.js";

export const BLACK_FRIDAY_ID = "black-friday-2026";

export const BLACK_FRIDAY_STAMPS = 25;

export const SALE_STAMP_EVERY = 100000;

export const SALE_STAMP_CAP = 99;

// RETIREMENT: keep the Blackout renderer and save record.
export const BLACK_FRIDAY_SKIN = {
  id: "blackout-2026",
  kind: "aura",
  name: "Blackout 2026",
  family: "black-friday",
  eventOnly: true,
  limited: true,
  stampReward: true,
  swatch: ["#050505", "#26262b"],
  icon: "blackout",
  description:
    "The limited Black Friday 2026 aura: black, with a red foil rim and a sale tag. Paid by 25 sale stamps, kept forever, never sold.",
};

export const BLACK_FRIDAY_FAMILY = {
  id: "black-friday",
  label: "Black Friday 2026",
  blurb: "One day of sale stamps and a single limited skin.",
  font: '"Space Mono", monospace',
  tracking: "0.16em",
  casing: "uppercase",
  weight: 700,
  eventOnly: true,
};

export function stampsForSpend(spent) {
  const value = Number.isFinite(spent) && spent > 0 ? spent : 0;
  return Math.min(SALE_STAMP_CAP, Math.floor(value / SALE_STAMP_EVERY));
}

export function emptyBlackFriday() {
  return { id: BLACK_FRIDAY_ID, spent: 0, stamps: 0, skinEarned: false };
}

const validAmount = (value) => Number.isSafeInteger(value) && value >= 0;

export function parseBlackFriday(value, receipts = {}) {
  const owned = Array.isArray(receipts.owned) ? receipts.owned : [];
  const stored = !!value && typeof value === "object" && !Array.isArray(value);

  const spent =
    stored && validAmount(value.spent) ? Math.floor(value.spent) : 0;
  const skinEarned =
    (stored && value.skinEarned === true) ||
    owned.includes(BLACK_FRIDAY_SKIN.id);
  return {
    id: BLACK_FRIDAY_ID,
    spent,
    stamps: stampsForSpend(spent),
    skinEarned,
  };
}

// RETIREMENT: cosmetics bought at the retired counter keep their value so two
// copies of the same save still compare the way they did on the sale day.
export const RNGWEEN_RESALE_PRICE = 10_000_000;

const RESALE_IDS = new Set(RNGWEEN_COSMETICS.map((item) => item.id));

export function isResaleCosmetic(item) {
  return !!item?.eventOnly && RESALE_IDS.has(item.id);
}
