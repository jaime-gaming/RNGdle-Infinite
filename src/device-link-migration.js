const LEGACY_LINK_KEY = "rng-infinite-sync-v1";
const LEGACY_RELAY_KEY = "rng-infinite-sync-endpoint-v1";
const MIGRATION_NOTICE_KEY = "rng-infinite-device-link-migration-noted-v1";

function storageRef(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function hasActiveLegacyLink(raw) {
  try {
    const saved = JSON.parse(raw);
    return Boolean(
      saved &&
      typeof saved.room === "string" &&
      saved.room.length > 0 &&
      typeof saved.key === "string" &&
      saved.key.length > 0,
    );
  } catch {
    return false;
  }
}

// Retire the old shared-device token and relay override on first launch of the
// Cloud Account build. The token is no longer used; report only that an active
// link existed, never expose or log its room/key.
export function retireLegacyDeviceLink(storage) {
  const store = storageRef(storage);
  if (!store) return false;
  let active = false;
  let alreadyNotified = false;
  try {
    const raw = store.getItem(LEGACY_LINK_KEY);
    active = hasActiveLegacyLink(raw);
    alreadyNotified = store.getItem(MIGRATION_NOTICE_KEY) === "1";
    store.removeItem(LEGACY_LINK_KEY);
    store.removeItem(LEGACY_RELAY_KEY);
    if (active && !alreadyNotified) store.setItem(MIGRATION_NOTICE_KEY, "1");
  } catch {
    // Keep local play available if storage is read-only. The notice is still
    // shown for this load when an active token was successfully read.
  }
  return active && !alreadyNotified;
}

export const LEGACY_DEVICE_LINK_STORAGE_KEYS = Object.freeze([
  LEGACY_LINK_KEY,
  LEGACY_RELAY_KEY,
  MIGRATION_NOTICE_KEY,
]);
