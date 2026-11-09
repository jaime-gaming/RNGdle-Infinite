import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";

export const SAVE_VAULT_TAG = "rngvault1:";

export const MAX_SAVE_OUTPUT_BYTES = 10_000_000;
const MAX_PACKED_SAVE_CHARS = 2_000_000;

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
    const bytes = gunzipSync(fromBase64(packed.slice(SAVE_VAULT_TAG.length)), {
      out: new Uint8Array(MAX_SAVE_OUTPUT_BYTES + 1),
    });
    if (bytes.length > MAX_SAVE_OUTPUT_BYTES) return "";
    return strFromU8(bytes);
  } catch {
    return "";
  }
}
