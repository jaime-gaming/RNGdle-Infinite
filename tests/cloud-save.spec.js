import { expect, test } from "./helpers/clock.js";
import {
  chooseSaveWinner,
  clearCloudDirty,
  compareSaveEpoch,
  compareSaveRichness,
  decodeCloudSave,
  encodeCloudSave,
  isCloudDirty,
  markCloudDirty,
  readCloudDirtyOwner,
  selectLocalSaveForCloudUser,
} from "../src/cloud-save.js";
import { applyProgress, emptyProgress } from "../src/progress.js";

function memoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.get(String(key)) ?? null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
  };
}

const empty = { profile: null };
const localA = { profile: { id: "profile-a" } };
const localB = { profile: { id: "profile-b" } };
const progress = (overrides = {}) => ({
  ...emptyProgress(),
  profile: { id: "profile-a", username: "player-a", createdAt: 1 },
  ...overrides,
});

test("same-profile local progress wins only by strict dominance", () => {
  const cloud = progress({ balance: 100, totalEarned: 100 });
  const richerLocal = progress({ balance: 150, totalEarned: 150 });

  expect(compareSaveRichness(richerLocal, cloud)).toBe("local");
  expect(chooseSaveWinner(richerLocal, cloud)).toMatchObject({
    winner: "local",
    comparison: "local",
  });
});

test("ties, mixed dimensions and different profiles leave cloud in place", () => {
  const cloud = progress({ balance: 100, totalEarned: 200 });
  const tie = progress({ balance: 100, totalEarned: 200 });
  const incomparable = progress({ balance: 150, totalEarned: 150 });
  const anotherProfile = progress({
    profile: { id: "profile-b", username: "player-b", createdAt: 2 },
    balance: 1000,
    totalEarned: 1000,
  });

  expect(chooseSaveWinner(tie, cloud).winner).toBe("cloud");
  expect(compareSaveRichness(incomparable, cloud)).toBe("incomparable");
  expect(chooseSaveWinner(incomparable, cloud).winner).toBe("cloud");
  expect(compareSaveRichness(anotherProfile, cloud)).toBe("incomparable");
  expect(chooseSaveWinner(anotherProfile, cloud).winner).toBe("cloud");
});

test("a later explicit cycle/reset epoch beats stale run-bound progress", () => {
  const olderCloud = progress({
    balance: 9_000_000,
    totalEarned: 9_000_000,
    rebirths: 6,
    ultraRebirths: 3,
    freshStarts: 0,
  });
  const newerLocal = progress({
    balance: 0,
    totalEarned: 0,
    rebirths: 0,
    ultraRebirths: 0,
    freshStarts: 1,
  });

  expect(compareSaveEpoch(newerLocal, olderCloud)).toBe("local");
  expect(compareSaveRichness(newerLocal, olderCloud)).toBe("local");
  expect(chooseSaveWinner(newerLocal, olderCloud).winner).toBe("local");
});

test("a rollback epoch takes precedence over an earlier prestige/rebirth ladder", () => {
  const earlier = progress({ rollbacks: 0, ultraRebirths: 3, rebirths: 6 });
  const laterRollback = progress({
    rollbacks: 1,
    ultraRebirths: 0,
    rebirths: 0,
  });
  expect(compareSaveEpoch(laterRollback, earlier)).toBe("local");
  expect(compareSaveRichness(laterRollback, earlier)).toBe("local");
});

test("an actual fresh-start reducer result is not rolled back by its old cloud era", () => {
  const oldEra = progress({
    ultraRebirths: 3,
    rebirths: 6,
    balance: 50_000,
    totalEarned: 100_000,
    cycleEarnedEP: 30_000_000,
  });
  const freshStart = applyProgress(oldEra, {
    type: "fresh-start",
    at: 500,
    eventId: "fresh-start:1",
  });

  expect(freshStart.freshStarts).toBe(1);
  expect(freshStart.balance).toBe(0);
  expect(compareSaveRichness(freshStart, oldEra)).toBe("local");
});

test("an unowned local save remains eligible for first-sign-in import", () => {
  expect(
    selectLocalSaveForCloudUser({
      userId: "user-a",
      localOwner: "",
      localProgress: localA,
      cachedProgress: null,
      emptyProgress: empty,
    }),
  ).toEqual({ progress: localA, owner: null });
});

test("an account switch uses only that account's cache, never the previous save", () => {
  const selected = selectLocalSaveForCloudUser({
    userId: "user-b",
    localOwner: "user-a",
    localProgress: localA,
    cachedProgress: localB,
    emptyProgress: empty,
  });
  expect(selected).toEqual({ progress: localB, owner: "user-b" });

  const uncached = selectLocalSaveForCloudUser({
    userId: "user-b",
    localOwner: "user-a",
    localProgress: localA,
    cachedProgress: null,
    emptyProgress: empty,
  });
  expect(uncached).toEqual({ progress: empty, owner: null });
});

test("the same account keeps its local save available for dirty recovery", () => {
  expect(
    selectLocalSaveForCloudUser({
      userId: "user-a",
      localOwner: "user-a",
      localProgress: localA,
      cachedProgress: localB,
      emptyProgress: empty,
    }),
  ).toEqual({ progress: localA, owner: "user-a" });
});

test("dirty snapshots remain associated with each account while switching users", () => {
  const storage = memoryStorage();
  markCloudDirty("user-a", storage);
  markCloudDirty("user-b", storage);

  expect(readCloudDirtyOwner(storage)).toBe("user-b");
  expect(isCloudDirty("user-a", storage)).toBe(true);
  expect(isCloudDirty("user-b", storage)).toBe(true);

  clearCloudDirty("user-b", storage);
  expect(isCloudDirty("user-b", storage)).toBe(false);
  expect(isCloudDirty("user-a", storage)).toBe(true);
  clearCloudDirty("user-a", storage);
  expect(isCloudDirty("user-a", storage)).toBe(false);
});

test("a legacy single-owner dirty marker survives the first account switch", () => {
  const storage = memoryStorage();
  storage.setItem("rng-infinite-cloud-dirty-v1", "user-a");
  markCloudDirty("user-b", storage);

  expect(isCloudDirty("user-a", storage)).toBe(true);
  expect(isCloudDirty("user-b", storage)).toBe(true);
});

test("clearing all dirty markers also removes per-account recovery flags", () => {
  const storage = memoryStorage();
  markCloudDirty("user-a", storage);
  markCloudDirty("user-b", storage);
  clearCloudDirty(null, storage);

  expect(readCloudDirtyOwner(storage)).toBe("");
  expect(isCloudDirty("user-a", storage)).toBe(false);
  expect(isCloudDirty("user-b", storage)).toBe(false);
});

test("Firestore payloads use the vault compression and round-trip the whole save", () => {
  const save = {
    ...localA,
    history: [{ id: "old-aura", type: "rngween-aura", at: 123 }],
    rngweenLimited: { skinEarned: true },
  };
  const packed = encodeCloudSave(save);

  expect(packed.startsWith("rngvault1:")).toBe(true);
  expect(decodeCloudSave(packed)).toEqual(save);
});

test("uncompressed legacy save documents remain readable", () => {
  expect(decodeCloudSave(JSON.stringify(localA))).toEqual(localA);
});

test("corrupt Firestore save strings fail closed", () => {
  expect(() => decodeCloudSave("rngvault1:not-valid-gzip")).toThrow(
    "could not be decompressed or read",
  );
});
