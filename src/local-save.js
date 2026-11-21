import { packVaultSave, unpackVaultSave } from "./save-codec.js";

export function packDeviceSave(raw) {
  const decoded = unpackVaultSave(raw);
  if (!decoded) throw new Error("The save could not be encoded safely.");
  const packed = packVaultSave(decoded);
  if (packed !== decoded && unpackVaultSave(packed) !== decoded)
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
