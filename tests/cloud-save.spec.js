import { expect, test } from "./helpers/clock.js";
import {
  chooseSaveWinner,
  clearCloudDirty,
  cloudConflictVersionChanged,
  compareSaveEpoch,
  compareSaveRichness,
  decodeCloudSave,
  encodeCloudSave,
  isCloudDirty,
  markCloudDirty,
  readCloudDirtyOwner,
  selectLocalSaveForCloudUser,
  summarizeSaveProgress,
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

test("ties and mixed same-generation progress require a player choice", () => {
  const cloud = progress({ balance: 100, totalEarned: 200 });
  const tie = progress({
    profile: { id: "profile-a", username: "another-name", createdAt: 1 },
    balance: 100,
    totalEarned: 200,
  });
  const incomparable = progress({ balance: 150, totalEarned: 150 });
  const anotherProfile = progress({
    profile: { id: "profile-b", username: "player-b", createdAt: 2 },
    balance: 1000,
    totalEarned: 1000,
  });

  expect(chooseSaveWinner(tie, cloud)).toMatchObject({
    winner: "choice",
    choiceReason: "tie",
  });
  expect(compareSaveRichness(incomparable, cloud)).toBe("incomparable");
  expect(chooseSaveWinner(incomparable, cloud)).toMatchObject({
    winner: "choice",
    choiceReason: "incomparable",
  });
  expect(compareSaveRichness(anotherProfile, cloud)).toBe("incomparable");
  expect(chooseSaveWinner(anotherProfile, cloud)).toMatchObject({
    winner: "choice",
    choiceReason: "profile",
  });
  expect(
    chooseSaveWinner(anotherProfile, cloud, { decision: "local" }),
  ).toMatchObject({ winner: "local", selectedByUser: true });
  expect(
    chooseSaveWinner(anotherProfile, cloud, { decision: "cloud" }),
  ).toMatchObject({ winner: "cloud", selectedByUser: true });
});

test("a player can explicitly keep either save in a same-generation conflict", () => {
  const cloud = progress({ balance: 100, totalEarned: 200 });
  const incomparable = progress({ balance: 150, totalEarned: 150 });

  expect(
    chooseSaveWinner(incomparable, cloud, { decision: "local" }),
  ).toMatchObject({
    winner: "local",
    selectedByUser: true,
  });
  expect(
    chooseSaveWinner(incomparable, cloud, { decision: "cloud" }),
  ).toMatchObject({
    winner: "cloud",
    selectedByUser: true,
  });
});

test("a conflict choice is rejected when either compared save has changed", () => {
  const expected = {
    expectedCloudExists: true,
    expectedCloudSaveData: "cloud-v1",
    expectedLocalSource: "local-v1",
  };

  expect(
    cloudConflictVersionChanged({
      ...expected,
      cloudExists: true,
      cloudSaveData: "cloud-v1",
      localSource: "local-v1",
    }),
  ).toBe(false);
  expect(
    cloudConflictVersionChanged({
      ...expected,
      cloudExists: true,
      cloudSaveData: "cloud-v1",
      localSource: "local-v2",
    }),
  ).toBe(true);
  expect(
    cloudConflictVersionChanged({
      ...expected,
      cloudExists: true,
      cloudSaveData: "cloud-v2",
      localSource: "local-v1",
    }),
  ).toBe(true);
  expect(
    cloudConflictVersionChanged({
      ...expected,
      cloudExists: false,
      cloudSaveData: null,
      localSource: "local-v1",
    }),
  ).toBe(true);
});

test("settings and log volume do not count as game progress", () => {
  const cloud = progress();
  const local = progress({
    profile: { ...cloud.profile, avatar: "avatar-mark" },
    cooldownUntil: 600_000,
    receiptFloor: 500_000,
    history: Array.from({ length: 40 }, (_, index) => ({
      id: `note-${index}`,
      type: "note",
      at: index + 1,
    })),
    events: { rngween: { at: 10 } },
    bookmarks: ["roll-1"],
    loadouts: [{ id: "saved-rack", skills: [] }],
  });

  expect(compareSaveRichness(local, cloud)).toBe("equal");
  expect(chooseSaveWinner(local, cloud)).toMatchObject({
    winner: "choice",
    choiceReason: "tie",
  });
});

test("the comparison summary reports durable progress rather than save size", () => {
  const saved = progress({
    balance: 500,
    totalEarned: 12_000,
    cycleEarnedEP: 2_500,
    rebirths: 4,
    ultraRebirths: 1,
    rollbacks: 2,
    freshStarts: 1,
    surplusBanked: 5,
    owned: ["quickwind-1", "clockwork-1"],
    skills: ["lucky-charm"],
    pets: ["cat"],
    history: [{ id: "roll-a", type: "roll", ep: 8_000, at: 2 }],
  });
  expect(summarizeSaveProgress(saved)).toMatchObject({
    balance: 500,
    totalEarned: 12_000,
    cycleEarnedEP: 2_500,
    rebirths: 4,
    prestiges: 1,
    rollbacks: 2,
    freshStarts: 1,
    surplusBanked: 5,
    rolls: 1,
    bestRollEP: 8_000,
    upgrades: 2,
    skills: 1,
    companions: 1,
  });
});

test("a later reset generation requires a choice instead of winning by itself", () => {
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
  expect(chooseSaveWinner(newerLocal, olderCloud)).toMatchObject({
    winner: "choice",
    choiceReason: "generation",
  });
  expect(
    chooseSaveWinner(newerLocal, olderCloud, { decision: "local" }),
  ).toMatchObject({ winner: "local", selectedByUser: true });
  expect(
    chooseSaveWinner(newerLocal, olderCloud, { decision: "cloud" }),
  ).toMatchObject({ winner: "cloud", selectedByUser: true });
});

test("rebirth progress is compared inside a later prestige generation", () => {
  const prestigeOnly = progress({ ultraRebirths: 1, rebirths: 0 });
  const rebirthAndPrestige = progress({ ultraRebirths: 1, rebirths: 4 });

  expect(compareSaveEpoch(rebirthAndPrestige, prestigeOnly)).toBe("local");
  expect(chooseSaveWinner(rebirthAndPrestige, prestigeOnly)).toMatchObject({
    winner: "choice",
    choiceReason: "generation",
  });
});

test("a rollback generation also requires an explicit choice", () => {
  const earlier = progress({ rollbacks: 0, ultraRebirths: 3, rebirths: 6 });
  const laterRollback = progress({
    rollbacks: 1,
    ultraRebirths: 0,
    rebirths: 0,
  });
  expect(compareSaveEpoch(laterRollback, earlier)).toBe("local");
  expect(chooseSaveWinner(laterRollback, earlier)).toMatchObject({
    winner: "choice",
    choiceReason: "generation",
  });
});

test("an actual fresh-start result triggers a choice against its older cloud era", () => {
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
  expect(compareSaveEpoch(freshStart, oldEra)).toBe("local");
  expect(compareSaveRichness(freshStart, oldEra)).toBe("incomparable");
  expect(chooseSaveWinner(freshStart, oldEra)).toMatchObject({
    winner: "choice",
    choiceReason: "generation",
  });
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
    "could not be opened",
  );
});
