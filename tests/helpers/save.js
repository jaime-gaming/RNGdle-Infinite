import { PROGRESS_KEY } from "../../src/progress.js";
import { unpackVaultSave } from "../../src/save-codec.js";

// The primary save is always a bounded gzip envelope. Specs read storage
// directly, so decode it with the game's own codec. Plain JSON from older
// saves or seeded fixtures stays readable.
export async function readSavedRaw(page, key = PROGRESS_KEY) {
  const stored = await page.evaluate((storageKey) => {
    return localStorage.getItem(storageKey);
  }, key);
  return stored ? unpackVaultSave(stored) : null;
}

export async function readSavedProgress(page, key = PROGRESS_KEY) {
  const raw = await readSavedRaw(page, key);
  return raw ? JSON.parse(raw) : null;
}

// Decode, patch and write back. A plain JSON write is fine: the app reads both
// representations and re-packs it on its next write.
export async function mutateSavedProgress(page, patch, key = PROGRESS_KEY) {
  const progress = await readSavedProgress(page, key);
  for (const [name, value] of Object.entries(patch)) {
    if (name === "profile") Object.assign(progress.profile, value);
    else progress[name] = value;
  }
  await page.evaluate(
    ([storageKey, value]) => localStorage.setItem(storageKey, value),
    [key, JSON.stringify(progress)],
  );
}
