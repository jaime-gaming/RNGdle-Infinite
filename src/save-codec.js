import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";

export const SAVE_VAULT_TAG = "rngvault1:";
// A legitimate 6,000-roll save is well below this ceiling. The extra room
// covers future schema growth while preventing a tiny gzip bomb from
// allocating unbounded memory when a local or cloud copy is opened.
export const MAX_SAVE_OUTPUT_BYTES = 10_000_000;
const MAX_PACKED_SAVE_CHARS = 2_000_000;

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
  if (!packed.startsWith(SAVE_VAULT_TAG))
    return packed.length <= MAX_SAVE_OUTPUT_BYTES ? packed : "";
  if (packed.length > MAX_PACKED_SAVE_CHARS) return "";
  try {
    // One sentinel byte lets us distinguish a complete save at the limit from
    // a decompressed stream that was truncated by the bounded output buffer.
    const bytes = gunzipSync(fromBase64(packed.slice(SAVE_VAULT_TAG.length)), {
      out: new Uint8Array(MAX_SAVE_OUTPUT_BYTES + 1),
    });
    if (bytes.length > MAX_SAVE_OUTPUT_BYTES) return "";
    return strFromU8(bytes);
  } catch {
    return "";
  }
}
