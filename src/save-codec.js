import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";

export const SAVE_VAULT_TAG = "rngvault2:";
export const LEGACY_SAVE_VAULT_TAG = "rngvault1:";

export const MAX_SAVE_OUTPUT_BYTES = 10_000_000;
const MAX_PACKED_SAVE_CHARS = 2_000_000;
const COMPACT_KEY_PREFIX = "~";
const SAVE_KEYS = [
  "id",
  "type",
  "at",
  "number",
  "tier",
  "ep",
  "badges",
  "source",
  "productId",
  "name",
  "petBonus",
  "walletBonus",
  "boostId",
  "minutes",
  "until",
  "level",
  "track",
  "seasonId",
  "xp",
  "claimed",
  "premium",
  "active",
  "charges",
  "boughtAt",
  "reason",
  "owner",
  "createdAt",
];
const compactKeyByName = new Map(
  [...new Set(SAVE_KEYS)].map((key, index) => [
    key,
    `${COMPACT_KEY_PREFIX}${index.toString(36)}`,
  ]),
);
const saveNameByCompactKey = new Map(
  [...compactKeyByName].map(([name, compact]) => [compact, name]),
);
export const SAVE_COMPACT_KEY_NAMES = [...compactKeyByName.keys()];

function toBase64(bytes) {
  let binary = "";

  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(binary);
}

function fromBase64(text) {
  const binary = globalThis.atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function remapSaveKeys(value, direction) {
  if (Array.isArray(value))
    return value.map((entry) => remapSaveKeys(entry, direction));
  if (!value || typeof value !== "object") return value;
  const remapped = {};
  for (const [key, entry] of Object.entries(value)) {
    let nextKey;
    if (direction === "compact")
      nextKey =
        compactKeyByName.get(key) ??
        (key.startsWith(COMPACT_KEY_PREFIX)
          ? `${COMPACT_KEY_PREFIX}${key}`
          : key);
    else if (key.startsWith(`${COMPACT_KEY_PREFIX}${COMPACT_KEY_PREFIX}`))
      nextKey = key.slice(COMPACT_KEY_PREFIX.length);
    else nextKey = saveNameByCompactKey.get(key) ?? key;
    remapped[nextKey] = remapSaveKeys(entry, direction);
  }
  return remapped;
}

function compactSavePayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { mode: "R", raw };
    if (JSON.stringify(parsed) !== raw) return { mode: "R", raw };
    return { mode: "J", raw: JSON.stringify(remapSaveKeys(parsed, "compact")) };
  } catch {
    return { mode: "R", raw };
  }
}

function unpackCompressedSave(encoded, compact) {
  const bytes = gunzipSync(fromBase64(encoded), {
    out: new Uint8Array(MAX_SAVE_OUTPUT_BYTES + 1),
  });
  if (bytes.length > MAX_SAVE_OUTPUT_BYTES) return "";
  const payload = strFromU8(bytes);
  if (!compact) return payload;
  if (!payload) return "";
  if (payload[0] === "R") {
    const raw = payload.slice(1);
    return raw.length <= MAX_SAVE_OUTPUT_BYTES ? raw : "";
  }
  if (payload[0] !== "J") return "";
  try {
    const raw = JSON.stringify(
      remapSaveKeys(JSON.parse(payload.slice(1)), "expand"),
    );
    return raw.length <= MAX_SAVE_OUTPUT_BYTES ? raw : "";
  } catch {
    return "";
  }
}

export function packVaultSave(raw) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const payload = compactSavePayload(raw);
    return `${SAVE_VAULT_TAG}${toBase64(
      gzipSync(strToU8(`${payload.mode}${payload.raw}`), { level: 6 }),
    )}`;
  } catch {
    return raw;
  }
}

export function unpackVaultSave(packed) {
  if (typeof packed !== "string" || !packed) return "";
  if (packed.startsWith(SAVE_VAULT_TAG)) {
    if (packed.length > MAX_PACKED_SAVE_CHARS) return "";
    try {
      return unpackCompressedSave(packed.slice(SAVE_VAULT_TAG.length), true);
    } catch {
      return "";
    }
  }
  if (packed.startsWith(LEGACY_SAVE_VAULT_TAG)) {
    if (packed.length > MAX_PACKED_SAVE_CHARS) return "";
    try {
      return unpackCompressedSave(
        packed.slice(LEGACY_SAVE_VAULT_TAG.length),
        false,
      );
    } catch {
      return "";
    }
  }
  return packed.length <= MAX_SAVE_OUTPUT_BYTES ? packed : "";
}
