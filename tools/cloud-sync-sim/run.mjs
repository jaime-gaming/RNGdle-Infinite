import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const UID = "uid-player-one";
const stateDir = mkdtempSync(path.join(tmpdir(), "rngdle-cloud-sim-"));
const storeFile = path.join(stateDir, "firestore.json");
const registerPath = new URL("./register.mjs", import.meta.url).pathname;
const sessionPath = new URL("./session.mjs", import.meta.url).pathname;
const projectRoot = new URL("../../", import.meta.url).pathname;

const plan = [
  ["A", "first-sync"],
  ["B", "adopt"],
  ["B", "play-more"],
  ["A", "resync"],
  ["A", "publish"],
  ["A", "roundtrip"],
  ["A", "keep-playing"],
  ["A", "unpublish"],
  ["A", "repair-orphan"],
  ["A", "unpublish"],
  ["C", "conflict-profile"],
  ["B", "cloud-state"],
];

console.log(`Cloud sync simulation (device state in ${stateDir})\n`);
for (let [device, step] of plan) {
  console.log(`### device ${device} · ${step}`);
  if (step === "repair-orphan") {
    const store = JSON.parse(readFileSync(storeFile, "utf8"));
    store["public_profiles/luckyotter"] = {
      username: "luckyotter",
      username_key: "luckyotter",
      record: {},
    };
    writeFileSync(storeFile, JSON.stringify(store));
    step = "publish";
  }
  const result = spawnSync(
    process.execPath,
    ["--import", registerPath, sessionPath, device, step],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        SIM_UID: UID,
        SIM_STATE_DIR: stateDir,
        FAKE_FIRESTORE: storeFile,
        FAKE_UID: UID,
      },
    },
  );
  if (result.status !== 0) {
    console.error(`\nCloud sync simulation FAILED at ${device} · ${step}.`);
    process.exit(1);
  }
  console.log("");
}

const store = JSON.parse(readFileSync(storeFile, "utf8"));
const problems = [];
const doc = (path) => store[path] ?? null;

const save = doc(`player_saves/${UID}`);
if (!save) problems.push("player_saves document is missing");
else {
  if (typeof save.save_data !== "string" || !save.save_data.length)
    problems.push("save_data is empty");
  if (save.save_data.length > 900000) problems.push("save_data exceeds 900 KB");
  if (!("updated_at" in save)) problems.push("save has no updated_at");
  if (typeof save.public_profile_enabled !== "boolean")
    problems.push("save has no consent bit");
}

const settings = doc(`cloud_profile_settings/${UID}`);
const claim = doc(`cloud_profile_names/luckyotter`);
if (!settings) problems.push("cloud_profile_settings is missing");
if (!claim) problems.push("the name claim is missing");
if (settings && claim && settings.profile_id !== claim.profile_id)
  problems.push("settings and claim describe different game profiles");
if (settings && save && save.public_profile_id !== null) {
  if (settings.username_key !== save.public_profile_id)
    problems.push("the save advertises a name the settings do not hold");
}

const owner = doc("public_profile_owners/luckyotter");
const published = doc("public_profiles/luckyotter");
if (save?.public_profile_enabled === false && (owner || published))
  problems.push("public artifacts survived unpublishing");
if (save?.public_profile_enabled === false && owner)
  problems.push("owner pointer survived unpublishing");

if (owner && owner.profile_id !== "luckyotter")
  problems.push("the owner pointer is not keyed by the public name");

const limits = doc(`cloud_save_write_limits/${UID}`);
if (!limits) problems.push("the write-limit document is missing");

console.log("Final state");
console.log(
  `   save: ${save ? `${save.save_data.length} chars, consent ${save.public_profile_enabled}` : "missing"}`,
);
console.log(
  `   settings: ${settings ? `${settings.username_key} → ${settings.profile_id}` : "missing"}`,
);
console.log(`   claim: ${claim ? claim.profile_id : "missing"}`);
console.log(`   write limit: ${limits ? "present" : "missing"}`);

if (problems.length) {
  console.error("\nCloud sync simulation FAILED:");
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

rmSync(stateDir, { recursive: true, force: true });
console.log(
  "\nCloud sync simulation passed: upload, second device, both-way sync, publish, unpublish, conflict.",
);
