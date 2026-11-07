import {
  packVaultSave,
  unpackVaultSave,
  SAVE_VAULT_TAG,
} from "./save-codec.js";

// An atomic replacement only: never remove the current save, recovery copies,
// account markers or another application's data to make room for a write.
export function writeDeviceSave(storage, key, raw) {
  const decoded = unpackVaultSave(raw);
  if (!decoded) throw new Error("The save could not be encoded safely.");
  const previous = storage.getItem(key);
  // Once quota pressure selected compression, keep it on subsequent writes.
  // Small/new saves stay JSON for backwards compatibility and easy inspection.
  const packed = previous?.startsWith(SAVE_VAULT_TAG)
    ? packVaultSave(decoded)
    : decoded;
  try {
    storage.setItem(key, packed);
  } catch (error) {
    const quota =
      error?.name === "QuotaExceededError" ||
      error?.code === 22 ||
      error?.code === 1014;
    if (!quota || packed !== decoded) throw error;
    const compressed = packVaultSave(decoded);
    if (
      compressed.length >= decoded.length ||
      unpackVaultSave(compressed) !== decoded
    )
      throw error;
    storage.setItem(key, compressed);
  }
}
