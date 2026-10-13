// A profile you can hand to someone: /profile/<name>?card=<data>.
//
// There is no server, so the link itself carries the card: a small, read-only
// snapshot of the figures the profile page shows (name, best roll, record,
// pins, what it wears). Opening the link shows that snapshot to anyone, on
// any browser, and never touches the game saved there. Nothing in the game
// reads a card back into a save, so a link can never overwrite progress.
import { BOOKMARK_LIMIT } from "./history-log.js";
import { TIERS } from "./history-tally.js";
import { accountStats, profileHighlights } from "./profile-stats.js";
import { pathForProfile } from "./router.js";

export const CARD_VERSION = 1;
const NAME_MAX = 20;
const NUMBER = /^\d{1,6}$/;

// The snapshot the link carries. Everything is derived on the spot from the
// save and its log, the same way the profile page does it.
export function shareCardData(progress = {}, now = new Date()) {
  const stats = accountStats(progress);
  const highlights = profileHighlights(progress);
  const best = highlights.bestRoll;
  return {
    v: CARD_VERSION,
    name: progress.profile?.username ?? "Guest",
    at: now.toISOString(),
    since: progress.profile?.createdAt ?? null,
    best: best
      ? { number: best.number, ep: best.ep, tier: best.tier, at: best.at }
      : null,
    rolls: stats.rolls,
    earned: stats.totalEarned,
    badges: stats.uniqueBadges,
    badgesTotal: stats.badgesTotal,
    rebirths: stats.rebirths,
    prestiges: stats.ultraRebirths,
    pins: highlights.pinned.slice(0, BOOKMARK_LIMIT).map((roll) => ({
      number: roll.number,
      ep: roll.ep,
      tier: roll.tier,
    })),
    favoriteTier: stats.favoriteTier,
    aura: highlights.aura?.name ?? null,
    companion: highlights.companion?.name ?? null,
  };
}

// URL-safe base64 of the JSON, UTF-8 first so any name survives the trip.
export function encodeShareCard(card) {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// The card named by a link, cleaned field by field, or null when the data
// is missing, damaged or not a card at all. A bad link is simply ignored.
export function decodeShareCard(token) {
  if (typeof token !== "string" || !token) return null;
  let raw;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  return cleanCard(raw);
}

function cleanCard(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== CARD_VERSION) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > NAME_MAX) return null;
  const at = isoDate(raw.at);
  if (!at) return null;
  const roll = (value, withDate) => {
    if (!value || typeof value !== "object") return null;
    if (!NUMBER.test(String(value.number ?? ""))) return null;
    if (!TIERS.includes(value.tier)) return null;
    const entry = {
      number: String(value.number),
      ep: count(value.ep),
      tier: value.tier,
    };
    if (withDate) entry.at = isoDate(value.at);
    return entry;
  };
  return {
    v: CARD_VERSION,
    name,
    at,
    since: isoDate(raw.since),
    best: roll(raw.best, true),
    rolls: count(raw.rolls),
    earned: count(raw.earned),
    badges: count(raw.badges),
    badgesTotal: count(raw.badgesTotal),
    rebirths: count(raw.rebirths),
    prestiges: count(raw.prestiges),
    pins: (Array.isArray(raw.pins) ? raw.pins : [])
      .slice(0, BOOKMARK_LIMIT)
      .map((pin) => roll(pin, false))
      .filter(Boolean),
    favoriteTier: TIERS.includes(raw.favoriteTier) ? raw.favoriteTier : null,
    aura: text(raw.aura),
    companion: text(raw.companion),
  };
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function text(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 40)
    : null;
}

// Saves keep dates as ISO strings or epoch milliseconds; the card uses ISO.
function isoDate(value) {
  const time =
    typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(time) && time > 0
    ? new Date(time).toISOString()
    : null;
}

// The full link: the profile address plus the card, on whatever origin and
// base the game is served from (local or GitHub Pages alike).
export function shareCardUrl(progress, origin, base) {
  const card = shareCardData(progress);
  const url = new URL(pathForProfile(card.name, base), origin);
  url.searchParams.set("card", encodeShareCard(card));
  return url.toString();
}

// The card a visited address carries, or null for an ordinary profile page.
export function shareCardFromLocation(location) {
  const token = new URLSearchParams(location?.search ?? "").get("card");
  return decodeShareCard(token);
}
