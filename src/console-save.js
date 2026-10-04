// Console-only save import/export — no UI, no button, no indicator.
//
// Open the browser console (F12) and type:
//
//   __importData()           — opens the picker for a raw save or v0.3 Profile JSON export
//   __importData(json)       — imports a save from a JSON string or object
//   __exportSave()           — copies the current save to the clipboard as JSON
//   __downloadSave()         — downloads the current save as a .json file
//
// Every call reports back on the console: which file was read, exactly what
// was wrong when an import is rejected, or a one-line summary of what landed.
// Importing replaces the current save entirely, so the command stays in the
// developer console where a mistaken click cannot wipe an account.

import { PROGRESS_KEY, emptyProgress, parseProgress } from "./progress.js";

const TAG = "%c[RNGdle]";
const GREEN = "color:#89c4a8;font-weight:700";
const AMBER = "color:#f59e0b;font-weight:700";
const RED = "color:#ef4444;font-weight:700";

function log(...args) {
  console.log(TAG, GREEN, ...args);
}

function warn(...args) {
  console.warn(TAG, AMBER, ...args);
}

function error(...args) {
  console.error(TAG, RED, ...args);
}

const SAVE_EXTENSIONS = [".json"];
const PICKER_TYPES = [
  {
    description: "RNGdle save (JSON)",
    accept: { "application/json": SAVE_EXTENSIONS },
  },
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileLabel(file) {
  const name = file.name || "save.json";
  const size = formatBytes(file.size);
  return size ? `"${name}" (${size})` : `"${name}"`;
}

function describeSave(parsed) {
  const bits = [
    parsed.profile
      ? `profile "${parsed.profile.username}"`
      : "no profile (guest save)",
    `${parsed.discovered.length} badge${parsed.discovered.length === 1 ? "" : "s"} discovered`,
    `${parsed.totalEarned.toLocaleString()} EP earned`,
  ];
  return bits.join(", ");
}

// The v0.3 Profile page downloaded a JSON account snapshot, not the raw save
// stored by the game. Keep that existing export usable by rebuilding the full
// v1 shape around the fields it contains. The missing transient fields (such as
// an in-flight roll or offline batch) cannot be recovered from that snapshot.
function parseImportedSave(raw) {
  const source = JSON.parse(raw);
  const isV03Export =
    source?.app === "RNGdle Infinite" &&
    source.appVersion === "v0.3" &&
    source.saveVersion === 1 &&
    source.save &&
    typeof source.save === "object" &&
    !Array.isArray(source.save);

  if (!isV03Export) return { parsed: parseProgress(raw), storageValue: raw };

  const migrated = parseProgress(
    JSON.stringify({
      ...emptyProgress(),
      ...source.save,
      version: source.saveVersion,
      profile: source.profile ?? null,
      // The snapshot omitted receipts. Rebuild them from its validated history
      // below so an imported roll cannot be credited a second time.
      receipts: [],
    }),
  );
  migrated.receipts = migrated.history
    .filter((event) => event.type === "roll")
    .slice(-128)
    .map((event) => event.id);

  return {
    parsed: migrated,
    storageValue: JSON.stringify(migrated),
    legacySnapshot: true,
  };
}

async function readFile(file) {
  if (typeof file.text === "function") return await file.text();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsText(file);
  });
}

// Everything __importData() accepts: nothing (open the picker), a JSON string,
// a File/Blob, or a plain save object. Returns { raw, label, kind } — or null
// when the user cancelled, in which case the reason is already on the console.
async function resolveImport(input) {
  if (typeof input === "string") {
    return {
      raw: input.trim(),
      label: "the JSON text you passed",
      kind: "text",
    };
  }
  if (input && typeof input === "object" && typeof input.text === "function") {
    let raw;
    try {
      raw = await readFile(input);
    } catch (failure) {
      error("Could not read the file.", failure?.message ?? failure);
      return null;
    }
    return { raw: raw.trim(), label: fileLabel(input), kind: "file" };
  }
  if (input && typeof input === "object") {
    return {
      raw: JSON.stringify(input),
      label: "the save object you passed",
      kind: "object",
    };
  }
  if (input === undefined || input === null) return pickSaveFile();
  error(
    "__importData() takes no argument (it opens the file picker) or a JSON string/object.",
  );
  log("Example: __importData()   or   __importData('{\"version\":1,…}')");
  return null;
}

// The modern picker (Chrome, Edge, Opera) resolves only once the user has
// chosen or cancelled, and it tells us when the browser blocks it, so the
// console always gets an answer.
async function pickWithFileSystemAPI() {
  let handle;
  try {
    [handle] = await window.showOpenFilePicker({
      id: "rngdle-save-import",
      multiple: false,
      types: PICKER_TYPES,
    });
  } catch (failure) {
    if (failure?.name === "AbortError") {
      warn("No file selected — nothing was imported.");
    } else {
      error(
        "The browser did not open the file picker.",
        failure?.message ?? failure,
      );
      log(
        "You can still import by passing the JSON directly: __importData(jsonText)",
      );
    }
    return null;
  }
  const file = await handle.getFile().catch(() => null);
  if (!file) {
    error("The chosen file could not be read.");
    return null;
  }
  const raw = await readFile(file).catch((failure) => {
    error("Could not read the file.", failure?.message ?? failure);
    return null;
  });
  if (raw === null) return null;
  return { raw: raw.trim(), label: fileLabel(file), kind: "file" };
}

// Firefox and Safari have no showOpenFilePicker, so the picker is a hidden
// <input type="file">. There is no promise to await, which is exactly how a
// blocked dialog used to fail in silence — so every ending (chosen, cancelled,
// never opened) now ends with a line on the console.
function pickWithFileInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // Firefox and Safari allow any type regardless of this list; the extension
    // and the JSON check afterwards are what keep the wrong file out.
    input.accept = ["application/json", ...SAVE_EXTENSIONS].join(",");
    input.setAttribute("aria-hidden", "true");
    input.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(input);

    let settled = false;
    const timers = [];
    const finish = (result) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(result);
    };
    const cancelled = () => {
      warn("No file selected — nothing was imported.");
      finish(null);
    };
    // The dialog closes and the window gets focus back before the change event
    // lands, so wait one tick before calling it a cancel.
    const onFocus = () => {
      timers.push(
        setTimeout(() => {
          if (!input.files?.length) cancelled();
        }, 300),
      );
    };
    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) return cancelled();
        let raw;
        try {
          raw = await readFile(file);
        } catch (failure) {
          error("Could not read the file.", failure?.message ?? failure);
          finish(null);
          return;
        }
        finish({ raw: raw.trim(), label: fileLabel(file), kind: "file" });
      },
      { once: true },
    );
    window.addEventListener("focus", onFocus);
    // Opening a file dialog moves focus out of the page. If the page still has
    // it a moment after the click, the browser likely refused to open the
    // dialog — say so, but keep waiting in case the dialog appears late.
    timers.push(
      setTimeout(() => {
        if (settled || !document.hasFocus()) return;
        warn(
          "The file picker did not seem to open. The browser only allows it from a real user action in the page.",
        );
        log(
          "Try again, or import without a file: __importData('{…save JSON…}')",
        );
      }, 1200),
    );
    input.click();
  });
}

function pickSaveFile() {
  log("Opening the file picker — choose an RNGdle .json save to import…");
  if (typeof window.showOpenFilePicker === "function") {
    return pickWithFileSystemAPI();
  }
  return pickWithFileInput();
}

async function importData(input) {
  const picked = await resolveImport(input);
  if (!picked) return;
  const { raw, label, kind } = picked;

  if (!raw) {
    error(`Import failed: ${label} is empty — there is no save to import.`);
    return;
  }

  let parsed,
    storageValue,
    legacySnapshot = false;
  try {
    ({ parsed, storageValue, legacySnapshot = false } = parseImportedSave(raw));
  } catch (failure) {
    error(`Import failed: ${label} is not a valid RNGdle save.`);
    if (failure instanceof SyntaxError) {
      warn("The JSON could not be parsed:", failure.message);
      if (/^\s*</.test(raw)) {
        log(
          "Hint: that looks like an HTML page. Pick the .json written by __downloadSave().",
        );
      } else if (kind === "text") {
        log(
          "If you meant a file on disk, run __importData() with no arguments and use the dialog.",
        );
      }
    } else {
      warn("Reason:", failure?.message ?? failure);
      log(
        "Choose a raw save from __downloadSave() or the v0.3 Profile JSON export. Hand edits usually break the format.",
      );
    }
    return;
  }

  if (legacySnapshot) {
    warn(
      "This v0.3 JSON is an account snapshot, not a complete save. Pending rolls, cooldowns, offline rewards and other fields absent from the export cannot be recovered.",
    );
  }
  if (!parsed.profile) {
    warn(
      "The imported save has no local profile. Guest progress is never saved — sign up after the reload to keep it.",
    );
  }

  try {
    localStorage.setItem(PROGRESS_KEY, storageValue);
  } catch (failure) {
    error(
      "Could not write the save to localStorage.",
      failure?.message ?? failure,
    );
    return;
  }

  log(`Save imported: ${label} — ${describeSave(parsed)}.`);
  log("Reloading to apply it…");
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
  window.__importData = importData;
  // Older builds only exposed __importSave: keep it working (it opens the
  // picker too when called with no argument) but point at the new name.
  window.__importSave = (input) => {
    warn(
      "__importSave was renamed to __importData — use __importData() from now on.",
    );
    return importData(input);
  };
  window.__exportSave = exportSave;
  window.__downloadSave = downloadSave;
}
