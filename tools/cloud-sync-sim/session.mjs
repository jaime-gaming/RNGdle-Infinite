// One app session on one simulated device, against a shared fake Firestore.
//
//   node --import ./tools/cloud-sync-sim/register.mjs \
//        tools/cloud-sync-sim/session.mjs <device> <step>
//
// Each step mirrors what src/use-progress.js and src/components/CloudAccount.jsx
// do at that moment of a real session, so the Cloud Accounts engine is exercised
// end to end without Firebase. Exits non-zero when an expectation fails.
import { readFileSync, writeFileSync } from "node:fs";
import { emptyProgress, PROGRESS_KEY } from "../../src/progress.js";
import {
  readCloudOwner,
  readCloudSave,
  reconcileCloudSave,
  selectLocalSaveForCloudUser,
  setCloudProfileVisibility,
  writeCloudOwner,
} from "../../src/cloud-save.js";

const [deviceName = "A", step = "status"] = process.argv.slice(2);
const UID = process.env.SIM_UID || "uid-player-one";
const stateDir = process.env.SIM_STATE_DIR || "/tmp/rngdle-cloud-sim";
const storageFile = `${stateDir}/device-${deviceName}.json`;

// --- localStorage stand-in: one file per device -----------------------------
let entries = new Map();
try {
  entries = new Map(
    Object.entries(JSON.parse(readFileSync(storageFile, "utf8"))),
  );
} catch {
  // A new device starts with empty storage.
}
const persist = () =>
  writeFileSync(storageFile, JSON.stringify(Object.fromEntries(entries)));
const storage = {
  getItem: (key) => (entries.has(key) ? entries.get(key) : null),
  setItem: (key, value) => {
    entries.set(key, String(value));
    persist();
  },
  removeItem: (key) => {
    entries.delete(key);
    persist();
  },
};
globalThis.localStorage = storage;

// --- helpers ---------------------------------------------------------------
const report = (label, value) => console.log(`   ${label}: ${value}`);
function fail(message) {
  console.error(`   FAIL ${message}`);
  process.exit(1);
}
const readLocal = () => {
  const raw = storage.getItem(PROGRESS_KEY);
  return raw ? JSON.parse(raw) : emptyProgress();
};
const writeLocal = (progress) =>
  storage.setItem(PROGRESS_KEY, JSON.stringify(progress));

function rollEntry(index, number) {
  return {
    id: `roll-${index}`,
    type: "roll",
    at: 1700000000000 + index * 1000,
    number,
    ep: 10,
    tier: "common",
    badges: [],
  };
}

function progressWith({ id, username, earned, balance, rolls }) {
  const progress = {
    ...emptyProgress(),
    profile: { id, username, createdAt: 1700000000000 },
    totalEarned: earned,
    balance,
  };
  progress.discovered = ["101", "202", "303"].slice(0, Math.max(rolls, 1));
  progress.history = Array.from({ length: rolls }, (_, index) =>
    rollEntry(index, 100 + index),
  );
  return progress;
}

// The exact flow of restoreCloudSave() in src/use-progress.js.
async function appSession(fallbackProgress) {
  const localOwner = readCloudOwner(storage);
  const localProgress = readLocal().profile
    ? readLocal()
    : (fallbackProgress ?? emptyProgress());
  const selection = selectLocalSaveForCloudUser({
    userId: UID,
    localOwner,
    localProgress,
    cachedProgress: null,
    emptyProgress: emptyProgress(),
  });
  const result = await reconcileCloudSave(UID, selection.progress, {
    allowLocal: true,
    localOwner: selection.owner,
    storage,
  });
  if (result.choiceRequired) return { result, choice: true };
  if (result.progress?.profile) {
    writeLocal(result.progress);
    writeCloudOwner(UID, storage);
  }
  return { result, choice: false };
}

// ---------------------------------------------------------------------- steps
const steps = {
  async "first-sync"() {
    // A signed-in account whose local save has never been uploaded.
    const progress = progressWith({
      id: "profile-a1",
      username: "luckyotter",
      earned: 500,
      balance: 120,
      rolls: 3,
    });
    writeLocal(progress);
    const { result } = await appSession(progress);
    report("winner", result.winner);
    report("uploaded", result.uploaded);
    if (!result.uploaded) fail("the first sync did not upload the save");
  },

  async adopt() {
    // A fresh second device: nothing local, the account already has a save.
    const { result, choice } = await appSession(emptyProgress());
    if (choice) fail("a fresh device asked the player to choose");
    report("winner", result.winner);
    report("profile", result.progress?.profile?.username ?? "none");
    report("earned", result.progress?.totalEarned ?? 0);
    if (result.progress?.profile?.id !== "profile-a1")
      fail("the second device did not adopt the online save");
  },

  async "play-more"() {
    // Keep playing, then let the debounced cloud save run.
    const local = readLocal();
    const next = {
      ...local,
      totalEarned: 900,
      balance: 340,
      history: [...local.history, rollEntry(99, 404)],
    };
    writeLocal(next);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const { result } = await appSession(next);
    report("winner", result.winner);
    report("uploaded", result.uploaded);
    if (!result.uploaded) fail("further progress was not uploaded");
  },

  async resync() {
    // The other device syncs again holding its older copy.
    const local = readLocal();
    report("earned before", local.totalEarned);
    const { result, choice } = await appSession(local);
    if (choice) fail("same-profile sync asked the player to choose");
    report("winner", result.winner);
    report("uploaded", result.uploaded);
    report("earned after", result.progress?.totalEarned ?? 0);
    if (result.uploaded && (result.progress?.totalEarned ?? 0) < 900)
      fail("the stale device overwrote newer online progress");
    if ((result.progress?.totalEarned ?? 0) < 900)
      fail("the stale device did not pick up the newer progress");
  },

  async publish() {
    const result = await setCloudProfileVisibility(UID, true);
    report("published", result.published);
    report("enabled", result.enabled);
    if (!result.published) fail("the public profile was not published");
  },

  async unpublish() {
    const result = await setCloudProfileVisibility(UID, false);
    report("enabled", result.enabled);
    const remote = await readCloudSave(UID);
    report("consent in save", remote?.save_data?.profile ? "off" : "missing");
    if (result.enabled) fail("public sharing stayed enabled");
  },

  async roundtrip() {
    const local = readLocal();
    const remote = await readCloudSave(UID);
    const cloud = remote?.save_data;
    const identical = JSON.stringify(cloud) === JSON.stringify(local);
    report(
      "earned",
      `${cloud?.totalEarned ?? 0} online / ${local.totalEarned} local`,
    );
    report(
      "history",
      `${cloud?.history?.length ?? 0} online / ${local.history.length} local`,
    );
    report("identical", identical);
    if (!identical) fail("the online copy differs from the device copy");
  },

  async "keep-playing"() {
    const local = readLocal();
    const next = {
      ...local,
      totalEarned: local.totalEarned + 25,
      balance: local.balance + 5,
    };
    writeLocal(next);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const { result, choice } = await appSession(next);
    report("winner", result?.winner ?? "none");
    report("uploaded", result?.uploaded ?? false);
    if (choice || !result?.uploaded)
      fail("a routine save after publishing did not upload");
  },

  async "conflict-profile"() {
    // This account signed in here before and kept a different profile's copy.
    const other = progressWith({
      id: "profile-other",
      username: "guesthero",
      earned: 1200,
      balance: 900,
      rolls: 6,
    });
    writeLocal(other);
    writeCloudOwner(UID, storage);
    const { result, choice } = await appSession(other);
    report("choice required", Boolean(choice));
    if (!choice) fail("two different profiles with progress never asked");
    report("notice", JSON.stringify(result.notice ?? "").slice(0, 120));
  },

  async "cloud-state"() {
    const remote = await readCloudSave(UID);
    report("profile", remote?.save_data?.profile?.id ?? "none");
    report("earned", remote?.save_data?.totalEarned ?? 0);
    report("history", remote?.save_data?.history?.length ?? 0);
  },

  async status() {
    const local = readLocal();
    report("profile", local.profile?.id ?? "none");
    report("earned", local.totalEarned);
  },
};

if (!steps[step]) {
  console.error(`Unknown step "${step}".`);
  process.exit(2);
}
await steps[step]();
