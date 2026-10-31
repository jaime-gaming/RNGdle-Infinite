import { PROGRESS_KEY } from "./progress.js";

export const APP_UPDATE_STORAGE_KEY = "rng-infinite-app-update-v1";
export const APP_UPDATE_SAVE_KEY = "rng-infinite-app-update-save-v1";
export const APP_UPDATE_QUERY = "__rngdle_refresh";
export const APP_BUILD_META = "rngdle-build-id";
export const APP_INTERNAL_META = "rngdle-internal-version";
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
// Current: RNGdle-Infinitev0.5.1fix5 (previous was fix4 on main).
export const APP_INTERNAL_VERSION = "RNGdle-Infinitev0.5.1fix5";

// --- Version parsing for "Reload until updated" next-version detection ---
// Handles: 0.5.1, 0.5.1fix3, RNGdle-Infinitev0.5.1fix3, v0.5.1, 0.6, 1.0.0 etc.
// The reload flow must detect ANY number bump: fix+1, 0.x.+1 (patch), 0.+1 (minor/major).
function parseInternalVersion(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let s = raw.trim();
  // Strip prefix up to last 'v' (e.g. RNGdle-Infinitev0.5.1fix3 -> 0.5.1fix3)
  const vIndex = s.lastIndexOf("v");
  if (vIndex >= 0) s = s.slice(vIndex + 1);
  // Separate fix suffix: e.g. 0.5.1fix3 -> base 0.5.1, fix 3
  let fix = 0;
  const fixMatch = s.match(/^(.*)fix(\d+)$/i);
  if (fixMatch) {
    s = fixMatch[1];
    fix = Math.max(0, parseInt(fixMatch[2], 10) || 0);
  }
  // Remove trailing non-numeric junk (like -beta) for base comparison
  s = s.split("-")[0].split("+")[0];
  const parts = s
    .split(".")
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n));
  if (!parts.length) return null;
  return { parts, fix, raw: raw.trim() };
}

function compareParsed(a, b) {
  const maxLen = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a.parts[i] ?? 0;
    const bv = b.parts[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  if (a.fix < b.fix) return -1;
  if (a.fix > b.fix) return 1;
  return 0;
}

export function compareVersions(aRaw, bRaw) {
  const a = parseInternalVersion(aRaw);
  const b = parseInternalVersion(bRaw);
  if (!a || !b) {
    // Fallback to string equality if unparseable
    if (aRaw === bRaw) return 0;
    return aRaw < bRaw ? -1 : 1;
  }
  return compareParsed(a, b);
}

export function isNewerVersion(currentRaw, nextRaw) {
  const cmp = compareVersions(currentRaw, nextRaw);
  return cmp < 0;
}

export function isSameOrNewerVersion(currentRaw, nextRaw) {
  const cmp = compareVersions(currentRaw, nextRaw);
  return cmp <= 0;
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
  currentVersion = "",
  publishedVersion = "",
  currentInternalVersion = "",
  publishedInternalVersion = "",
  intent = null,
  now = Date.now(),
  pollMs = APP_UPDATE_POLL_MS,
  maxReloads = APP_UPDATE_MAX_RELOADS,
} = {}) {
  // Support both old callers (buildId strings) and new object callers
  // Normalize publishedBuild/currentBuild if they are objects
  if (typeof currentBuild === "object" && currentBuild !== null) {
    const obj = currentBuild;
    currentBuild = obj.buildId ?? currentBuild;
    currentVersion = obj.version ?? currentVersion;
    currentInternalVersion = obj.internalVersion ?? currentInternalVersion;
  }
  if (typeof publishedBuild === "object" && publishedBuild !== null) {
    const obj = publishedBuild;
    publishedBuild = obj.buildId ?? publishedBuild;
    publishedVersion = obj.version ?? publishedVersion;
    publishedInternalVersion = obj.internalVersion ?? publishedInternalVersion;
  }

  if (!currentBuild) return { kind: "unreadable", reloads: 0 };

  // Determine if published is actually newer via version comparison
  // This handles fix+1, 0.x.+1, 0.+1 as requested
  let versionIsNewer = false;
  try {
    if (publishedInternalVersion && currentInternalVersion) {
      versionIsNewer = isNewerVersion(
        currentInternalVersion,
        publishedInternalVersion,
      );
    } else if (publishedVersion && currentVersion) {
      versionIsNewer = isNewerVersion(currentVersion, publishedVersion);
    }
  } catch {
    versionIsNewer = false;
  }

  const buildIsDifferent =
    !!publishedBuild && !!currentBuild && publishedBuild !== currentBuild;

  // If neither build nor version indicates newer, we're done
  // But if versionIsNewer is true, we must reload even if buildId matches (edge case)
  // If buildIsDifferent is true, also reload (new build)
  const needsUpdate = buildIsDifferent || versionIsNewer;

  if (!needsUpdate) return { kind: "done", reloads: 0 };

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
  // Handle intents from older internal builds: if current internal version is newer than intent's,
  // this page is already updated - clear intent and finish. If current is older or equal, keep polling
  // for the next version (fix+1 etc.) instead of immediately aborting.
  if (
    intent.internalVersion &&
    intent.internalVersion !== APP_INTERNAL_VERSION
  ) {
    try {
      if (isNewerVersion(intent.internalVersion, APP_INTERNAL_VERSION)) {
        // Current page is newer than intent - we already have next version
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
      // If current is not newer (intent is same or newer), keep intent and continue polling
      // Don't return - fall through to version check
    } catch {
      // If version parsing fails, fallback to old behavior: clear if mismatch
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
          "Clearing this browser's copy of the game, then reloading. Your progress, profile and settings are stored separately and stay exactly as they are.",
      });
      queueReload();
      return;
    }

    const [currentBuild, publishedData] = await Promise.all([
      Promise.resolve(getAppBuildId()),
      fetchPublishedBuild().catch(() => null),
    ]);
    if (!publishedData) throw new Error("Version check failed");
    const currentInternal = getAppInternalVersion();
    const publishedBuild = publishedData.buildId;
    const publishedInternal = publishedData.internalVersion || "";
    const publishedVersion = publishedData.version || "";

    intent = readAppUpdateIntent();
    if (!intent) return;

    // Also handle case where published internal version is newer than current
    // This covers fix+1, 0.x.+1, 0.+1 as requested
    const step = decideUpdateStep({
      currentBuild,
      publishedBuild,
      currentVersion: "",
      publishedVersion,
      currentInternalVersion: currentInternal,
      publishedInternalVersion: publishedInternal,
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
