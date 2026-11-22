/**
 * Focused harness for the public-profile enable path.
 *
 * The fake Firestore (tools/cloud-sync-sim/fakes/firestore.mjs) re-checks every
 * staged write against the real firestore.rules logic, so a passing run here
 * means the production transaction + rules combination really publishes.
 *
 * Scenarios (each runs a "setup" process, a store mutation, then a "check"
 * process, because the fake Firestore keeps the store in memory):
 *   1. healthy    - public sharing can be turned on and off again;
 *   2. unreserved - an account whose name was never reserved (the "no error,
 *                   nothing happens" bug) is repaired before publishing;
 *   3. conflict   - a name another account already owns stays private and is
 *                   reported instead of failing silently.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.chdir(new URL("../../", import.meta.url).pathname);
const registerPath = new URL("./register.mjs", import.meta.url).pathname;
const sessionPath = new URL("./public-profile-session.mjs", import.meta.url)
  .pathname;
const stateDir = mkdtempSync(path.join(tmpdir(), "rngdle-public-profile-"));
const storeFile = path.join(stateDir, "firestore.json");
const UID = "uid-player-one";
const settingsPath = `cloud_profile_settings/${UID}`;
const claimPath = "cloud_profile_names/luckyotter41";

const scenarios = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["healthy", "unreserved", "conflict"];

function run(scenario, phase) {
  return spawnSync(
    process.execPath,
    ["--import", registerPath, sessionPath, scenario, phase],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SIM_UID: UID,
        SIM_STATE_DIR: stateDir,
        FAKE_FIRESTORE: storeFile,
        FAKE_UID: UID,
      },
    },
  ).status;
}

function editStore(mutate) {
  const store = JSON.parse(readFileSync(storeFile, "utf8"));
  mutate(store);
  writeFileSync(storeFile, JSON.stringify(store, null, 1));
}

let failed = false;
for (const scenario of scenarios) {
  writeFileSync(storeFile, "{}");
  console.log(`### ${scenario}`);
  let status = run(scenario, "setup");
  if (status === 0) {
    if (scenario === "unreserved")
      editStore((store) => {
        store[settingsPath] = {
          ...store[settingsPath],
          username_key: null,
          username_changed_at: null,
        };
      });
    if (scenario === "conflict")
      editStore((store) => {
        store[settingsPath] = {
          ...store[settingsPath],
          username_key: null,
          username_changed_at: null,
        };
        store[claimPath] = {
          owner_uid: "uid-someone-else",
          profile_id: "other-profile",
        };
      });
    status = run(scenario, "check");
  }
  if (status !== 0) {
    failed = true;
    console.error(`FAILED scenario: ${scenario}`);
  }
}

if (failed) process.exit(1);
rmSync(stateDir, { recursive: true, force: true });
console.log("\nPublic profile simulation passed.");
