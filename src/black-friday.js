// RETIREMENT: after the event, remove date-gated UI/branding and sale purchase
// paths only after the post-event tests pass. Keep the save parser, Blackout
// product/renderer, owned cosmetics, receipts and sale-reward history forever;
// see archive/qa/black-friday-retirement.md before removing anything.
// Black Friday 2026: one UTC day of shop-wide discounts, a stamp card that pays
// a single limited skin, and a one-day counter for the RNGween looks a player
// never got.
//
// The event is a shop and cosmetics event only. It never touches the draw, the
// scoring tables, badge values, ranks, reveal or cooldown timings, and it never
// pays EP. What it gives is permanent: the limited skin and any RNGween look
// bought back join the aura collection, so a rebirth, a prestige, a Rollback or
// a fresh start can never take them away.
import { RNGWEEN_COSMETICS, RNGWEEN_WORLD_SKIN } from "./rngween.js";

export const BLACK_FRIDAY_ID = "black-friday-2026";
// One day, on the UTC calendar the rest of the game's periods use.
export const BLACK_FRIDAY_START = Date.UTC(2026, 10, 27, 0, 0, 0);
export const BLACK_FRIDAY_END = Date.UTC(2026, 10, 28, 0, 0, 0);
// Sale stamps: one per 100,000 EP accumulated across purchases during the sale.
export const BLACK_FRIDAY_STAMPS = 25;
// One stamp per 100,000 EP spent while the sale is on: the card fills with
// what the day actually cost you, not with the number of taps.
export const SALE_STAMP_EVERY = 100000;
// Stamps keep counting past the reward only up to a bound the save can trust.
export const SALE_STAMP_CAP = 99;
// The RNGween looks that were never earned come back for the day, and only for
// the day, at a price that says so.
export const RNGWEEN_RESALE_PRICE = 10_000_000;
// Every discount the sale uses, decided per product rather than per shelf.
export const SALE_DISCOUNTS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

// The permanent reward: black with a red foil rim and restrained sparks.
// It is earned, never sold; its id and renderer must survive event retirement.
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

// The event's own aura family, so its skin sits beside the other events inside
// Special & Limiteds rather than floating loose.
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

// Two extra colour themes that only exist for the day. They are variants of the
// dark theme, so every dark-mode rule keeps applying underneath them.
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

// A preview build can move the event clock, so the day can be seen before the
// 27th of November. The value is inlined at build time, only in development,
// and a production build carries no offset at all: the live event always
// follows the real UTC day. `VITE_BLACK_FRIDAY_PREVIEW_AT` is an absolute
// millisecond timestamp the event clock starts at and then advances from.
const PREVIEW_AT = Number(import.meta.env?.VITE_BLACK_FRIDAY_PREVIEW_AT ?? 0);
const PREVIEW_OFFSET =
  import.meta.env?.DEV && Number.isFinite(PREVIEW_AT) && PREVIEW_AT > 0
    ? PREVIEW_AT - Date.now()
    : 0;

// The event's own clock: the real one, moved only by a development preview.
export function saleNow(at = Date.now()) {
  const value = Number.isFinite(at) ? at : Date.now();
  return PREVIEW_OFFSET ? value + PREVIEW_OFFSET : value;
}

export function blackFridayActive(at = Date.now()) {
  const now = saleNow(at);
  return now >= BLACK_FRIDAY_START && now < BLACK_FRIDAY_END;
}

// Everything the interface needs to say about the event in one read: whether it
// is on, whether it is still coming, and how far away either edge is.
export function blackFridayStatus(at = Date.now()) {
  const now = saleNow(at);
  const active = now >= BLACK_FRIDAY_START && now < BLACK_FRIDAY_END;
  return {
    id: BLACK_FRIDAY_ID,
    active,
    upcoming: now < BLACK_FRIDAY_START,
    over: now >= BLACK_FRIDAY_END,
    // The notice and the shop's Event button stop once the day is over.
    shown: now < BLACK_FRIDAY_END,
    startsInMs: Math.max(0, BLACK_FRIDAY_START - now),
    endsInMs: active ? Math.max(0, BLACK_FRIDAY_END - now) : 0,
    start: BLACK_FRIDAY_START,
    end: BLACK_FRIDAY_END,
    now,
  };
}

// One UTC day, written the way the rest of the game writes dates.
export function blackFridayDayLabel() {
  return new Date(BLACK_FRIDAY_START).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Which discount a product wears. It is decided by the product's own id, so
// every player, tab and reload sees the same sale and a price never moves
// mid-event. Nothing is random and nothing here can touch a roll.
export function saleDiscountForId(id) {
  const key = String(id ?? "");
  if (!key) return 0;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++)
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  return SALE_DISCOUNTS[hash % SALE_DISCOUNTS.length];
}

// Event cosmetics are prizes and counters, not stock: they are never discounted.
export function saleDiscountFor(item) {
  return item?.eventOnly ? 0 : saleDiscountForId(item?.id);
}

// The sale price of anything with an EP figure. Floored to a whole hundred so a
// rounded price is never a hair above the discount it advertises, and never
// zero: a sale reduces a price, it does not give the shelf away.
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

// A companion is not a catalogue product, but the sale covers the whole shop.
export function saleCompanionPrice(pet, at = Date.now()) {
  return salePriceOf(pet?.price ?? 0, pet?.id, at);
}

// The RNGween looks the sale puts back on the shelf for one day: every
// permanent cosmetic from that event except the world skin's own receipt rules,
// and never the Black Friday skin, which is earned rather than bought.
const RESALE_IDS = new Set(RNGWEEN_COSMETICS.map((item) => item.id));

export function isResaleCosmetic(item) {
  return !!item?.eventOnly && RESALE_IDS.has(item.id);
}

// What a resale look costs right now, or null when the counter is closed.
export function resalePrice(item, at = Date.now()) {
  return isResaleCosmetic(item) && blackFridayActive(at)
    ? RNGWEEN_RESALE_PRICE
    : null;
}

export function resaleOpen(at = Date.now()) {
  return blackFridayActive(at);
}

// ---- The stamp card on the save -------------------------------------------
//
// Stamps are event progress, not run progress: they belong to the account, so
// no reset of the run clears them, and the skin they pay is a permanent aura.

// How many stamps a spend total is worth, and how far the next one is.
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

// Defensive read of the stored record. Anything unreadable falls back to a
// clean card; a card that says the skin was earned always keeps the skin.
export function parseBlackFriday(value, receipts = {}) {
  const owned = Array.isArray(receipts.owned) ? receipts.owned : [];
  const stored = !!value && typeof value === "object" && !Array.isArray(value);
  // The spend total is the only source of truth: stamps are always what the
  // recorded EP bought, so a hand-edited card can never invent any.
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

// One purchase during the sale adds what its price bought: a stamp per whole
// 100,000 EP, and the limited skin the moment the card fills. `newStamps`
// counts only the stamps this purchase paid for, and `skinUnlocked` is true on
// the single purchase that completed the card, so the reward is announced
// once and can never be granted twice.
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

// The bar under the stamp card: the whole road to 25, spend-wise.
export function stampFraction(record) {
  const spent = record?.spent ?? 0;
  return Math.min(1, spent / (BLACK_FRIDAY_STAMPS * SALE_STAMP_EVERY));
}

// Which of the retired event's looks are still missing, and so on the counter.
export function resaleMissing(owned = []) {
  return RNGWEEN_COSMETICS.filter((item) => !owned.includes(item.id));
}

// The world skin is tracked by its own receipt rather than the aura list, so
// buying one back has to write the field that save expects.
export function rngweenReceiptFor(id) {
  return id === RNGWEEN_WORLD_SKIN.id ? "skinEarned" : "auras";
}
