// The vault: one compressed copy of the last save this browser managed to
// write. The canonical save stays plain JSON (readable, hand-editable, what
// everything else reads and writes); this is the second copy that only exists
// so a damaged, half-written or quota-squeezed save can never be the end of an
// account. A 6,000-roll save is about 800 KB of JSON and about 46 KB here.
import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";
import { PROGRESS_KEY } from "./progress.js";

export const SAVE_VAULT_KEY = "rng-infinite-progress-vault-v1";
export const SAVE_VAULT_TAG = "rngvault1:";
// One write per minute is plenty: the vault is a safety net, not a log.
export const SAVE_VAULT_MIN_GAP_MS = 60 * 1000;

function toBase64(bytes) {
  let binary = "";
  // Chunked so a large save cannot blow the argument list of String.fromCharCode.
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

// Plain JSON in, one short string out. Compression is best-effort: a browser
// without it (or a save too small to gain) still leaves a readable copy.
export function packVaultSave(raw) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    return `${SAVE_VAULT_TAG}${toBase64(gzipSync(strToU8(raw), { level: 6 }))}`;
  } catch {
    return raw;
  }
}

export function unpackVaultSave(packed) {
  if (typeof packed !== "string" || !packed) return "";
  if (!packed.startsWith(SAVE_VAULT_TAG)) return packed;
  try {
    return strFromU8(
      gunzipSync(fromBase64(packed.slice(SAVE_VAULT_TAG.length))),
    );
  } catch {
    return "";
  }
}

// A save worth restoring: real JSON with an object inside.
export function isReadableSave(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function vaultStore(storage) {
  return storage ?? globalThis.localStorage ?? null;
}

export function readVault(storage) {
  try {
    const packed = vaultStore(storage)?.getItem(SAVE_VAULT_KEY);
    if (!packed) return null;
    const envelope = JSON.parse(packed);
    const raw = unpackVaultSave(envelope?.raw);
    if (!isReadableSave(raw)) return null;
    return {
      at: Number(envelope.at) || 0,
      bytes: raw.length,
      profileId:
        typeof JSON.parse(raw).profile?.id === "string"
          ? JSON.parse(raw).profile.id
          : "",
      raw,
    };
  } catch {
    return null;
  }
}

// Keep the newest good copy. `raw` is the exact save string that was just
// written, and `now` only decides how often the vault is refreshed.
export function writeVault(
  raw,
  { storage, now = Date.now(), minGapMs = SAVE_VAULT_MIN_GAP_MS } = {},
) {
  if (!isReadableSave(raw)) return false;
  const store = vaultStore(storage);
  if (!store) return false;
  try {
    if (minGapMs > 0) {
      const current = readVault(store);
      if (current && now - current.at < minGapMs) return false;
    }
    store.setItem(
      SAVE_VAULT_KEY,
      JSON.stringify({ at: now, raw: packVaultSave(raw) }),
    );
    return true;
  } catch {
    // A full vault must never break the save that was just written.
    return false;
  }
}

// Runs at start-up, before anything reads the save. Only an unreadable or
// missing save is replaced, so a working account is never overwritten and a
// deleted account (which clears the vault too) is never resurrected.
export function restoreVaultIfNeeded({
  storage,
  now = Date.now(),
  maxAgeMs = 0,
} = {}) {
  const store = vaultStore(storage);
  if (!store) return { restored: false };
  try {
    const stored = store.getItem(PROGRESS_KEY);
    if (isReadableSave(stored)) return { restored: false };
    const vault = readVault(store);
    if (!vault) return { restored: false };
    if (maxAgeMs > 0 && now - vault.at > maxAgeMs) return { restored: false };
    store.setItem(PROGRESS_KEY, vault.raw);
    return { restored: true, at: vault.at, bytes: vault.bytes };
  } catch {
    return { restored: false };
  }
}

export function clearVault(storage) {
  try {
    vaultStore(storage)?.removeItem(SAVE_VAULT_KEY);
  } catch {
    // Nothing to do: the ordinary save is untouched either way.
  }
}
