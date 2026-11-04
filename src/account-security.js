import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";

// Two-factor sign-in keeps its own document so the strictly whitelisted
// cloud_profile_settings document (and every code path that writes it) stays
// untouched.
const ACCOUNT_SECURITY_COLLECTION = "account_security";
const DEVICE_ID_KEY = "rng-infinite-device-id-v1";
export const MAX_TRUSTED_DEVICES = 12;

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Stable id for this browser profile. Two-factor trusts devices, so the id
 * lives in localStorage: clearing site data simply makes the device "new"
 * again and asks for the email link once more.
 */
export function deviceId(storage = globalThis.localStorage) {
  try {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (typeof existing === "string" && existing) return existing;
    const next = randomId();
    storage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    // Private mode or a blocked storage still gets an id for this session.
    return randomId();
  }
}

export function trustedDeviceIds(data) {
  const list = Array.isArray(data?.trusted_devices) ? data.trusted_devices : [];
  return list.filter((id) => typeof id === "string" && id.length <= 128);
}

export function isTrustedDevice(data, id) {
  return trustedDeviceIds(data).includes(id);
}

function securityRef(userId) {
  return doc(firestoreDb, ACCOUNT_SECURITY_COLLECTION, userId);
}

/**
 * Reads the account's security preferences. A missing document means
 * "two-factor off", which is the default for every existing account.
 */
export async function readAccountSecurity(userId) {
  if (!firestoreDb || typeof userId !== "string" || !userId)
    return { enabled: false, trustedDevices: [] };
  const snapshot = await getDoc(securityRef(userId));
  const data = snapshot.exists() ? snapshot.data() : null;
  return {
    enabled: data?.two_factor_enabled === true,
    trustedDevices: trustedDeviceIds(data),
  };
}

async function writeSecurity(userId, patch) {
  await setDoc(
    securityRef(userId),
    { ...patch, updated_at: serverTimestamp() },
    { merge: true },
  );
}

export async function setTwoFactorEnabled(userId, enabled) {
  if (!firestoreDb || typeof userId !== "string" || !userId)
    return { ok: false, message: "Online sign-in is unavailable right now." };
  try {
    await writeSecurity(userId, { two_factor_enabled: enabled === true });
    return { ok: true, enabled: enabled === true };
  } catch (error) {
    return {
      ok: false,
      message:
        error?.code === "permission-denied"
          ? "Security settings could not be saved. Check that the latest Firestore rules are deployed."
          : "Security settings could not be saved. Try again.",
    };
  }
}

/**
 * Remembers this device so the email link is not requested again. The list is
 * capped; the oldest entries drop off first.
 */
export async function trustDevice(userId, id = deviceId()) {
  if (!firestoreDb || typeof userId !== "string" || !userId)
    return { ok: false, message: "Online sign-in is unavailable right now." };
  try {
    const current = await readAccountSecurity(userId);
    const next = [
      ...current.trustedDevices.filter((device) => device !== id),
      id,
    ].slice(-MAX_TRUSTED_DEVICES);
    await writeSecurity(userId, { trusted_devices: next });
    return { ok: true, trustedDevices: next };
  } catch {
    return {
      ok: false,
      message: "This device could not be remembered. Try again.",
    };
  }
}

export async function forgetDevice(userId, id) {
  if (!firestoreDb || typeof userId !== "string" || !userId)
    return { ok: false, message: "Online sign-in is unavailable right now." };
  try {
    const current = await readAccountSecurity(userId);
    const next = current.trustedDevices.filter((device) => device !== id);
    await writeSecurity(userId, { trusted_devices: next });
    return { ok: true, trustedDevices: next };
  } catch {
    return { ok: false, message: "That device could not be removed." };
  }
}
