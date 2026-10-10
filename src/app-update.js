export const APP_UPDATE_STORAGE_KEY = "rng-infinite-app-update-v1";
export const APP_UPDATE_QUERY = "__rngdle_refresh";
export const APP_BUILD_META = "rngdle-build-id";
export const APP_UPDATE_POLL_MS = 2500;

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

function updateServiceWorkers() {
  try {
    const serviceWorker = globalThis.navigator?.serviceWorker;
    if (!serviceWorker?.getRegistrations) return;
    serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) =>
            registration.update().catch(() => {}),
          ),
        ),
      )
      .catch(() => {});
  } catch {
    // A service worker is optional; a normal network reload still proceeds.
  }
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
    updateServiceWorkers();
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

function queueReload() {
  if (reloadTimer !== null) globalThis.clearTimeout(reloadTimer);
  // Let the settings page show why it is refreshing before navigation starts.
  reloadTimer = globalThis.setTimeout(() => {
    reloadTimer = null;
    if (!readAppUpdateIntent()) return;
    if (!reloadWithFreshUrl()) {
      publish({
        active: true,
        completed: false,
        message:
          "The page could not reload automatically. The update check will retry; your progress is safe.",
      });
    }
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
      "This device has the latest version. Your saved progress and settings were kept.",
  });
}

async function checkForCurrentBuild() {
  if (checking) return;
  let intent = readAppUpdateIntent();
  if (!intent) {
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
      };
      saveAppUpdateIntent(intent);
      publish({
        active: true,
        completed: false,
        message:
          "Refreshing this page safely first. Your progress is saved separately and will not be deleted.",
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
    if (!currentBuild)
      throw new Error("This page has no build identifier to compare.");

    if (publishedBuild === currentBuild) {
      finishUpdateCheck();
      return;
    }

    const now = Date.now();
    const elapsed = now - Number(intent.lastReloadAt || 0);
    if (elapsed >= 0 && elapsed < APP_UPDATE_POLL_MS) {
      publish({
        active: true,
        completed: false,
        message:
          "A newer version is published. Retrying the reload shortly until this page matches it; your progress stays saved.",
      });
      return;
    }

    saveAppUpdateIntent({ ...intent, lastReloadAt: now });
    publish({
      active: true,
      completed: false,
      message:
        "A newer version is published. Reloading to install it; your progress stays saved.",
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
    forceRefreshPending: true,
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
  clearTimers();
  checking = false;
  publish({
    active: true,
    completed: false,
    message:
      "Preparing a safe refresh. Your progress and settings are stored separately and will not be cleared.",
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
