import { PROGRESS_KEY } from "../../src/progress.js";
import { unpackVaultSave } from "../../src/save-codec.js";

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
