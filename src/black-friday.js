// RETIREMENT: see archive/qa/black-friday-retirement.md before removing event UI.
import { RNGWEEN_COSMETICS, RNGWEEN_WORLD_SKIN } from "./rngween.js";

export const BLACK_FRIDAY_ID = "black-friday-2026";

export const BLACK_FRIDAY_START = Date.UTC(2026, 10, 27, 0, 0, 0);
export const BLACK_FRIDAY_END = Date.UTC(2026, 10, 28, 0, 0, 0);

export const BLACK_FRIDAY_STAMPS = 25;

export const SALE_STAMP_EVERY = 100000;

export const SALE_STAMP_CAP = 99;

export const RNGWEEN_RESALE_PRICE = 10_000_000;

export const SALE_DISCOUNTS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

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

export const SALE_THEMES = [
  {
    id: "ultra-black",
    label: "Ultra-Black",
    blurb: "Pure black, white ink, no colour at all.",
  },
  {
    id: "red-sale",
    label: "Red Sale",
    blurb: "Black shelves under a red sale sign.",
  },
];

const PREVIEW_AT = Number(import.meta.env?.VITE_BLACK_FRIDAY_PREVIEW_AT ?? 0);
const PREVIEW_OFFSET =
  import.meta.env?.DEV && Number.isFinite(PREVIEW_AT) && PREVIEW_AT > 0
    ? PREVIEW_AT - Date.now()
    : 0;

export function saleNow(at = Date.now()) {
  const value = Number.isFinite(at) ? at : Date.now();
  return PREVIEW_OFFSET ? value + PREVIEW_OFFSET : value;
}

export function blackFridayActive(at = Date.now()) {
  const now = saleNow(at);
  return now >= BLACK_FRIDAY_START && now < BLACK_FRIDAY_END;
}

export function blackFridayStatus(at = Date.now()) {
  const now = saleNow(at);
  const active = now >= BLACK_FRIDAY_START && now < BLACK_FRIDAY_END;
  return {
    id: BLACK_FRIDAY_ID,
    active,
    upcoming: now < BLACK_FRIDAY_START,
    over: now >= BLACK_FRIDAY_END,

    shown: now < BLACK_FRIDAY_END,
    startsInMs: Math.max(0, BLACK_FRIDAY_START - now),
    endsInMs: active ? Math.max(0, BLACK_FRIDAY_END - now) : 0,
    start: BLACK_FRIDAY_START,
    end: BLACK_FRIDAY_END,
    now,
  };
}

export function blackFridayDayLabel() {
  return new Date(BLACK_FRIDAY_START).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function saleDiscountForId(id) {
  const key = String(id ?? "");
  if (!key) return 0;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++)
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  return SALE_DISCOUNTS[hash % SALE_DISCOUNTS.length];
}

export function saleDiscountFor(item) {
  return item?.eventOnly ? 0 : saleDiscountForId(item?.id);
}

export function salePriceOf(price, id, at = Date.now()) {
  const base = Number.isFinite(price) ? Math.max(0, Math.trunc(price)) : 0;
  if (!base || !blackFridayActive(at)) return base;
  const discount = saleDiscountForId(id);
  if (!discount) return base;
  return Math.max(1, Math.floor((base * (1 - discount)) / 100) * 100);
}

export function salePrice(item, at = Date.now()) {
  return salePriceOf(item?.price ?? 0, item?.id, at);
}

export function saleCompanionPrice(pet, at = Date.now()) {
  return salePriceOf(pet?.price ?? 0, pet?.id, at);
}

const RESALE_IDS = new Set(RNGWEEN_COSMETICS.map((item) => item.id));

export function isResaleCosmetic(item) {
  return !!item?.eventOnly && RESALE_IDS.has(item.id);
}

export function resalePrice(item, at = Date.now()) {
  return isResaleCosmetic(item) && blackFridayActive(at)
    ? RNGWEEN_RESALE_PRICE
    : null;
}

export function resaleOpen(at = Date.now()) {
  return blackFridayActive(at);
}

export function stampsForSpend(spent) {
  const value = Number.isFinite(spent) && spent > 0 ? spent : 0;
  return Math.min(SALE_STAMP_CAP, Math.floor(value / SALE_STAMP_EVERY));
}

export function epToNextStamp(record) {
  const spent = record?.spent ?? 0;
  if (stampsForSpend(spent) >= SALE_STAMP_CAP) return 0;
  return SALE_STAMP_EVERY - (spent % SALE_STAMP_EVERY);
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

export function stampForPurchase(record, ep, at = Date.now()) {
  const base = record ?? emptyBlackFriday();
  const price = Number.isFinite(ep) && ep > 0 ? Math.floor(ep) : 0;
  if (!blackFridayActive(at) || price <= 0)
    return { record: base, newStamps: 0, skinUnlocked: false };
  const spent = base.spent + price;
  const stamps = stampsForSpend(spent);
  const skinEarned = base.skinEarned || stamps >= BLACK_FRIDAY_STAMPS;
  return {
    record: { id: BLACK_FRIDAY_ID, spent, stamps, skinEarned },
    newStamps: Math.max(0, stamps - base.stamps),
    skinUnlocked: skinEarned && !base.skinEarned,
  };
}

export function stampsLeft(record) {
  return Math.max(0, BLACK_FRIDAY_STAMPS - (record?.stamps ?? 0));
}

export function stampFraction(record) {
  const spent = record?.spent ?? 0;
  return Math.min(1, spent / (BLACK_FRIDAY_STAMPS * SALE_STAMP_EVERY));
}

export function resaleMissing(owned = []) {
  return RNGWEEN_COSMETICS.filter((item) => !owned.includes(item.id));
}

export function rngweenReceiptFor(id) {
  return id === RNGWEEN_WORLD_SKIN.id ? "skinEarned" : "auras";
}
