export const CLOUD_OWNER_KEY = "rng-infinite-cloud-owner-v1";
export const DELETED_CLOUD_USER_PREFIX = "rng-infinite-deleted-cloud-user-v1:";
export const UNKNOWN_CLOUD_OWNER = Symbol.for(
  "rngdle-infinite.unknown-cloud-save-owner",
);

const OWNER_MARKER_VERSION = 1;
const MAX_UID_LENGTH = 128;

function storageRef(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function validUid(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_UID_LENGTH
  );
}

export function encodeOwnerMetadata(owner) {
  if (owner === UNKNOWN_CLOUD_OWNER) return { kind: "unknown" };
  if (owner == null || owner === "") return { kind: "local" };
  if (validUid(owner)) return { kind: "uid", uid: owner };
  return { kind: "unknown" };
}

export function decodeOwnerMetadata(metadata) {
  if (metadata?.kind === "local") return null;
  if (metadata?.kind === "unknown") return UNKNOWN_CLOUD_OWNER;
  if (metadata?.kind === "uid" && validUid(metadata.uid)) return metadata.uid;
  return UNKNOWN_CLOUD_OWNER;
}

export function serializeOwnerMarker(owner) {
  return JSON.stringify({
    version: OWNER_MARKER_VERSION,
    owner: encodeOwnerMetadata(owner),
  });
}

export function parseOwnerMarker(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === OWNER_MARKER_VERSION && "owner" in parsed)
      return decodeOwnerMetadata(parsed.owner);
  } catch {
    // Prior versions stored the Firebase UID directly. Keep those values
    // readable; an invalid marker cannot be treated as an unowned local save.
  }
  return validUid(raw) ? raw : UNKNOWN_CLOUD_OWNER;
}

export function readCloudOwner(storage) {
  try {
    const target = storageRef(storage);
    if (!target) return UNKNOWN_CLOUD_OWNER;
    const raw = target.getItem(CLOUD_OWNER_KEY);
    return raw == null || raw === "" ? null : parseOwnerMarker(raw);
  } catch {
    // Storage errors must fail closed rather than making an account-owned save
    // look like an unowned guest save eligible for first-sign-in import.
    return UNKNOWN_CLOUD_OWNER;
  }
}

export function writeCloudOwner(owner, storage) {
  try {
    const target = storageRef(storage);
    if (!target) return false;
    if (owner == null || owner === "") target.removeItem(CLOUD_OWNER_KEY);
    else if (owner === UNKNOWN_CLOUD_OWNER || validUid(owner))
      target.setItem(CLOUD_OWNER_KEY, serializeOwnerMarker(owner));
    else return false;
    return true;
  } catch {
    return false;
  }
}

function deletedUserKey(userId) {
  return `${DELETED_CLOUD_USER_PREFIX}${encodeURIComponent(userId)}`;
}

export function markCloudUserDeleted(userId, storage) {
  if (!validUid(userId)) return false;
  try {
    const target = storageRef(storage);
    if (!target) return false;
    target.setItem(deletedUserKey(userId), "1");
    return target.getItem(deletedUserKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function isCloudUserDeleted(userId, storage) {
  if (!validUid(userId)) return false;
  try {
    return storageRef(storage)?.getItem(deletedUserKey(userId)) === "1";
  } catch {
    return false;
  }
}
