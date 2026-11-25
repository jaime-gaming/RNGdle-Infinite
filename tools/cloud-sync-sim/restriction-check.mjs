import assert from "node:assert/strict";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "./fakes/firestore.mjs";

const uid = process.env.FAKE_UID;
assert.ok(uid, "FAKE_UID is required");
const database = { __fake: true };
const saveRef = doc(database, "player_saves", uid);
const beforeSnapshot = await getDoc(saveRef);
assert.ok(
  beforeSnapshot.exists(),
  "restricted Cloud saves must remain readable",
);
const before = beforeSnapshot.data();

await assert.rejects(
  runTransaction(database, (transaction) =>
    transaction.set(saveRef, {
      ...before,
      save_data: `${before.save_data}changed`,
      updated_at: serverTimestamp(),
    }),
  ),
  (error) => error?.code === "permission-denied",
  "restricted Cloud game progress must not be overwritten",
);

const afterSnapshot = await getDoc(saveRef);
assert.equal(afterSnapshot.exists(), true);
assert.equal(afterSnapshot.data().save_data, before.save_data);

await assert.rejects(
  setDoc(doc(database, "cloud_security_status", uid), {
    cloud_access: true,
  }),
  (error) => error?.code === "permission-denied",
  "players must not clear their own server restriction",
);

console.log(
  "Restriction simulation passed: Cloud saves remain readable, game writes are blocked, and clients cannot clear enforcement.",
);
