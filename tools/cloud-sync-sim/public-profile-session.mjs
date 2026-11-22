import { readFileSync, writeFileSync } from "node:fs";
import { emptyProgress } from "../../src/progress.js";
import {
  createCloudProfile,
  reserveCloudProfileName,
  setCloudProfileVisibility,
  writeCloudOwner,
} from "../../src/cloud-save.js";

const [scenario = "healthy", phase = "check"] = process.argv.slice(2);
const UID = process.env.SIM_UID || "uid-player-one";
const stateDir = process.env.SIM_STATE_DIR || "/tmp/rngdle-public-profile";
const storeFile = process.env.FAKE_FIRESTORE || `${stateDir}/firestore.json`;
const storageFile = `${stateDir}/device-A.json`;

let entries = new Map();
try {
  entries = new Map(
    Object.entries(JSON.parse(readFileSync(storageFile, "utf8"))),
  );
} catch {}
const flush = () =>
  writeFileSync(storageFile, JSON.stringify(Object.fromEntries(entries)));
const storage = {
  getItem: (key) => (entries.has(key) ? entries.get(key) : null),
  setItem: (key, value) => {
    entries.set(key, String(value));
    flush();
  },
  removeItem: (key) => {
    entries.delete(key);
    flush();
  },
};
globalThis.localStorage = storage;

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exit(1);
};
const check = (condition, message) => {
  if (!condition) fail(message);
};
const report = (label, value) =>
  console.log(
    `   ${label}: ${typeof value === "object" ? JSON.stringify(value) : value}`,
  );

const store = () => JSON.parse(readFileSync(storeFile, "utf8"));
const saved = (path) => store()[path] ?? null;
const savePath = `player_saves/${UID}`;
const settingsPath = `cloud_profile_settings/${UID}`;
const publicPath = "public_profiles/luckyotter41";
const ownerPath = "public_profile_owners/luckyotter41";

const profile = {
  ...emptyProgress(),
  profile: {
    id: "profile-a1",
    username: "LuckyOtter41",
    createdAt: 1_700_000_000_000,
  },
  balance: 500,
  totalEarned: 500,
};
const enable = () => setCloudProfileVisibility(UID, true);

if (phase === "setup") {
  writeCloudOwner(UID, storage);
  await createCloudProfile(UID, profile);
  check(Boolean(saved(savePath)), "the Cloud profile was created");
  console.log("   OK");
  process.exit(0);
}

if (scenario === "healthy") {
  const result = await enable();
  report("published", result.published);
  check(result.published, "the public profile was not published");
  check(result.enabled, "public sharing did not stay enabled");
  check(saved(publicPath) !== null, "no public summary was written");
  check(saved(ownerPath) !== null, "no owner pointer was written");
  check(
    saved(savePath).public_profile_enabled === true,
    "the save does not advertise public sharing",
  );
  check(
    saved(settingsPath).username_key === "luckyotter41",
    "the settings document does not hold the reserved name",
  );

  const off = await setCloudProfileVisibility(UID, false);
  report("unpublished", off.enabled);
  check(!off.enabled, "public sharing stayed enabled");
  check(saved(publicPath) === null, "the public summary survived unpublishing");
  check(saved(ownerPath) === null, "the owner pointer survived unpublishing");
}

if (scenario === "unreserved") {
  // The account never reserved its name. Publishing must claim it first
  // (ensureCloudProfileSettings / reserveCloudProfileName), never stay silent.
  const result = await enable();
  report("published", {
    published: result.published,
    conflict: result.conflict,
  });
  check(
    result.published,
    "an unreserved name could not be claimed and published",
  );
  check(saved(publicPath) !== null, "the claim did not publish the summary");
  check(
    saved(settingsPath).username_key === "luckyotter41",
    "the settings document is still unreserved",
  );
  check(
    saved("cloud_profile_names/luckyotter41")?.owner_uid === UID,
    "the name claim was not written",
  );

  // A second call has to be idempotent instead of dropping the profile.
  const second = await setCloudProfileVisibility(UID, true);
  report("second enable", second.published);
  check(second.published, "enabling twice broke the published profile");
  check(saved(publicPath) !== null, "enabling twice removed the summary");

  // reserveCloudProfileName on an already-reserved account is a no-op.
  const repaired = await reserveCloudProfileName(UID, profile);
  report("reserved", repaired.reserved);
  check(repaired.reserved, "an already-reserved account lost its reservation");
}

if (scenario === "conflict") {
  let repairError = null;
  try {
    await reserveCloudProfileName(UID, profile);
  } catch (error) {
    repairError = error;
  }
  report("repair message", repairError?.message ?? "none");
  check(
    Boolean(repairError),
    "a name owned by another account must fail loudly",
  );
  check(
    /already reserved/i.test(repairError.message),
    "the conflict message does not explain that the name belongs to another account",
  );
  const result = await enable();
  report("published", result.published);
  check(!result.published, "a conflicting name must never be published");
  check(result.conflict, "the conflict was not reported");
  check(
    saved(savePath).public_profile_enabled !== true,
    "a conflicting name left public sharing enabled",
  );
  check(
    saved(publicPath) === null,
    "a conflicting name wrote a public summary",
  );
}

console.log("   OK");
