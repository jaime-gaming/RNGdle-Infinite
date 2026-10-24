import { PROGRESS_KEY } from "./progress.js";

export const APP_UPDATE_STORAGE_KEY = "rng-infinite-app-update-v1";
export const APP_UPDATE_SAVE_KEY = "rng-infinite-app-update-save-v1";
export const APP_UPDATE_QUERY = "__rngdle_refresh";
export const APP_BUILD_META = "rngdle-build-id";
export const APP_UPDATE_POLL_MS = 2500;
// A browser that keeps handing back the old files cannot be fixed by reloading
// again; give up after a handful of tries and say so instead of looping.
export const APP_UPDATE_MAX_RELOADS = 6;
// A cache or service-worker call that never answers must not stop the refresh.
export const APP_UPDATE_CACHE_TIMEOUT_MS = 1500;
// The save copy only belongs to the reload that made it.
export const APP_UPDATE_SAVE_TTL_MS = 60 * 60 * 1000;

// Internal label for bug-patch rebuilds of the same public version
// (RNGdle-Infinitev0.5.1fix0, fix1, fix2 …). Bump the fix number for a patch
// instead of moving the public 0.x(.x) version. Only the "Reload until
// updated" flow uses it, to scope the update intent to the current internal
// build. It is never added to the changelog or shown as a release.
// Current: RNGdle-Infinitev0.5.1fix4.
export const APP_INTERNAL_VERSION = "RNGdle-Infinitev0.5.1fix4";

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
    } catch {
      // A UI subscriber must not be able to stop the update check.
    }
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
  return (
    documentRef
      ?.querySelector?.(`meta[name="${APP_BUILD_META}"]`)
      ?.content?.trim() ?? ""
  );
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
  return payload.buildId;
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

export function readAppUpdateIntent(storage = sessionStore()) {
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
  } catch {
    // Storage can be disabled by the browser; the update loop still stops here.
  }
}

// The save is the one thing a refresh must never cost. Before every reload the
// exact bytes go to sessionStorage, in this tab only; a build that cannot read
// its own save gets that copy back instead of an empty account. localStorage
// itself is only ever read here — never cleared, never rewritten.
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
    // A full or disabled sessionStorage leaves the real save untouched.
    return false;
  }
}

// Runs before the app reads its save. A readable save always wins: the copy is
// only used when the stored save is missing or is not JSON at all, which is
// exactly the shape of a failed update landing on a broken build.
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
      const parsed = JSON.parse(value);
      return !!parsed && typeof parsed === "object";
    } catch {
      return false;
    }
  };
  try {
    if (readable(storage?.getItem(PROGRESS_KEY))) return { recovered: false };
    storage.setItem(PROGRESS_KEY, copy.raw);
    return { recovered: true };
  } catch {
    return { recovered: false };
  }
}

// What the update loop does next, as a plain decision so it can be tested
// without a browser: done, wait (the page has not caught up yet), reload, or
// stuck (this browser keeps serving old files).
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
  // The reload that just happened has not had time to be replaced yet.
  if (elapsed >= 0 && elapsed < pollMs) return { kind: "wait", reloads };
  return { kind: "reload", reloads: reloads + 1 };
}

// The part of "clear the browser cache" that a page is allowed to do: every
// Cache Storage entry for this origin, plus a service-worker refresh that
// installs whatever the server now serves. Site data — save, settings, device
// link — lives in localStorage and is not touched by any of it.
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
              } catch {
                // A worker that cannot take the message still gets updated.
              }
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
  } catch {
    // The URL cleanup is cosmetic; it must not interrupt update detection.
  }
}

function reloadWithFreshUrl() {
  try {
    const locationRef = globalThis.location;
    if (!locationRef?.href || typeof locationRef.replace !== "function")
      return false;
    const url = new URL(locationRef.href);
    // A unique address cannot be answered from the document cache, so the
    // HTML — and the hashed bundles it names — are fetched from the server.
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
  // Let the settings page show why it is refreshing before navigation starts.
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
      "This device has the latest version. Cached files were refreshed; your saved progress, profile and settings were kept.",
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
      "This browser keeps handing back an old copy of the game. Your progress is safe. Close the tab completely, open the game again, then try once more.",
  });
}

async function checkForCurrentBuild() {
  if (checking) return;
  let intent = readAppUpdateIntent();
  if (!intent) {
    clearTimers();
    return;
  }
  if (intent.internalVersion !== APP_INTERNAL_VERSION) {
    // Intent left by an older internal build: this page is already current.
    removeAppUpdateIntent();
    clearTimers();
    return;
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
          "Clearing this browser's copy of the game, then reloading. Your progress, profile and settings are stored separately and stay exactly as they are.",
      });
      queueReload();
      return;
    }

    const [currentBuild, publishedBuild] = await Promise.all([
      Promise.resolve(getAppBuildId()),
      fetchPublishedBuild(),
    ]);
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
        "The browser could not keep the update check across a reload. Your progress is safe; allow session storage and try again.",
    });
    return false;
  }
  // Copy the save before the first reload, not after something went wrong.
  snapshotSaveForUpdate();
  clearTimers();
  checking = false;
  publish({
    active: true,
    completed: false,
    message:
      "Clearing this browser's copy of the game, then reloading. Your progress, profile and settings are stored separately and stay exactly as they are.",
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
