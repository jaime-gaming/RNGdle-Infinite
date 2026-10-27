import { doc, getDoc } from "firebase/firestore";
import { firebaseConfigured, firestoreDb } from "./firebase.js";
import { pathForProfile } from "./router.js";
import { sanitizeShareCard, shareCardData } from "./profile-card.js";
import { validUsername } from "./progress.js";

export const PUBLIC_PROFILE_COLLECTION = "public_profiles";

export function normalizedProfileName(value) {
  if (typeof value !== "string") return "";
  const name = value.trim().normalize("NFKC");
  if (!validUsername(name)) return "";
  return name.toLowerCase().normalize("NFKC");
}

// The document ID is a case-insensitive, normalized username. A public link
// can therefore resolve a profile with a direct Firestore get, without a
// compressed card in the URL or a list/query over every player's profile.
export function publicProfileId(username) {
  return normalizedProfileName(username);
}

export function publicProfileUrl(
  username,
  origin = globalThis.location?.origin,
  base,
) {
  const path = pathForProfile(username, base);
  return origin ? new URL(path, origin).href : path;
}

export function publicProfileDocument(userId, progress, now = new Date()) {
  const username = progress?.profile?.username;
  const usernameKey = publicProfileId(username);
  if (!userId || !usernameKey)
    throw new Error("A signed-in account and valid profile name are required.");
  const record = sanitizeShareCard(shareCardData(progress, now));
  if (!record || publicProfileId(record.name) !== usernameKey)
    throw new Error("This profile could not be prepared for public viewing.");
  return {
    owner_uid: userId,
    username,
    username_key: usernameKey,
    record,
  };
}

export function sanitizePublicProfileDocument(data, requestedUsername) {
  const expectedId = publicProfileId(requestedUsername);
  if (!expectedId || !data || typeof data !== "object") return null;
  if (
    data.username_key !== expectedId ||
    publicProfileId(data.username) !== expectedId ||
    typeof data.owner_uid !== "string" ||
    !data.owner_uid
  )
    return null;
  const record = sanitizeShareCard(data.record);
  if (!record || publicProfileId(record.name) !== expectedId) return null;
  return record;
}

function requirePublicProfiles() {
  if (!firebaseConfigured || !firestoreDb)
    throw new Error("Public profiles are not available in this build.");
  return firestoreDb;
}

export async function getPublicProfile(username) {
  const id = publicProfileId(username);
  if (!id) return null;
  const database = requirePublicProfiles();
  const snapshot = await getDoc(doc(database, PUBLIC_PROFILE_COLLECTION, id));
  return snapshot.exists()
    ? sanitizePublicProfileDocument(snapshot.data(), username)
    : null;
}

export async function publicProfileNameAvailable(username, userId = "") {
  const id = publicProfileId(username);
  if (!id) return false;
  const database = requirePublicProfiles();
  try {
    const snapshot = await getDoc(doc(database, PUBLIC_PROFILE_COLLECTION, id));
    if (!snapshot.exists()) return true;
    return snapshot.data()?.owner_uid === userId;
  } catch (error) {
    // Existing Firebase projects may not have the public-profile rules deployed
    // yet. Let account setup continue; publishing will give a clear rules notice
    // without blocking the private cloud save or mandatory sign-in.
    if (
      error?.code === "permission-denied" ||
      error?.code === "firestore/permission-denied"
    )
      return true;
    throw error;
  }
}
