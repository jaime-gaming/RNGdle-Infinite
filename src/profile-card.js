// A profile you can hand to someone: /profile/<name>?card=<data>.
//
// There is no server, so the link itself carries the card: a small, read-only
// snapshot of the figures the profile page shows (name, best roll, record,
// pins, what it wears). Opening the link shows that snapshot to anyone, on
// any browser, and never touches the game saved there. Nothing in the game
// reads a card back into a save, so a link can never overwrite progress.
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { BOOKMARK_LIMIT } from "./history-log.js";
import { TIERS } from "./history-tally.js";
import { accountStats, profileHighlights } from "./profile-stats.js";
import { pathForProfile } from "./router.js";
import { validAvatar } from "./progress.js";

export const CARD_VERSION = 3;
const KNOWN_VERSIONS = new Set([1, 2, CARD_VERSION]);
// The token carries the card line deflated and base64url'd, tagged "z1".
// Legacy tokens are base64url of raw text (which always begins A–f), so a
// leading "z" cannot ever be one of them and the versions never collide.
const TOKEN_TAG = "z1";
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
    // The face of the account rides along, so a shared profile shows the same
    // logo the owner wears. Absent or invalid, the card simply carries none.
    avatar: validAvatar(progress.profile?.avatar)
      ? progress.profile.avatar
      : null,
  };
}

// The card travels as one compact line, then URL-safe base64. Version 1 was
// the JSON itself (about 1,000 characters for a full card); version 2 keeps
// the same fields in a fixed order, numbers in base 36, tiers as an index and
// dates in seconds, which makes the link about a quarter of the length. Old
// version-1 links still open.
const FIELD = "|";
const ITEM = ",";
const PART = ":";
const b36 = (value) => (count(value) ? count(value).toString(36) : "");
const fromB36 = (text) => (/^[0-9a-z]+$/.test(text) ? parseInt(text, 36) : 0);
const seconds = (value) => {
  const iso = isoDate(value);
  return iso ? Math.floor(Date.parse(iso) / 1000).toString(36) : "";
};
const fromSeconds = (text) => (text ? fromB36(text) * 1000 : null);
const plain = (value) =>
  typeof value === "string" ? value.replace(/[|,:]/g, "").trim() : "";
// The logo is kept verbatim (its base64 payload is too structured to scrub);
// only the field separator is stripped, and decoding re-validates the whole
// data URL with the save's own rules.
const avatarText = (value) =>
  validAvatar(value) ? value.replace(/[|]/g, "") : "";
const tierIndex = (tier) => {
  const index = TIERS.indexOf(tier);
  return index < 0 ? "" : String(index);
};
const tierAt = (text) => (text === "" ? null : (TIERS[Number(text)] ?? null));
const packRoll = (roll, withDate) =>
  roll && typeof roll === "object"
    ? [
        plain(String(roll.number ?? "")),
        b36(roll.ep),
        tierIndex(roll.tier),
        ...(withDate ? [seconds(roll.at)] : []),
      ].join(PART)
    : "";
const unpackRoll = (text, withDate) => {
  if (!text) return null;
  const [number, ep, tier, at] = text.split(PART);
  return {
    number,
    ep: fromB36(ep ?? ""),
    tier: tierAt(tier ?? ""),
    ...(withDate ? { at: fromSeconds(at ?? "") } : {}),
  };
};

export function encodeShareCard(card) {
  const line = [
    String(card?.v ?? CARD_VERSION),
    plain(card?.name),
    seconds(card?.at),
    seconds(card?.since),
    packRoll(card?.best, true),
    b36(card?.rolls),
    b36(card?.earned),
    b36(card?.badges),
    b36(card?.badgesTotal),
    b36(card?.rebirths),
    b36(card?.prestiges),
    (Array.isArray(card?.pins) ? card.pins : [])
      .map((pin) => packRoll(pin, false))
      .join(ITEM),
    tierIndex(card?.favoriteTier),
    plain(card?.aura),
    plain(card?.companion),
    avatarText(card?.avatar),
  ].join(FIELD);
  // Deflating the line first keeps a link short enough to paste anywhere;
  // the base64url wrapper is what makes it query-string safe.
  return TOKEN_TAG + toBase64Url(deflateSync(strToU8(line), { level: 9 }));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(token) {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// The card named by a link, cleaned field by field, or null when the data
// is missing, damaged or not a card at all. A bad link is simply ignored.
export function decodeShareCard(token) {
  if (typeof token !== "string" || !token) return null;
  let text;
  try {
    if (token.startsWith(TOKEN_TAG))
      text = strFromU8(
        inflateSync(fromBase64Url(token.slice(TOKEN_TAG.length))),
      );
    else text = new TextDecoder().decode(fromBase64Url(token));
  } catch {
    return null;
  }
  let raw;
  if (text.startsWith("{")) {
    // A version-1 link: the JSON itself.
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
  } else {
    const f = text.split(FIELD);
    // 15 fields are a version-2 card (no logo); version 3 appends the logo.
    if (f.length !== 15 && f.length !== 16) return null;
    raw = {
      v: Number(f[0]),
      name: f[1],
      at: fromSeconds(f[2]),
      since: fromSeconds(f[3]),
      best: unpackRoll(f[4], true),
      rolls: fromB36(f[5]),
      earned: fromB36(f[6]),
      badges: fromB36(f[7]),
      badgesTotal: fromB36(f[8]),
      rebirths: fromB36(f[9]),
      prestiges: fromB36(f[10]),
      pins: f[11] ? f[11].split(ITEM).map((pin) => unpackRoll(pin, false)) : [],
      favoriteTier: tierAt(f[12]),
      aura: f[13],
      companion: f[14],
      avatar: f[15] ?? "",
    };
  }
  return cleanCard(raw);
}

function cleanCard(raw) {
  if (!raw || typeof raw !== "object" || !KNOWN_VERSIONS.has(raw.v))
    return null;
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
    avatar: validAvatar(raw.avatar) ? raw.avatar : null,
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
