import { unpackVaultSave } from "./save-codec.js";
import { writeDeviceSave } from "./local-save.js";
import { PROGRESS_KEY } from "./progress.js";

export const APP_UPDATE_STORAGE_KEY = "rng-infinite-app-update-v1";
export const APP_UPDATE_SAVE_KEY = "rng-infinite-app-update-save-v1";
export const APP_UPDATE_QUERY = "__rngdle_refresh";
const APP_BUILD_META = "rngdle-build-id";
const APP_INTERNAL_META = "rngdle-internal-version";
const APP_UPDATE_POLL_MS = 2500;

export const APP_UPDATE_MAX_RELOADS = 6;

const APP_UPDATE_CACHE_TIMEOUT_MS = 1500;

const APP_UPDATE_SAVE_TTL_MS = 60 * 60 * 1000;

export const APP_INTERNAL_VERSION = "v0.6";

export function isNewerVersion(candidate, baseline) {
  const parse = (label) => {
    const normalized = String(label ?? "")
      .trim()
      .replace(/^RNGdle-Infinite/i, "");
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:fix(\d+))?$/.exec(normalized);
    if (!match) throw new Error(`Unrecognised internal version: ${label}`);
    return [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4] ?? 0),
    ];
  };
  const a = parse(candidate);
  const b = parse(baseline);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return false;
}

let pollTimer = null;
let reloadTimer = null;
let checking = false;
let updateState = { active: false, completed: false, message: "" };
const listeners = new Set();

function publish(next) {
  updateState = { ...next };
  for (const listener of listeners) {
    try {
      listener(updateState);
    } catch {}
  }
}

export function getAppUpdateState() {
  return updateState;
}

export function subscribeAppUpdate(listener) {
  listeners.add(listener);
  listener(updateState);
  return () => listeners.delete(listener);
}

export function getAppBuildId(documentRef = globalThis.document) {
  try {
    return (
      documentRef
        ?.querySelector?.(`meta[name="${APP_BUILD_META}"]`)
        ?.content?.trim() ?? ""
    );
  } catch {
    return "";
  }
}

export function getAppInternalVersion(documentRef = globalThis.document) {
  try {
    return (
      documentRef
        ?.querySelector?.(`meta[name="${APP_INTERNAL_META}"]`)
        ?.content?.trim() ?? APP_INTERNAL_VERSION
    );
  } catch {
    return APP_INTERNAL_VERSION;
  }
}

export function isLegacyMirrorBuild(base = import.meta.env?.BASE_URL ?? "/") {
  return Boolean(base && base !== "/");
}

export function makeVersionUrl({
  base = "/",
  origin = "http://localhost",
  now = Date.now(),
} = {}) {
  const root = `${String(base).replace(/\/+$/, "")}/version.json`;
  const url = new URL(root, origin);
  url.searchParams.set("_", String(now));
  return url.toString();
}

export async function fetchPublishedBuild({
  fetcher = globalThis.fetch,
  base = import.meta.env?.BASE_URL ?? "/",
  origin = globalThis.location?.origin ?? "http://localhost",
  now = Date.now(),
} = {}) {
  if (typeof fetcher !== "function")
    throw new Error("Fetch is not available in this browser.");
  const response = await fetcher(makeVersionUrl({ base, origin, now }), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response?.ok) throw new Error("The version check did not answer.");
  const payload = await response.json();
  if (typeof payload?.buildId !== "string" || !payload.buildId.trim())
    throw new Error("The version check returned no build identifier.");
  return {
    buildId: payload.buildId.trim(),
    version: typeof payload.version === "string" ? payload.version.trim() : "",
    internalVersion:
      typeof payload.internalVersion === "string"
        ? payload.internalVersion.trim()
        : typeof payload.internal_version === "string"
          ? payload.internal_version.trim()
          : "",
  };
}

function sessionStore() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function localStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readAppUpdateIntent(storage = sessionStore()) {
  try {
    const raw = storage?.getItem(APP_UPDATE_STORAGE_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw);
    return intent?.active === true ? intent : null;
  } catch {
    return null;
  }
}

function saveAppUpdateIntent(intent, storage = sessionStore()) {
  try {
    if (!storage) return false;
    storage.setItem(APP_UPDATE_STORAGE_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

function removeAppUpdateIntent(storage = sessionStore()) {
  try {
    storage?.removeItem(APP_UPDATE_STORAGE_KEY);
  } catch {}
}

export function snapshotSaveForUpdate({
  storage = localStore(),
  scratch = sessionStore(),
  now = Date.now(),
} = {}) {
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    if (!raw || !scratch) return false;
    scratch.setItem(APP_UPDATE_SAVE_KEY, JSON.stringify({ at: now, raw }));
    return true;
  } catch {
    return false;
  }
}

export function recoverSaveAfterUpdate({
  storage = localStore(),
  scratch = sessionStore(),
  now = Date.now(),
  ttlMs = APP_UPDATE_SAVE_TTL_MS,
} = {}) {
  let copy = null;
  try {
    const raw = scratch?.getItem(APP_UPDATE_SAVE_KEY);
    scratch?.removeItem(APP_UPDATE_SAVE_KEY);
    if (raw) copy = JSON.parse(raw);
  } catch {
    copy = null;
  }
  if (!copy || typeof copy.raw !== "string") return { recovered: false };
  if (!Number.isFinite(copy.at) || now - copy.at > ttlMs)
    return { recovered: false };
  const readable = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const parsed = JSON.parse(unpackVaultSave(value));
      return !!parsed && typeof parsed === "object";
    } catch {
      return false;
    }
  };
  try {
    if (readable(storage?.getItem(PROGRESS_KEY))) return { recovered: false };
    writeDeviceSave(storage, PROGRESS_KEY, copy.raw);
    return { recovered: true };
  } catch {
    return { recovered: false };
  }
}

export function decideUpdateStep({
  currentBuild = "",
  publishedBuild = "",
  intent = null,
  now = Date.now(),
  pollMs = APP_UPDATE_POLL_MS,
  maxReloads = APP_UPDATE_MAX_RELOADS,
} = {}) {
  if (!currentBuild) return { kind: "unreadable", reloads: 0 };
  if (publishedBuild === currentBuild) return { kind: "done", reloads: 0 };
  const reloads = Math.max(0, Math.trunc(Number(intent?.reloads ?? 0)) || 0);
  if (reloads >= maxReloads) return { kind: "stuck", reloads };
  const elapsed = now - Number(intent?.lastReloadAt ?? 0);

  if (elapsed >= 0 && elapsed < pollMs) return { kind: "wait", reloads };
  return { kind: "reload", reloads: reloads + 1 };
}

export async function clearGameCaches({
  cacheStorage = globalThis.caches,
  serviceWorker = globalThis.navigator?.serviceWorker,
  timeoutMs = APP_UPDATE_CACHE_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
} = {}) {
  const work = [];
  if (cacheStorage?.keys && cacheStorage?.delete) {
    work.push(
      Promise.resolve()
        .then(() => cacheStorage.keys())
        .then((keys) =>
          Promise.all(
            keys.map((key) => cacheStorage.delete(key).catch(() => false)),
          ),
        )
        .catch(() => []),
    );
  }
  if (serviceWorker?.getRegistrations) {
    work.push(
      Promise.resolve()
        .then(() => serviceWorker.getRegistrations())
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => {
              try {
                const waiting = registration.waiting ?? registration.installing;
                waiting?.postMessage?.({ type: "skip-waiting" });
              } catch {}
              return Promise.resolve(registration.update?.()).catch(
                () => false,
              );
            }),
          ),
        )
        .catch(() => []),
    );
  }
  if (!work.length) return { timedOut: false };
  const timeout = new Promise((resolve) =>
    setTimer(() => resolve("timeout"), timeoutMs),
  );
  const outcome = await Promise.race([Promise.all(work), timeout]);
  return { timedOut: outcome === "timeout" };
}

function clearRefreshQuery() {
  try {
    const locationRef = globalThis.location;
    const historyRef = globalThis.history;
    if (!locationRef?.href || typeof historyRef?.replaceState !== "function")
      return;
    const url = new URL(locationRef.href);
    if (!url.searchParams.has(APP_UPDATE_QUERY)) return;
    url.searchParams.delete(APP_UPDATE_QUERY);
    historyRef.replaceState(
      historyRef.state,
      "",
      url.pathname + url.search + url.hash,
    );
  } catch {}
}

function reloadWithFreshUrl() {
  try {
    const locationRef = globalThis.location;
    if (!locationRef?.href || typeof locationRef.replace !== "function")
      return false;
    const url = new URL(locationRef.href);

    url.searchParams.set(
      APP_UPDATE_QUERY,
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    );
    locationRef.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

function clearTimers() {
  if (pollTimer !== null) {
    globalThis.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (reloadTimer !== null) {
    globalThis.clearTimeout(reloadTimer);
    reloadTimer = null;
  }
}

async function performReload() {
  if (!readAppUpdateIntent()) return;
  snapshotSaveForUpdate();
  await clearGameCaches();
  if (!readAppUpdateIntent()) return;
  if (!reloadWithFreshUrl()) {
    publish({
      active: true,
      completed: false,
      message:
        "The page could not reload automatically. The update check will retry; your progress is safe.",
    });
  }
}

function queueReload() {
  if (reloadTimer !== null) globalThis.clearTimeout(reloadTimer);

  reloadTimer = globalThis.setTimeout(() => {
    reloadTimer = null;
    void performReload();
  }, 180);
}

function finishUpdateCheck() {
  clearTimers();
  removeAppUpdateIntent();
  clearRefreshQuery();
  publish({
    active: false,
    completed: true,
    message:
      "This device has the latest version. The game was refreshed; your progress, profile and settings are safe.",
  });
}

function giveUpUpdateCheck() {
  clearTimers();
  removeAppUpdateIntent();
  clearRefreshQuery();
  publish({
    active: false,
    completed: false,
    message:
      "This device keeps opening an older version of the game. Your progress is safe. Close and reopen the game, then try once more.",
  });
}

async function checkForCurrentBuild() {
  if (checking) return;
  let intent = readAppUpdateIntent();
  if (!intent) {
    clearTimers();
    return;
  }

  if (
    intent.internalVersion &&
    intent.internalVersion !== APP_INTERNAL_VERSION
  ) {
    try {
      if (isNewerVersion(APP_INTERNAL_VERSION, intent.internalVersion)) {
        removeAppUpdateIntent();
        clearTimers();
        clearRefreshQuery();
        publish({
          active: false,
          completed: true,
          message:
            "This device already has a newer version than requested. Your progress is safe.",
        });
        return;
      }
    } catch {
      removeAppUpdateIntent();
      clearTimers();
      return;
    }
  }
  checking = true;
  try {
    if (intent.forceRefreshPending) {
      intent = {
        ...intent,
        forceRefreshPending: false,
        lastReloadAt: Date.now(),
        reloads: 0,
      };
      saveAppUpdateIntent(intent);
      publish({
        active: true,
        completed: false,
        message:
          "Refreshing the game, then reloading. Your progress, profile and settings stay saved.",
      });
      queueReload();
      return;
    }

    const [currentBuild, publishedData] = await Promise.all([
      Promise.resolve(getAppBuildId()),
      fetchPublishedBuild().catch(() => null),
    ]);
    if (!publishedData) throw new Error("Version check failed");
    const publishedBuild = publishedData.buildId;

    intent = readAppUpdateIntent();
    if (!intent) return;

    const step = decideUpdateStep({
      currentBuild,
      publishedBuild,
      intent,
      now: Date.now(),
    });

    if (step.kind === "done") {
      finishUpdateCheck();
      return;
    }
    if (step.kind === "unreadable")
      throw new Error("This page has no build identifier to compare.");
    if (step.kind === "stuck") {
      giveUpUpdateCheck();
      return;
    }
    if (step.kind === "wait") {
      publish({
        active: true,
        completed: false,
        message:
          "A newer version is published. Retrying the reload shortly until this page matches it; your progress stays saved.",
      });
      return;
    }

    saveAppUpdateIntent({
      ...intent,
      lastReloadAt: Date.now(),
      reloads: step.reloads,
    });
    publish({
      active: true,
      completed: false,
      message:
        "A newer version is published. Clearing the old files and reloading to install it; your progress stays saved.",
    });
    queueReload();
  } catch {
    if (!readAppUpdateIntent()) return;
    publish({
      active: true,
      completed: false,
      message:
        "The update server has not answered yet. I’ll keep checking and retrying; your progress stays saved.",
    });
  } finally {
    checking = false;
  }
}

export function resumeAppUpdate() {
  if (!readAppUpdateIntent()) {
    clearRefreshQuery();
    return false;
  }

  clearRefreshQuery();
  publish({
    active: true,
    completed: false,
    message: "Checking whether the latest version reached this device…",
  });
  if (pollTimer === null)
    pollTimer = globalThis.setInterval(
      () => void checkForCurrentBuild(),
      APP_UPDATE_POLL_MS,
    );
  void checkForCurrentBuild();
  return true;
}

export function startAppUpdate() {
  const intent = {
    active: true,
    lastReloadAt: 0,
    reloads: 0,
    forceRefreshPending: true,
    internalVersion: APP_INTERNAL_VERSION,
  };
  if (!saveAppUpdateIntent(intent)) {
    publish({
      active: false,
      completed: false,
      message:
        "The game could not check for an update after reloading. Your progress is safe; please try again.",
    });
    return false;
  }

  snapshotSaveForUpdate();
  clearTimers();
  checking = false;
  publish({
    active: true,
    completed: false,
    message:
      "Refreshing the game, then reloading. Your progress, profile and settings stay saved.",
  });
  return resumeAppUpdate();
}

export function stopAppUpdate() {
  clearTimers();
  checking = false;
  removeAppUpdateIntent();
  clearRefreshQuery();
  publish({
    active: false,
    completed: false,
    message:
      "The update check was stopped. Your progress and settings are unchanged.",
  });
}
