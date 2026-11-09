import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = process.env.FAKE_FIRESTORE || "/tmp/fake-firestore.json";
const now = () => Date.now();

let store = null;
function load() {
  if (!store)
    store = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  return store;
}
function persist() {
  writeFileSync(FILE, JSON.stringify(store, null, 1));
}

function encode(value) {
  if (value && typeof value === "object" && value.__serverTimestamp)
    return { __ts: now() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, encode(v)]),
    );
  return value;
}
function hydrate(value) {
  if (Array.isArray(value)) return value.map(hydrate);
  if (value && typeof value === "object") {
    if (typeof value.__ts === "number") {
      const ms = value.__ts;
      return {
        seconds: Math.floor(ms / 1000),
        nanoseconds: (ms % 1000) * 1e6,
        toMillis: () => ms,
        toDate: () => new Date(ms),
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, hydrate(v)]),
    );
  }
  return value;
}
const raw = (path) => load()[path] ?? null;
const isStamp = (value) =>
  Boolean(value && typeof value === "object" && typeof value.__ts === "number");
const stampOf = (value) => (isStamp(value) ? value.__ts : null);

const NAME_KEY = /^[\p{Ll}\p{Lo}\p{Lm}\p{N}_-]{3,20}$/u;
const sameKeys = (data, keys) =>
  Boolean(data) &&
  Object.keys(data).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(data, key));
const sameStamp = (a, b) => stampOf(a) === stampOf(b) || a === b;
function denial(why) {
  const error = new Error(`Missing or insufficient permissions: ${why}`);
  error.code = "permission-denied";
  return error;
}

function makeCommit(staged) {
  const getAfter = (path) => {
    if (staged.has(path)) {
      const entry = staged.get(path);
      return entry.delete ? null : entry.data;
    }
    return raw(path);
  };
  const existsAfter = (path) => getAfter(path) !== null;

  const savePath = (uid) => `player_saves/${uid}`;
  const settingsPath = (uid) => `cloud_profile_settings/${uid}`;
  const claimPath = (key) => `cloud_profile_names/${key}`;
  const publicPath = (key) => `public_profiles/${key}`;
  const ownerPath = (key) => `public_profile_owners/${key}`;
  const saveLimitPath = (uid) => `cloud_save_write_limits/${uid}`;
  const publicLimitPath = (uid) => `cloud_public_profile_write_limits/${uid}`;

  function profileIsPublicAfter(key, uid) {
    if (!NAME_KEY.test(key)) return false;
    const owner = getAfter(ownerPath(key));
    const settings = getAfter(settingsPath(uid));
    const claim = getAfter(claimPath(key));
    const save = getAfter(savePath(uid));
    return Boolean(
      owner &&
      owner.owner_uid === uid &&
      owner.profile_id === key &&
      settings &&
      settings.username_key === key &&
      claim &&
      claim.owner_uid === uid &&
      claim.profile_id === settings.profile_id &&
      save &&
      save.public_profile_enabled === true &&
      save.public_profile_id === key,
    );
  }

  function saveWriteAllowed(uid, time) {
    const limit = getAfter(saveLimitPath(uid));
    if (!sameKeys(limit, ["last_write_at"])) return false;
    if (!isStamp(limit.last_write_at)) return false;
    const previous = raw(saveLimitPath(uid));
    if (previous && isStamp(previous.last_write_at)) {
      if (time < previous.last_write_at.__ts + 2000) return false;
    }
    const save = getAfter(savePath(uid));
    return Boolean(save && isStamp(save.updated_at));
  }

  function publicWriteAllowed(uid, time) {
    const limit = getAfter(publicLimitPath(uid));
    if (!sameKeys(limit, ["last_write_at"])) return false;
    if (!isStamp(limit.last_write_at)) return false;
    const previous = raw(publicLimitPath(uid));
    if (previous && isStamp(previous.last_write_at)) {
      if (time < previous.last_write_at.__ts + 2000) return false;
    }
    return true;
  }

  function settingsNameClaimMatchesAfter(uid, settings) {
    if (settings.username_key === null) return true;
    if (!NAME_KEY.test(settings.username_key)) return false;
    const claim = getAfter(claimPath(settings.username_key));
    return Boolean(
      claim &&
      claim.owner_uid === uid &&
      claim.profile_id === settings.profile_id,
    );
  }

  function cloudProfileSettingsReadyAfter(uid, allowUnreserved) {
    const settings = getAfter(settingsPath(uid));
    if (!settings || !validSettingsShape(settings)) return false;
    if (typeof settings.username_key === "string")
      return settingsNameClaimMatchesAfter(uid, settings);
    return allowUnreserved && settings.username_key === null;
  }

  function validSaveEnvelope(data) {
    return Boolean(
      sameKeys(data, [
        "save_data",
        "updated_at",
        "public_profile_id",
        "public_profile_enabled",
      ]) &&
      typeof data.save_data === "string" &&
      data.save_data.length > 0 &&
      data.save_data.length <= 900000 &&
      isStamp(data.updated_at) &&
      typeof data.public_profile_enabled === "boolean" &&
      (data.public_profile_id === null ||
        (typeof data.public_profile_id === "string" &&
          NAME_KEY.test(data.public_profile_id))) &&
      (data.public_profile_enabled === true || data.public_profile_id === null),
    );
  }

  function validSavePublicLinkAfter(uid, data) {
    return (
      data.public_profile_id === null ||
      (data.public_profile_enabled === true &&
        profileIsPublicAfter(data.public_profile_id, uid))
    );
  }

  function previousPublicAliasRemovedAfter(uid, previous, next) {
    const wasPublic = previous?.public_profile_enabled === true;
    const previousId = previous?.public_profile_id ?? null;
    const nextId = next?.public_profile_id ?? null;
    if (!wasPublic || previousId === null || previousId === nextId) return true;
    const otherOwner = raw(ownerPath(previousId));
    if (otherOwner && otherOwner.owner_uid !== uid) return true;
    return (
      !existsAfter(publicPath(previousId)) &&
      !existsAfter(ownerPath(previousId))
    );
  }

  function profileNoLongerPublicAfter(key, uid) {
    const save = getAfter(savePath(uid));
    return (
      !save ||
      save.public_profile_enabled !== true ||
      save.public_profile_id !== key
    );
  }

  function validSettingsShape(data) {
    const keys = [
      "username_key",
      "profile_id",
      "username_changed_at",
      "avatar",
      "avatar_changed_at",
      "updated_at",
    ];
    if (!sameKeys(data, keys)) return false;
    if (!isStamp(data.updated_at)) return false;
    if (typeof data.profile_id !== "string" || !data.profile_id.length)
      return false;
    if (data.profile_id.length > 128) return false;
    if (data.username_key !== null && !NAME_KEY.test(data.username_key))
      return false;
    if (data.avatar !== null) {
      if (
        typeof data.avatar !== "string" ||
        data.avatar.length > 240000 ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          data.avatar,
        )
      )
        return false;
    }
    for (const key of ["username_changed_at", "avatar_changed_at"])
      if (data[key] !== null && !isStamp(data[key])) return false;
    return true;
  }

  function nameClaimOwnedNow(uid, key) {
    const claim = raw(claimPath(key));
    return Boolean(claim && claim.owner_uid === uid);
  }

  function settingsNameChangeAllowed(uid, previous, next, time) {
    const oldName = previous.username_key;
    const newName = next.username_key;
    if (oldName === newName)
      return sameStamp(next.username_changed_at, previous.username_changed_at);
    const cooldownPassed =
      !isStamp(previous.username_changed_at) ||
      time >= previous.username_changed_at.__ts + 30 * 24 * 60 * 60 * 1000;
    const oldClaimedByUser =
      typeof oldName === "string" && nameClaimOwnedNow(uid, oldName);
    const oldClaimReleased =
      !oldClaimedByUser ||
      (!existsAfter(claimPath(oldName)) &&
        profileNoLongerPublicAfter(oldName, uid));
    return Boolean(
      typeof newName === "string" &&
      isStamp(next.username_changed_at) &&
      cooldownPassed &&
      oldClaimReleased,
    );
  }

  function settingsAvatarChangeAllowed(previous, next, time) {
    if (previous.avatar === next.avatar)
      return sameStamp(next.avatar_changed_at, previous.avatar_changed_at);
    return Boolean(
      isStamp(next.avatar_changed_at) &&
      (!isStamp(previous.avatar_changed_at) ||
        time >= previous.avatar_changed_at.__ts + 7 * 24 * 60 * 60 * 1000),
    );
  }

  function settingsReservationOnly(uid, previous, next) {
    return Boolean(
      previous.username_key === null &&
      typeof next.username_key === "string" &&
      previous.profile_id === next.profile_id &&
      previous.avatar === next.avatar &&
      sameStamp(previous.avatar_changed_at, next.avatar_changed_at) &&
      isStamp(next.username_changed_at) &&
      isStamp(next.updated_at) &&
      existsAfter(savePath(uid)),
    );
  }

  function settingsProfileIdOnly(uid, previous, next) {
    return Boolean(
      (previous.username_key === null ||
        NAME_KEY.test(previous.username_key)) &&
      next.username_key === previous.username_key &&
      typeof next.profile_id === "string" &&
      next.profile_id !== previous.profile_id &&
      sameStamp(next.username_changed_at, previous.username_changed_at) &&
      next.avatar === previous.avatar &&
      sameStamp(next.avatar_changed_at, previous.avatar_changed_at) &&
      isStamp(next.updated_at) &&
      existsAfter(savePath(uid)),
    );
  }

  function settingsSaveLinked(uid, time) {
    return existsAfter(savePath(uid)) && saveWriteAllowed(uid, time);
  }

  function validPublicProfileRecord(key, data) {
    const keys = ["username", "username_key", "record", "updated_at"];
    if (!sameKeys(data, keys)) return false;
    if (data.username !== key || data.username_key !== key) return false;
    if (!isStamp(data.updated_at)) return false;
    const record = data.record;
    const recordKeys = [
      "v",
      "name",
      "at",
      "since",
      "best",
      "rolls",
      "earned",
      "badges",
      "badgesTotal",
      "rebirths",
      "prestiges",
      "pins",
      "favoriteTier",
      "aura",
      "companion",
      "avatar",
    ];
    if (!sameKeys(record, recordKeys)) return false;
    return (
      record.v === 3 &&
      record.name === key &&
      Array.isArray(record.pins) &&
      record.pins.length <= 10
    );
  }

  function publicProfileOwnedByUser(key, uid) {
    const owner = raw(ownerPath(key));
    if (owner) return owner.owner_uid === uid && owner.profile_id === key;
    const profile = raw(publicPath(key));
    if (profile && "owner_uid" in profile) return profile.owner_uid === uid;
    const save = raw(savePath(uid));
    const claim = raw(claimPath(key));
    const settings = raw(settingsPath(uid));
    return Boolean(
      (save &&
        save.public_profile_enabled === true &&
        save.public_profile_id === key) ||
      (claim?.owner_uid === uid &&
        settings?.username_key === key &&
        settings?.profile_id === claim.profile_id),
    );
  }

  function nameClaimMayBeDeletedAfter(key, uid) {
    const settings = getAfter(settingsPath(uid));
    const save = getAfter(savePath(uid));
    return !settings || settings.username_key !== key || !save;
  }

  function check(path, data, previous, time, uid) {
    const [collection, id, ...rest] = path.split("/");
    if (rest.length) return denial(`nested path ${path}`);
    const isCreate = previous === null;
    switch (collection) {
      case "player_saves": {
        if (id !== uid) return denial("save owner");
        if (!validSaveEnvelope(data)) return denial("save envelope");
        if (!cloudProfileSettingsReadyAfter(uid, true))
          return denial("save without ready settings/claim");
        if (!validSavePublicLinkAfter(uid, data))
          return denial("save public link is not a live public alias");
        if (!isCreate && !previousPublicAliasRemovedAfter(uid, previous, data))
          return denial("previous public alias was left behind");
        if (!saveWriteAllowed(uid, time)) return denial("save not allowed");
        return null;
      }
      case "cloud_save_write_limits":
        if (id !== uid) return denial("write limit owner");
        if (!sameKeys(data, ["last_write_at"]))
          return denial("write limit shape");
        if (!isStamp(data.last_write_at)) return denial("write limit stamp");
        if (!saveWriteAllowed(uid, time))
          return denial("write limit not allowed");
        return null;
      case "cloud_public_profile_write_limits":
        if (!sameKeys(data, ["last_write_at"]))
          return denial("public write limit shape");
        if (!isStamp(data.last_write_at))
          return denial("public write limit stamp");
        if (!publicWriteAllowed(uid, time))
          return denial("public write limit not allowed");
        return null;
      case "cloud_profile_settings": {
        if (id !== uid) return denial("settings owner");
        if (!validSettingsShape(data)) return denial("settings shape");
        if (!isStamp(data.updated_at)) return denial("settings updated_at");
        if (!existsAfter(savePath(uid)))
          return denial("settings without a save");
        if (!settingsNameClaimMatchesAfter(uid, data))
          return denial("settings claim mismatch");
        if (isCreate) {
          if (data.username_key === null) {
            if (
              data.username_changed_at !== null &&
              !isStamp(data.username_changed_at)
            )
              return denial("settings name stamp");
          } else if (!isStamp(data.username_changed_at))
            return denial("settings name stamp");
          if (data.avatar === null) {
            if (data.avatar_changed_at !== null)
              return denial("settings avatar stamp");
          } else if (!isStamp(data.avatar_changed_at))
            return denial("settings avatar stamp");
          return null;
        }
        if (!settingsNameChangeAllowed(uid, previous, data, time))
          return denial("settings name change");
        if (!settingsAvatarChangeAllowed(previous, data, time))
          return denial("settings avatar change");
        if (
          !settingsReservationOnly(uid, previous, data) &&
          !settingsProfileIdOnly(uid, previous, data) &&
          !settingsSaveLinked(uid, time)
        )
          return denial("settings update is neither linked nor narrow");
        return null;
      }
      case "cloud_profile_names": {
        if (!NAME_KEY.test(id)) return denial("claim key");
        if (!sameKeys(data, ["owner_uid", "profile_id"]))
          return denial("claim shape");
        if (data.owner_uid !== uid) return denial("claim owner");
        if (!isCreate && previous.owner_uid !== uid)
          return denial("claim owner");
        const settings = getAfter(settingsPath(data.profile_id ? uid : uid));
        if (
          !settings ||
          settings.username_key !== id ||
          settings.profile_id !== data.profile_id
        )
          return denial("claim without matching settings");
        return null;
      }
      case "public_profiles": {
        if (!validPublicProfileRecord(id, data))
          return denial("public profile record");
        if (!profileIsPublicAfter(id, uid))
          return denial("public profile without a public save");
        if (!isCreate && !publicProfileOwnedByUser(id, uid))
          return denial("public profile owner");
        if (!publicWriteAllowed(uid, time))
          return denial("public profile write limit");
        return null;
      }
      case "public_profile_owners": {
        if (!sameKeys(data, ["owner_uid", "profile_id"]))
          return denial("owner shape");
        if (data.owner_uid !== uid || data.profile_id !== id)
          return denial("owner pointer");
        if (!isCreate && previous.owner_uid !== uid)
          return denial("owner not held by user");
        if (!profileIsPublicAfter(id, uid))
          return denial("owner pointer without a public save");
        if (!publicWriteAllowed(uid, time)) return denial("owner write limit");
        return null;
      }
      case "account_security":
        if (id !== uid) return denial("security owner");
        if (!data.updated_at || !isStamp(data.updated_at))
          return denial("security updated_at");
        return null;
      default:
        return denial(`unknown collection ${collection}`);
    }
  }

  function checkDelete(path, previous, uid, time) {
    const [collection, id] = path.split("/");
    switch (collection) {
      case "public_profiles":
        return previous &&
          publicProfileOwnedByUser(id, uid) &&
          profileNoLongerPublicAfter(id, uid)
          ? null
          : denial("public profile delete");
      case "public_profile_owners":
        return previous &&
          previous.owner_uid === uid &&
          profileNoLongerPublicAfter(id, uid)
          ? null
          : denial("owner delete");
      case "cloud_profile_names":
        return previous &&
          previous.owner_uid === uid &&
          nameClaimMayBeDeletedAfter(id, uid) &&
          profileNoLongerPublicAfter(id, uid)
          ? null
          : denial("claim delete");
      case "public_profiles_unused":
        return null;
      default:
        return null;
    }
  }

  function validate(time, uid) {
    for (const [path, entry] of staged) {
      if (entry.delete) {
        const problem = checkDelete(path, raw(path), uid, time);
        if (problem) return problem;
      }
    }
    for (const [path, entry] of staged) {
      if (entry.delete) continue;
      const problem = check(path, entry.data, raw(path), time, uid);
      if (problem)
        return denial(`${path}: ${problem.message.replace(/^.*: /, "")}`);
    }
    return null;
  }

  return { getAfter, existsAfter, validate };
}

export function doc(database, ...segments) {
  const parts = segments.flatMap((segment) =>
    typeof segment === "string" ? segment.split("/") : [],
  );
  return { __doc: true, path: parts.join("/"), id: parts.at(-1) };
}

function snapshotFor(path) {
  const data = raw(path);
  return {
    id: path.split("/").at(-1),
    ref: { __doc: true, path },
    exists: () => data !== null,
    data: () => (data === null ? undefined : hydrate(structuredClone(data))),
    get: (field) => (data === null ? undefined : hydrate(data)[field]),
  };
}

export async function getDoc(reference) {
  load();
  return snapshotFor(reference.path);
}

export async function setDoc(reference, data) {
  load();
  const staged = new Map([[reference.path, { data: encode(data) }]]);
  const { validate } = makeCommit(staged);
  const problem = validate(now(), process.env.FAKE_UID || "");
  if (problem) throw problem;
  store[reference.path] = staged.get(reference.path).data;
  persist();
}

export async function runTransaction(_database, updateFunction) {
  load();
  const staged = new Map();
  const transaction = {
    get: async (reference) => snapshotFor(reference.path),
    set: (reference, data) =>
      staged.set(reference.path, { data: encode(data) }),
    update: (reference, data) =>
      staged.set(reference.path, {
        data: { ...(raw(reference.path) ?? {}), ...encode(data) },
      }),
    delete: (reference) => staged.set(reference.path, { delete: true }),
  };
  const result = await updateFunction(transaction);
  const time = now();
  const { validate } = makeCommit(staged);
  const problem = validate(time, process.env.FAKE_UID || "");
  if (problem) {
    if (process.env.SIM_DEBUG)
      console.error(
        "[rules]",
        problem.message,
        "\n[staged]",
        [...staged.keys()].join(", "),
      );
    throw problem;
  }
  for (const [path, entry] of staged) {
    if (entry.delete) delete store[path];
    else store[path] = entry.data;
  }
  persist();
  return result;
}

export const serverTimestamp = () => ({ __serverTimestamp: true });
export const collection = (_database, name) => ({ __collection: name });
export const query = (reference) => reference;
export const where = () => null;
export const orderBy = () => null;
export const limit = () => null;
export const getDocs = async () => {
  throw new Error("collection reads are denied by the rules model");
};
export const deleteDoc = async (reference) => {
  load();
  delete store[reference.path];
  persist();
};
