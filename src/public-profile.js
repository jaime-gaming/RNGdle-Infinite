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
  const canonical = name.toLowerCase().normalize("NFKC");
  return validUsername(canonical) ? canonical : "";
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
  const path = pathForProfile(publicProfileId(username), base);
  return origin ? new URL(path, origin).href : path;
}

export function publicProfileDocument(
  userId,
  progress,
  now = new Date(),
  { avatar = progress?.profile?.avatar } = {},
) {
  const usernameKey = publicProfileId(progress?.profile?.username);
  if (!userId || !usernameKey)
    throw new Error("A signed-in account and valid profile name are required.");

  // Cloud names have one canonical spelling. Requiring the stored/public name
  // to equal the lowercase reservation key lets Firestore Rules enforce the
  // same case-insensitive uniqueness policy without trusting client transforms.
  const publicProgress = {
    ...progress,
    profile: {
      ...progress.profile,
      username: usernameKey,
      ...(avatar ? { avatar } : { avatar: "" }),
    },
  };
  const record = sanitizeShareCard(shareCardData(publicProgress, now));
  if (!record || record.name !== usernameKey)
    throw new Error("This profile could not be prepared for public viewing.");
  return {
    username: usernameKey,
    username_key: usernameKey,
    record,
  };
}

export function sanitizePublicProfileDocument(data, requestedUsername) {
  const expectedId = publicProfileId(requestedUsername);
  if (!expectedId || !data || typeof data !== "object") return null;
  if (
    data.username_key !== expectedId ||
    publicProfileId(data.username) !== expectedId
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
  try {
    const snapshot = await getDoc(doc(database, PUBLIC_PROFILE_COLLECTION, id));
    return snapshot.exists()
      ? sanitizePublicProfileDocument(snapshot.data(), username)
      : null;
  } catch (error) {
    // A legacy or newly-private summary is intentionally indistinguishable
    // from a missing profile to anyone who is not its owner.
    if (
      error?.code === "permission-denied" ||
      error?.code === "firestore/permission-denied"
    )
      return null;
    throw error;
  }
}
