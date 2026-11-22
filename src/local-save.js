import { packVaultSave, unpackVaultSave } from "./save-codec.js";

// Verification is a second full decompress of the save just written, about as
// expensive as packing it, so callers may skip it for a freshly built string.
export function packDeviceSave(raw, { verify = true } = {}) {
  const decoded = unpackVaultSave(raw);
  if (!decoded) throw new Error("The save could not be encoded safely.");
  const packed = packVaultSave(decoded);
  if (verify && packed !== decoded && unpackVaultSave(packed) !== decoded)
    throw new Error("The save could not be encoded safely.");
  return { decoded, packed };
}

export function writePackedDeviceSave(storage, key, { packed }) {
  storage.setItem(key, packed);
  if (storage.getItem(key) !== packed)
    throw new Error("The saved copy could not be verified.");
}

export function writeDeviceSave(storage, key, raw) {
  writePackedDeviceSave(storage, key, packDeviceSave(raw));
}
