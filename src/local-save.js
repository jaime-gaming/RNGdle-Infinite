import { packVaultSave, unpackVaultSave } from "./save-codec.js";

export function writeDeviceSave(storage, key, raw) {
  const decoded = unpackVaultSave(raw);
  if (!decoded) throw new Error("The save could not be encoded safely.");
  const packed = packVaultSave(decoded);

  if (packed !== decoded && unpackVaultSave(packed) !== decoded)
    throw new Error("The save could not be encoded safely.");

  storage.setItem(key, packed);
}
