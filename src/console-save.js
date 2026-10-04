// Console-only save import/export — no UI, no button, no indicator.
//
// Open the browser console (F12) and type:
//
//   __importSave(json)      — import a save from a JSON string or object
//   __exportSave()          — copy the current save to clipboard as JSON
//   __downloadSave()        — download the current save as a .json file
//
// These are intentionally undocumented in the UI: importing a save replaces
// the current one entirely, so it lives in the developer console where a
// mistaken click cannot wipe an account.

import { PROGRESS_KEY, parseProgress } from "./progress.js";

function log(...args) {
  // eslint-disable-next-line no-console
  console.log("%c[RNGdle]", "color: #89c4a8; font-weight: 700", ...args);
}

function warn(...args) {
  // eslint-disable-next-line no-console
  console.warn("%c[RNGdle]", "color: #f59e0b; font-weight: 700", ...args);
}

function error(...args) {
  // eslint-disable-next-line no-console
  console.error("%c[RNGdle]", "color: #ef4444; font-weight: 700", ...args);
}

function importSave(input) {
  let raw;
  if (typeof input === "string") {
    raw = input.trim();
  } else if (input && typeof input === "object") {
    raw = JSON.stringify(input);
  } else {
    error(
      "Pass a JSON string or an object. Example: __importSave('{\"version\":1,...}')",
    );
    return;
  }
  let parsed;
  try {
    parsed = parseProgress(raw);
  } catch (failure) {
    error("That JSON is not a valid RNGdle save.", failure.message);
    return;
  }
  if (!parsed.profile) {
    warn(
      "The imported save has no local profile. Guest progress is never saved — sign up after the reload to keep it.",
    );
  }
  try {
    localStorage.setItem(PROGRESS_KEY, raw);
  } catch (failure) {
    error("Could not write to localStorage.", failure.message);
    return;
  }
  log(
    `Save imported${parsed.profile ? ` for ${parsed.profile.username}` : ""}. Reloading…`,
  );
  // A hard reload is the only safe way to make every hook, worker and
  // linked-device listener pick up the new save at once.
  setTimeout(() => location.reload(), 400);
}

function exportSave() {
  let raw;
  try {
    raw = localStorage.getItem(PROGRESS_KEY);
  } catch (failure) {
    error("Could not read localStorage.", failure.message);
    return;
  }
  if (!raw) {
    warn("No save found in this browser.");
    return;
  }
  try {
    // Validate before handing it out, so the user never gets a broken blob.
    parseProgress(raw);
  } catch (failure) {
    warn("The current save is corrupted.", failure.message);
    return;
  }
  try {
    navigator.clipboard.writeText(raw);
    log("Save copied to clipboard. Paste it into a file to keep it.");
  } catch {
    log("Save (copy this):", raw);
  }
  return raw;
}

function downloadSave() {
  let raw;
  try {
    raw = localStorage.getItem(PROGRESS_KEY);
  } catch (failure) {
    error("Could not read localStorage.", failure.message);
    return;
  }
  if (!raw) {
    warn("No save found in this browser.");
    return;
  }
  let name = "rngdle-save";
  try {
    const parsed = parseProgress(raw);
    if (parsed.profile?.username) {
      name = `rngdle-${parsed.profile.username.toLowerCase()}`;
    }
  } catch {}
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  log(`Downloaded ${link.download}`);
}

export function installConsoleSaveTools() {
  if (typeof window === "undefined") return;
  // Expose on window so the console can call them. The double-underscore
  // prefix keeps them out of the way of any real API the page might add.
  window.__importSave = importSave;
  window.__exportSave = exportSave;
  window.__downloadSave = downloadSave;
}
