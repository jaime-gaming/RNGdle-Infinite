// The vault: one compressed copy of the last save this browser managed to
// write. The canonical save stays plain JSON (readable, hand-editable, what
// everything else reads and writes); this is the second copy that only exists
// so a damaged, half-written or quota-squeezed save can never be the end of an
// account. A 6,000-roll save is about 800 KB of JSON and about 46 KB here.
import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";
import { PRE_REPAIR_BACKUP_KEY, PROGRESS_KEY } from "./progress.js";
import {
  UNKNOWN_CLOUD_OWNER,
  decodeOwnerMetadata,
  encodeOwnerMetadata,
  isCloudUserDeleted,
  parseOwnerMarker,
  serializeOwnerMarker,
  writeCloudOwner,
} from "./save-owner.js";

export const SAVE_VAULT_KEY = "rng-infinite-progress-vault-v1";
export const SAVE_HISTORY_KEY = "rng-infinite-progress-history-v1";
export const MAX_SAVE_HISTORY_ENTRIES = 20;
export const MAX_SAVE_HISTORY_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const PRE_REPAIR_OWNER_KEY = "rng-infinite-progress-pre-repair-owner-v1";
export const SAVE_VAULT_TAG = "rngvault1:";
const SAVE_HISTORY_VERSION = 1;
const SAVE_HISTORY_CAPTURE_GAP_MS = 24 * 60 * 60 * 1000;
// A legitimate 6,000-roll save is well below this ceiling. The extra room
// covers future schema growth while preventing a tiny gzip bomb from
// allocating unbounded memory when a local or cloud copy is opened.
export const MAX_SAVE_OUTPUT_BYTES = 10_000_000;
const MAX_PACKED_SAVE_CHARS = 2_000_000;
// One write per minute is plenty: the vault is a safety net, not a log.
const SAVE_VAULT_MIN_GAP_MS = 60 * 1000;

function toBase64(bytes) {
  let binary = "";
  // Chunked so a large save cannot blow the argument list of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(binary);
}

function fromBase64(text) {
  const binary = globalThis.atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Plain JSON in, one short string out. Compression is best-effort: a browser
// without it (or a save too small to gain) still leaves a readable copy.
export function packVaultSave(raw) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    return `${SAVE_VAULT_TAG}${toBase64(gzipSync(strToU8(raw), { level: 6 }))}`;
  } catch {
    return raw;
  }
}

export function unpackVaultSave(packed) {
  if (
    typeof packed !== "string" ||
    !packed ||
    packed.length > MAX_PACKED_SAVE_CHARS
  )
    return "";
  if (!packed.startsWith(SAVE_VAULT_TAG))
    return packed.length <= MAX_SAVE_OUTPUT_BYTES ? packed : "";
  try {
    // One sentinel byte lets us distinguish a complete save at the limit from
    // a decompressed stream that was truncated by the bounded output buffer.
    const bytes = gunzipSync(fromBase64(packed.slice(SAVE_VAULT_TAG.length)), {
      out: new Uint8Array(MAX_SAVE_OUTPUT_BYTES + 1),
    });
    if (bytes.length > MAX_SAVE_OUTPUT_BYTES) return "";
    return strFromU8(bytes);
  } catch {
    return "";
  }
}

// A save worth restoring: real JSON with an object inside.
export function isReadableSave(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function vaultStore(storage) {
  return storage ?? globalThis.localStorage ?? null;
}

function saveProfileId(raw) {
  try {
    const profileId = JSON.parse(raw)?.profile?.id;
    return typeof profileId === "string" ? profileId : "";
  } catch {
    return "";
  }
}

function envelopeOwner(envelope) {
  if (!envelope || !Object.prototype.hasOwnProperty.call(envelope, "owner"))
    return undefined;
  return decodeOwnerMetadata(envelope.owner);
}

export function writePreRepairOwner(owner, storage) {
  try {
    const store = vaultStore(storage);
    if (!store) return false;
    store.setItem(PRE_REPAIR_OWNER_KEY, serializeOwnerMarker(owner));
    return true;
  } catch {
    return false;
  }
}

export function readVault(storage) {
  try {
    const packed = vaultStore(storage)?.getItem(SAVE_VAULT_KEY);
    if (!packed) return null;
    const envelope = JSON.parse(packed);
    const raw = unpackVaultSave(envelope?.raw);
    if (!isReadableSave(raw)) return null;
    return {
      at: Number(envelope.at) || 0,
      bytes: raw.length,
      profileId: saveProfileId(raw),
      ownerId: envelopeOwner(envelope),
      raw,
    };
  } catch {
    return null;
  }
}

function historyEnvelope(storage) {
  try {
    const store = vaultStore(storage);
    const serialized = store?.getItem(SAVE_HISTORY_KEY);
    if (!serialized) return { records: [], corrupt: false };
    const envelope = JSON.parse(serialized);
    if (
      envelope?.version !== SAVE_HISTORY_VERSION ||
      !Array.isArray(envelope.copies)
    )
      return { records: [], corrupt: true };
    return {
      records: envelope.copies.filter(
        (copy) => copy && typeof copy === "object" && !Array.isArray(copy),
      ),
      corrupt: false,
    };
  } catch {
    return { records: [], corrupt: true };
  }
}

function historyRecordView(record, index = 0) {
  const raw = unpackVaultSave(record.raw);
  const valid = isReadableSave(raw);
  return {
    id:
      typeof record.id === "string" && record.id
        ? record.id
        : `legacy-${index}`,
    at: Number(record.at) || 0,
    bytes: valid ? raw.length : 0,
    profileId:
      typeof record.profileId === "string"
        ? record.profileId
        : valid
          ? saveProfileId(raw)
          : "",
    ownerId: envelopeOwner({ owner: record.owner }),
    reason: typeof record.reason === "string" ? record.reason : "",
    source: typeof record.source === "string" ? record.source : "archive",
    raw: valid ? raw : "",
    valid,
    corrupt: !valid,
  };
}

function recentHistoryRecords(records, now = Date.now()) {
  const oldestKeptAt = now - MAX_SAVE_HISTORY_AGE_MS;
  return records
    .filter((record) => {
      const at = Number(record?.at);
      return !Number.isFinite(at) || at <= 0 || at >= oldestKeptAt;
    })
    .sort((left, right) => (Number(right.at) || 0) - (Number(left.at) || 0))
    .slice(0, MAX_SAVE_HISTORY_ENTRIES);
}

function writeHistoryEnvelope(storage, records, requiredId = null) {
  const store = vaultStore(storage);
  if (!store) return false;
  const remaining = [...records];
  while (true) {
    if (requiredId && !remaining.some((record) => record.id === requiredId))
      return false;
    try {
      if (!remaining.length) store.removeItem(SAVE_HISTORY_KEY);
      else
        store.setItem(
          SAVE_HISTORY_KEY,
          JSON.stringify({ version: SAVE_HISTORY_VERSION, copies: remaining }),
        );
      return true;
    } catch {
      if (!remaining.length) return false;
      // Drop the oldest archive first if the browser's storage quota is tight.
      remaining.pop();
    }
  }
}

function historyId(source, now, raw, ownerId, profileId) {
  let hash = 2166136261;
  const identity = JSON.stringify([
    raw,
    profileId,
    encodeOwnerMetadata(ownerId),
  ]);
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source}-${Number(now).toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function archiveSavedCopy(raw, options = {}) {
  const settings = options ?? {};
  const {
    storage,
    now = Date.now(),
    reason = "",
    source = "manual",
  } = settings;
  const ownerId = Object.prototype.hasOwnProperty.call(settings, "ownerId")
    ? settings.ownerId
    : null;
  if (!isReadableSave(raw)) return false;
  const store = vaultStore(storage);
  if (!store) return false;
  const { records, corrupt } = historyEnvelope(store);
  if (corrupt) return false;
  const profileId = saveProfileId(raw);
  const copyOwner = ownerId === undefined ? UNKNOWN_CLOUD_OWNER : ownerId;
  const retained = recentHistoryRecords(records, now);
  const existing = retained
    .map(historyRecordView)
    .find(
      (copy) =>
        copy.valid &&
        copy.raw === raw &&
        copy.ownerId === copyOwner &&
        copy.profileId === profileId,
    );
  if (existing) {
    if (retained.length !== records.length)
      writeHistoryEnvelope(store, retained);
    return true;
  }

  const id = historyId(source, now, raw, copyOwner, profileId);
  const record = {
    id,
    at: now,
    profileId,
    owner: encodeOwnerMetadata(copyOwner),
    reason: String(reason).slice(0, 500),
    source: String(source).slice(0, 40),
    raw: packVaultSave(raw),
  };
  return writeHistoryEnvelope(
    store,
    [record, ...retained].slice(0, MAX_SAVE_HISTORY_ENTRIES),
    id,
  );
}

export function readSavedCopyHistory(storage, { now = Date.now() } = {}) {
  const { records, corrupt } = historyEnvelope(storage);
  if (corrupt) return { copies: [], corrupt: true };
  return {
    copies: recentHistoryRecords(records, now)
      .map(historyRecordView)
      .sort((left, right) => right.at - left.at),
    corrupt: false,
  };
}

function copyFromEnvelope(storage, key, id, source, label) {
  let serialized;
  try {
    serialized = vaultStore(storage)?.getItem(key);
  } catch {
    return null;
  }
  if (!serialized) return null;
  let envelope = null;
  try {
    envelope = JSON.parse(serialized);
  } catch {}
  const raw = unpackVaultSave(envelope?.raw);
  const valid = isReadableSave(raw);
  return {
    id,
    source,
    label,
    at: Number(envelope?.at) || 0,
    bytes: valid ? raw.length : 0,
    profileId:
      typeof envelope?.profileId === "string"
        ? envelope.profileId
        : valid
          ? saveProfileId(raw)
          : "",
    ownerId: envelopeOwner(envelope),
    reason: typeof envelope?.reason === "string" ? envelope.reason : "",
    raw: valid ? raw : "",
    valid,
    corrupt: !valid,
  };
}

export function getRecoveryCopies(storage) {
  const copies = [];
  const vault = copyFromEnvelope(
    storage,
    SAVE_VAULT_KEY,
    "vault",
    "automatic",
    "Automatic backup",
  );
  const recovery = copyFromEnvelope(
    storage,
    CLOUD_RECOVERY_KEY,
    "cloud-recovery",
    "conflict",
    "Conflict recovery",
  );
  if (vault) copies.push(vault);
  if (recovery) copies.push(recovery);

  try {
    const store = vaultStore(storage);
    const preRepairRaw = store?.getItem(PRE_REPAIR_BACKUP_KEY);
    if (preRepairRaw) {
      const valid = isReadableSave(preRepairRaw);
      let at = 0;
      try {
        at = Number(JSON.parse(preRepairRaw)?.updatedAt) || 0;
      } catch {}
      copies.push({
        id: "pre-repair",
        source: "pre-repair",
        label: "Before save repair",
        at,
        bytes: valid ? preRepairRaw.length : 0,
        profileId: valid ? saveProfileId(preRepairRaw) : "",
        ownerId:
          store.getItem(PRE_REPAIR_OWNER_KEY) == null
            ? undefined
            : parseOwnerMarker(store.getItem(PRE_REPAIR_OWNER_KEY)),
        reason: "Original bytes retained before automatic repair.",
        raw: valid ? preRepairRaw : "",
        valid,
        corrupt: !valid,
      });
    }
  } catch {}

  try {
    const store = vaultStore(storage);
    const historyState = historyEnvelope(store);
    if (!historyState.corrupt) {
      const retained = recentHistoryRecords(historyState.records);
      if (retained.length !== historyState.records.length)
        writeHistoryEnvelope(store, retained);
    }
  } catch {}

  const history = readSavedCopyHistory(storage);
  if (history.corrupt) {
    copies.push({
      id: "history-index-corrupt",
      source: "archive",
      label: "Archived save history — damaged",
      at: 0,
      bytes: 0,
      profileId: "",
      ownerId: undefined,
      reason: "The archive index could not be read; it cannot be restored.",
      raw: "",
      valid: false,
      corrupt: true,
    });
  } else {
    copies.push(
      ...history.copies.map((copy) => ({
        ...copy,
        id: `history:${copy.id}`,
        label:
          copy.source === "conflict"
            ? "Archived conflict save"
            : copy.source === "pre-repair"
              ? "Archived pre-repair save"
              : copy.source === "manual-restore"
                ? "Before manual restore"
                : copy.source === "daily"
                  ? "Daily automatic snapshot"
                  : copy.source === "manual"
                    ? "Archived local save"
                    : "Archived save",
      })),
    );
  }

  return copies.sort((left, right) => right.at - left.at);
}

// Keep the newest good copy. `raw` is the exact save string that was just
// written, and `now` only decides how often the vault is refreshed.
export function writeVault(
  raw,
  {
    storage,
    now = Date.now(),
    minGapMs = SAVE_VAULT_MIN_GAP_MS,
    ownerId = null,
  } = {},
) {
  if (!isReadableSave(raw)) return false;
  const store = vaultStore(storage);
  if (!store) return false;
  try {
    const current = readVault(store);
    if (minGapMs > 0 && current && now - current.at < minGapMs) return false;
    if (
      current &&
      current.raw !== raw &&
      now >= current.at + SAVE_HISTORY_CAPTURE_GAP_MS &&
      !archiveSavedCopy(current.raw, {
        storage: store,
        now: current.at,
        reason: "Daily automatic save snapshot",
        ownerId: current.ownerId,
        source: "daily",
      })
    )
      return false;
    store.setItem(
      SAVE_VAULT_KEY,
      JSON.stringify({
        at: now,
        raw: packVaultSave(raw),
        owner: encodeOwnerMetadata(ownerId),
      }),
    );
    return true;
  } catch {
    // A full vault must never break the save that was just written.
    return false;
  }
}

// A separate, explicit slot for the save displaced by an account conflict.
// The ordinary rolling vault continues to protect the live local save.
export const CLOUD_RECOVERY_KEY = "rng-infinite-cloud-recovery-v1";

export function writeCloudRecovery(
  raw,
  { storage, now = Date.now(), reason = "", ownerId = null } = {},
) {
  if (!isReadableSave(raw)) return false;
  const store = vaultStore(storage);
  if (!store) return false;
  try {
    const profileId = saveProfileId(raw);
    const current = readCloudRecovery(store);
    // There is one recovery slot. Never silently replace a copy belonging to
    // another account or profile; a later conflict must stop until the earlier
    // copy has been deliberately restored or removed.
    if (
      current &&
      (current.profileId !== profileId || current.ownerId !== ownerId)
    )
      return false;
    if (
      current &&
      current.raw !== raw &&
      !archiveSavedCopy(current.raw, {
        storage: store,
        now: current.at,
        reason: current.reason || "Earlier cloud conflict copy",
        ownerId: current.ownerId,
        source: "conflict",
      })
    )
      return false;
    store.setItem(
      CLOUD_RECOVERY_KEY,
      JSON.stringify({
        at: now,
        raw: packVaultSave(raw),
        reason: String(reason).slice(0, 500),
        owner: encodeOwnerMetadata(ownerId),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readCloudRecovery(storage) {
  try {
    const envelope = JSON.parse(
      vaultStore(storage)?.getItem(CLOUD_RECOVERY_KEY) ?? "null",
    );
    const raw = unpackVaultSave(envelope?.raw);
    if (!isReadableSave(raw)) return null;
    const parsed = JSON.parse(raw);
    return {
      at: Number(envelope?.at) || 0,
      bytes: raw.length,
      profileId:
        typeof parsed.profile?.id === "string" ? parsed.profile.id : "",
      ownerId: envelopeOwner(envelope),
      reason: typeof envelope?.reason === "string" ? envelope.reason : "",
      raw,
    };
  } catch {
    return null;
  }
}

export function clearCloudRecovery(storage) {
  try {
    const store = vaultStore(storage);
    if (!store) return false;
    store.removeItem(CLOUD_RECOVERY_KEY);
    return store.getItem(CLOUD_RECOVERY_KEY) === null;
  } catch {
    // A cleanup failure cannot affect the live save.
    return false;
  }
}

// Runs at start-up, before anything reads the save. Only an unreadable or
// missing save is replaced, so a working account is never overwritten and a
// deleted account (which clears the vault too) is never resurrected.
export function restoreVaultIfNeeded({
  storage,
  now = Date.now(),
  maxAgeMs = 0,
} = {}) {
  const store = vaultStore(storage);
  if (!store) return { restored: false };
  try {
    const stored = store.getItem(PROGRESS_KEY);
    if (isReadableSave(stored)) return { restored: false };
    const vault = readVault(store);
    if (!vault) return { restored: false };
    if (maxAgeMs > 0 && now - vault.at > maxAgeMs) return { restored: false };
    if (
      typeof vault.ownerId === "string" &&
      isCloudUserDeleted(vault.ownerId, store)
    )
      return { restored: false, deletedAccount: true };
    const owner =
      vault.ownerId === undefined ? UNKNOWN_CLOUD_OWNER : vault.ownerId;
    if (!writeCloudOwner(owner, store)) return { restored: false };
    try {
      store.setItem(PROGRESS_KEY, vault.raw);
    } catch (error) {
      writeCloudOwner(UNKNOWN_CLOUD_OWNER, store);
      throw error;
    }
    return { restored: true, at: vault.at, bytes: vault.bytes };
  } catch {
    return { restored: false };
  }
}

export function clearVault(storage) {
  try {
    const store = vaultStore(storage);
    if (!store) return false;
    store.removeItem(SAVE_VAULT_KEY);
    return store.getItem(SAVE_VAULT_KEY) === null;
  } catch {
    // Nothing to do: the ordinary save is untouched either way.
    return false;
  }
}

function copyDisposition(
  copyOwner,
  copyProfileId,
  targetOwner,
  targetProfileId,
) {
  const profileMatches =
    Boolean(targetProfileId) && copyProfileId === targetProfileId;
  if (targetOwner === undefined && profileMatches) return "remove";
  if (typeof copyOwner === "string")
    return copyOwner === targetOwner ? "remove" : "keep";
  if (copyOwner === null) {
    if (
      profileMatches &&
      (targetOwner == null ||
        targetOwner === UNKNOWN_CLOUD_OWNER ||
        typeof targetOwner === "string")
    )
      return "remove";
    return "keep";
  }
  // Old copies and malformed ownership metadata cannot be attributed by UID.
  // An exact profile ID remains a useful compatibility signal; otherwise do
  // not delete a possibly unrelated account's recovery data silently.
  if (profileMatches) return "remove";
  if (typeof targetOwner === "string") return "unverified";
  if (targetOwner === UNKNOWN_CLOUD_OWNER) return "unverified";
  return "keep";
}

function removeAndVerify(store, keys) {
  try {
    for (const key of keys) store.removeItem(key);
    return keys.every((key) => store.getItem(key) === null);
  } catch {
    return false;
  }
}

export function clearLocalSaveRecovery(storage, profileId, ownerId) {
  let store;
  try {
    store = vaultStore(storage);
  } catch {
    return false;
  }
  if (!store) return false;
  const targetProfileId =
    typeof profileId === "string" && profileId ? profileId : null;
  const targetOwner = ownerId === "" ? null : ownerId;
  if (targetProfileId == null && targetOwner == null) {
    try {
      return ![
        PRE_REPAIR_BACKUP_KEY,
        PRE_REPAIR_OWNER_KEY,
        SAVE_VAULT_KEY,
        SAVE_HISTORY_KEY,
        CLOUD_RECOVERY_KEY,
      ].some((key) => store.getItem(key));
    } catch {
      return false;
    }
  }

  let cleared = true;
  try {
    const preRepair = store.getItem(PRE_REPAIR_BACKUP_KEY);
    const preRepairOwnerRaw = store.getItem(PRE_REPAIR_OWNER_KEY);
    if (preRepair) {
      if (!isReadableSave(preRepair)) cleared = false;
      else {
        const copyProfileId = saveProfileId(preRepair);
        const copyOwner =
          preRepairOwnerRaw == null
            ? undefined
            : parseOwnerMarker(preRepairOwnerRaw);
        const disposition = copyDisposition(
          copyOwner,
          copyProfileId,
          targetOwner,
          targetProfileId,
        );
        if (disposition === "remove")
          cleared =
            removeAndVerify(store, [
              PRE_REPAIR_BACKUP_KEY,
              PRE_REPAIR_OWNER_KEY,
            ]) && cleared;
        else if (disposition === "unverified") cleared = false;
      }
    } else if (preRepairOwnerRaw != null) {
      // An orphaned metadata key is not save content, but remove it when its
      // owner is the account being deleted.
      const copyOwner = parseOwnerMarker(preRepairOwnerRaw);
      if (copyOwner === targetOwner)
        cleared = removeAndVerify(store, [PRE_REPAIR_OWNER_KEY]) && cleared;
    }
  } catch {
    cleared = false;
  }

  let vaultRaw = null;
  try {
    vaultRaw = store.getItem(SAVE_VAULT_KEY);
  } catch {
    cleared = false;
  }
  const vault = readVault(store);
  if (vault) {
    const disposition = copyDisposition(
      vault.ownerId,
      vault.profileId,
      targetOwner,
      targetProfileId,
    );
    if (disposition === "remove")
      cleared = removeAndVerify(store, [SAVE_VAULT_KEY]) && cleared;
    else if (disposition === "unverified") cleared = false;
  } else if (vaultRaw) cleared = false;

  let recoveryRaw = null;
  try {
    recoveryRaw = store.getItem(CLOUD_RECOVERY_KEY);
  } catch {
    cleared = false;
  }
  const recovery = readCloudRecovery(store);
  if (recovery) {
    const disposition = copyDisposition(
      recovery.ownerId,
      recovery.profileId,
      targetOwner,
      targetProfileId,
    );
    if (disposition === "remove")
      cleared = removeAndVerify(store, [CLOUD_RECOVERY_KEY]) && cleared;
    else if (disposition === "unverified") cleared = false;
  } else if (recoveryRaw) cleared = false;

  let historyRaw = null;
  try {
    historyRaw = store.getItem(SAVE_HISTORY_KEY);
  } catch {
    cleared = false;
  }
  if (historyRaw) {
    const history = historyEnvelope(store);
    if (history.corrupt) cleared = false;
    else {
      const retained = [];
      let changed = false;
      history.records.forEach((record, index) => {
        const copy = historyRecordView(record, index);
        const disposition = copyDisposition(
          copy.ownerId,
          copy.profileId,
          targetOwner,
          targetProfileId,
        );
        if (disposition === "remove") changed = true;
        else {
          retained.push(record);
          if (disposition === "unverified") cleared = false;
        }
      });
      if (changed && !writeHistoryEnvelope(store, retained)) cleared = false;
    }
  }
  return cleared;
}
