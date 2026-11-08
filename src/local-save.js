import { packVaultSave, unpackVaultSave } from "./save-codec.js";

// An atomic replacement only: never remove the current save, recovery copies,
// account markers or another application's data to make room for a write.
//
// The primary save is always the bounded gzip envelope. A 10,000-entry log is a
// few megabytes of JSON but a fraction of that once packed, so compressing on
// every write is what lets the larger history fit. Plain JSON remains readable
// for saves written by older versions; nothing needs a migration.
export function writeDeviceSave(storage, key, raw) {
  const decoded = unpackVaultSave(raw);
  if (!decoded) throw new Error("The save could not be encoded safely.");
  const packed = packVaultSave(decoded);
  // Never trust a container that cannot be read back byte for byte.
  if (packed !== decoded && unpackVaultSave(packed) !== decoded)
    throw new Error("The save could not be encoded safely.");
  // A browser without gzip leaves readable JSON. A failed write is left alone:
  // the envelope is already the smallest form, and setItem is atomic.
  storage.setItem(key, packed);
}
