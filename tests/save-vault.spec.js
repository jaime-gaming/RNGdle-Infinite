import { test, expect } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import {
  CLOUD_RECOVERY_KEY,
  MAX_SAVE_OUTPUT_BYTES,
  MAX_SAVE_HISTORY_AGE_MS,
  MAX_SAVE_HISTORY_ENTRIES,
  PRE_REPAIR_OWNER_KEY,
  SAVE_HISTORY_KEY,
  SAVE_VAULT_KEY,
  SAVE_VAULT_TAG,
  archiveSavedCopy,
  clearCloudRecovery,
  clearLocalSaveRecovery,
  clearVault,
  getRecoveryCopies,
  isReadableSave,
  packVaultSave,
  readCloudRecovery,
  readSavedCopyHistory,
  readVault,
  restoreVaultIfNeeded,
  unpackVaultSave,
  writeCloudRecovery,
  writePreRepairOwner,
  writeVault,
} from "../src/save-vault.js";
import {
  UNKNOWN_CLOUD_OWNER,
  markCloudUserDeleted,
  readCloudOwner,
} from "../src/save-owner.js";
import {
  emptyProgress,
  PRE_REPAIR_BACKUP_KEY,
  PROGRESS_KEY,
} from "../src/progress.js";

// A plain in-memory storage with the three methods the vault uses.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const save = (balance = 42, profileId = "p1") =>
  JSON.stringify({ ...emptyProgress(), balance, profile: { id: profileId } });

test("the backup copy is compressed, exact and about twenty times smaller", () => {
  const raw = save(987654);
  const packed = packVaultSave(raw);
  expect(packed.startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(packed.length).toBeLessThan(raw.length);
  expect(unpackVaultSave(packed)).toBe(raw);
  // A save too small to gain from gzip is still kept, and anything unreadable
  // is refused rather than stored.
  expect(unpackVaultSave(packVaultSave("{}"))).toBe("{}");
  expect(packVaultSave("")).toBe("");
  expect(isReadableSave("")).toBe(false);
  expect(isReadableSave("<html>")).toBe(false);
  expect(isReadableSave("[]")).toBe(false);
  expect(isReadableSave(raw)).toBe(true);
});

test("vault decompression refuses a gzip bomb beyond the save-size ceiling", () => {
  const bomb = packVaultSave("x".repeat(MAX_SAVE_OUTPUT_BYTES + 1));
  expect(bomb.startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(unpackVaultSave(bomb)).toBe("");
});

test("the vault keeps the newest good save and never rewrites it more than once a minute", () => {
  const local = fakeStorage();
  expect(writeVault(save(1), { storage: local, now: 1000 })).toBe(true);
  const first = readVault(local);
  expect(first.raw).toBe(save(1));
  expect(first.profileId).toBe("p1");
  expect(first.at).toBe(1000);
  // Inside the gap nothing is rewritten...
  expect(writeVault(save(2), { storage: local, now: 2000 })).toBe(false);
  expect(readVault(local).raw).toBe(save(1));
  // ...and after it the newer save takes over.
  expect(writeVault(save(3), { storage: local, now: 90_000 })).toBe(true);
  expect(readVault(local).raw).toBe(save(3));
  // Garbage never becomes a backup.
  expect(writeVault("not a save", { storage: local, now: 200_000 })).toBe(
    false,
  );
  expect(readVault(local).raw).toBe(save(3));
});

test("the local archive keeps daily snapshots within a 20-copy, 90-day window", () => {
  const local = fakeStorage();
  const now = Date.now();
  const first = save(101);
  const second = save(202);
  expect(
    archiveSavedCopy(first, { storage: local, now, source: "manual" }),
  ).toBe(true);
  expect(
    archiveSavedCopy(first, {
      storage: local,
      now: now + 1_000,
      source: "manual",
    }),
  ).toBe(true);
  expect(readSavedCopyHistory(local).copies).toHaveLength(1);

  for (let index = 0; index < MAX_SAVE_HISTORY_ENTRIES + 3; index++) {
    expect(
      archiveSavedCopy(save(index + 10), {
        storage: local,
        now: now + 10_000 + index,
        source: "manual",
      }),
    ).toBe(true);
  }
  expect(readSavedCopyHistory(local).copies).toHaveLength(
    MAX_SAVE_HISTORY_ENTRIES,
  );
  expect(local.map.has(SAVE_HISTORY_KEY)).toBe(true);

  const old = fakeStorage();
  archiveSavedCopy(first, { storage: old, now: 10_000, source: "manual" });
  expect(
    readSavedCopyHistory(old, { now: 10_000 + MAX_SAVE_HISTORY_AGE_MS + 1 })
      .copies,
  ).toEqual([]);
  // Listing recovery copies also prunes expired entries from local storage.
  getRecoveryCopies(old);
  expect(old.map.has(SAVE_HISTORY_KEY)).toBe(false);

  const daily = fakeStorage();
  const dailyAt = Date.now();
  writeVault(first, { storage: daily, now: dailyAt });
  writeVault(second, {
    storage: daily,
    now: dailyAt + 24 * 60 * 60 * 1000 + 1,
  });
  expect(readSavedCopyHistory(daily).copies[0]).toMatchObject({
    raw: first,
    source: "daily",
    reason: "Daily automatic save snapshot",
  });
});

test("a replaced cloud-conflict copy is archived before its recovery slot changes", () => {
  const local = fakeStorage();
  const now = Date.now();
  const first = save(101);
  const second = save(202);
  expect(
    writeCloudRecovery(first, { storage: local, now, ownerId: "uid-a" }),
  ).toBe(true);
  expect(
    writeCloudRecovery(second, {
      storage: local,
      now: now + 1_000,
      ownerId: "uid-a",
    }),
  ).toBe(true);
  expect(readCloudRecovery(local).raw).toBe(second);
  expect(readSavedCopyHistory(local).copies[0]).toMatchObject({
    raw: first,
    source: "conflict",
    reason: "Earlier cloud conflict copy",
    ownerId: "uid-a",
  });
});

test("corrupt local copies are listed as damaged but contain no restorable save", () => {
  const now = Date.now();
  const local = fakeStorage({
    [SAVE_VAULT_KEY]: JSON.stringify({ at: now, raw: "not a save" }),
    [SAVE_HISTORY_KEY]: JSON.stringify({
      version: 1,
      copies: [
        {
          id: "broken",
          at: now,
          raw: packVaultSave("not json"),
          owner: { kind: "local" },
        },
      ],
    }),
  });
  const copies = getRecoveryCopies(local);
  expect(copies).toHaveLength(2);
  expect(copies.every((copy) => copy.corrupt && !copy.valid && !copy.raw)).toBe(
    true,
  );
});

test("a legacy copy without owner metadata stays unverified in the archive", () => {
  const local = fakeStorage();
  expect(
    archiveSavedCopy(save(333, "legacy-profile"), {
      storage: local,
      ownerId: undefined,
      source: "pre-repair",
    }),
  ).toBe(true);
  const [copy] = getRecoveryCopies(local);
  expect(copy.ownerId).toBe(UNKNOWN_CLOUD_OWNER);
});

test("account deletion removes only that UID's archived local copies", () => {
  const local = fakeStorage();
  const now = Date.now();
  const accountA = save(100, "profile-a");
  const accountB = save(200, "profile-b");
  expect(
    archiveSavedCopy(accountA, {
      storage: local,
      now,
      ownerId: "uid-a",
      source: "conflict",
    }),
  ).toBe(true);
  expect(
    archiveSavedCopy(accountB, {
      storage: local,
      now: now + 1,
      ownerId: "uid-b",
      source: "conflict",
    }),
  ).toBe(true);

  expect(clearLocalSaveRecovery(local, null, "uid-a")).toBe(true);
  expect(readSavedCopyHistory(local).copies).toMatchObject([
    { raw: accountB, ownerId: "uid-b" },
  ]);
});

test("a cloud-conflict recovery copy survives rolling local-vault writes", () => {
  const local = fakeStorage();
  const displaced = save(765432);
  expect(
    writeCloudRecovery(displaced, {
      storage: local,
      now: 12_345,
      reason: "Cloud version kept on a tie.",
    }),
  ).toBe(true);

  const recovery = readCloudRecovery(local);
  expect(recovery).toMatchObject({
    at: 12_345,
    profileId: "p1",
    reason: "Cloud version kept on a tie.",
    raw: displaced,
  });
  expect(local.map.has(CLOUD_RECOVERY_KEY)).toBe(true);

  // Reconciliation then writes the chosen save to the ordinary rolling vault.
  writeVault(save(123), { storage: local, now: 90_000, minGapMs: 0 });
  expect(readVault(local).raw).toBe(save(123));
  expect(readCloudRecovery(local).raw).toBe(displaced);

  clearCloudRecovery(local);
  expect(readCloudRecovery(local)).toBeNull();
});

test("a broken or missing save comes back from the vault, a healthy one is left alone", () => {
  const local = fakeStorage();
  writeVault(save(777), { storage: local, now: 5000 });

  // Missing save: the backup is put back.
  expect(restoreVaultIfNeeded({ storage: local })).toMatchObject({
    restored: true,
  });
  expect(JSON.parse(local.map.get(PROGRESS_KEY)).balance).toBe(777);

  // Half-written save: same.
  const broken = fakeStorage({ [PROGRESS_KEY]: '{"balance": 12' });
  writeVault(save(888), { storage: broken, now: 6000 });
  expect(restoreVaultIfNeeded({ storage: broken }).restored).toBe(true);
  expect(JSON.parse(broken.map.get(PROGRESS_KEY)).balance).toBe(888);

  // Healthy save: never replaced, even when the vault is older.
  const healthy = fakeStorage({ [PROGRESS_KEY]: save(1) });
  writeVault(save(2), { storage: healthy, now: 7000 });
  expect(restoreVaultIfNeeded({ storage: healthy })).toEqual({
    restored: false,
  });
  expect(JSON.parse(healthy.map.get(PROGRESS_KEY)).balance).toBe(1);

  // No vault at all: nothing is invented.
  expect(restoreVaultIfNeeded({ storage: fakeStorage() })).toEqual({
    restored: false,
  });

  // A deleted account clears the vault, so it cannot come back from the dead.
  clearVault(healthy);
  expect(readVault(healthy)).toBeNull();
  expect(restoreVaultIfNeeded({ storage: healthy }).restored).toBe(false);
});

test("vault recovery keeps its owning UID and never restores a deleted account", () => {
  const local = fakeStorage();
  writeVault(save(123, "profile-a"), {
    storage: local,
    now: 7000,
    ownerId: "uid-a",
  });
  expect(restoreVaultIfNeeded({ storage: local }).restored).toBe(true);
  expect(readCloudOwner(local)).toBe("uid-a");

  const deleted = fakeStorage();
  writeVault(save(456, "profile-b"), {
    storage: deleted,
    now: 8000,
    ownerId: "uid-b",
  });
  expect(markCloudUserDeleted("uid-b", deleted)).toBe(true);
  expect(restoreVaultIfNeeded({ storage: deleted })).toMatchObject({
    restored: false,
    deletedAccount: true,
  });
  expect(deleted.map.has(PROGRESS_KEY)).toBe(false);
});

test("legacy vault recovery is marked unverified instead of becoming an import", () => {
  const local = fakeStorage();
  writeVault(save(321), { storage: local, now: 9000 });
  const envelope = JSON.parse(local.map.get(SAVE_VAULT_KEY));
  delete envelope.owner;
  local.map.set(SAVE_VAULT_KEY, JSON.stringify(envelope));

  expect(restoreVaultIfNeeded({ storage: local }).restored).toBe(true);
  expect(readCloudOwner(local)).toBe(UNKNOWN_CLOUD_OWNER);
});

test("account deletion clears recovery copies by UID even when profile IDs differ", () => {
  const local = fakeStorage({
    [PRE_REPAIR_BACKUP_KEY]: save(999, "profile-old"),
  });
  writePreRepairOwner("uid-a", local);
  writeVault(save(777, "profile-vault"), {
    storage: local,
    now: 5000,
    ownerId: "uid-a",
  });
  writeCloudRecovery(save(555, "profile-displaced"), {
    storage: local,
    now: 6000,
    ownerId: "uid-a",
  });

  expect(clearLocalSaveRecovery(local, null, "uid-a")).toBe(true);
  expect(local.map.has(PRE_REPAIR_BACKUP_KEY)).toBe(false);
  expect(local.map.has(PRE_REPAIR_OWNER_KEY)).toBe(false);
  expect(readVault(local)).toBeNull();
  expect(readCloudRecovery(local)).toBeNull();

  const anotherAccount = fakeStorage({
    [PRE_REPAIR_BACKUP_KEY]: save(888, "profile-a"),
  });
  writePreRepairOwner("uid-b", anotherAccount);
  writeVault(save(777, "profile-b"), {
    storage: anotherAccount,
    now: 5000,
    ownerId: "uid-b",
  });
  writeCloudRecovery(save(555, "profile-c"), {
    storage: anotherAccount,
    now: 6000,
    ownerId: "uid-b",
  });
  expect(clearLocalSaveRecovery(anotherAccount, null, "uid-a")).toBe(true);
  expect(readVault(anotherAccount).ownerId).toBe("uid-b");
  expect(readCloudRecovery(anotherAccount).ownerId).toBe("uid-b");
  expect(anotherAccount.map.has(PRE_REPAIR_BACKUP_KEY)).toBe(true);
});

test("account deletion reports an unverifiable legacy recovery with another profile ID", () => {
  const local = fakeStorage();
  writeCloudRecovery(save(555, "different-profile"), {
    storage: local,
    now: 6000,
  });
  const envelope = JSON.parse(local.map.get(CLOUD_RECOVERY_KEY));
  delete envelope.owner;
  local.map.set(CLOUD_RECOVERY_KEY, JSON.stringify(envelope));

  expect(clearLocalSaveRecovery(local, null, "uid-a")).toBe(false);
  expect(readCloudRecovery(local).profileId).toBe("different-profile");
});

test("account deletion clears pre-repair, vault, and cloud recovery copies", () => {
  const local = fakeStorage({ [PRE_REPAIR_BACKUP_KEY]: save(999) });
  writeVault(save(777), { storage: local, now: 5000 });
  writeCloudRecovery(save(555), { storage: local, now: 6000 });

  expect(clearLocalSaveRecovery(local, "p1")).toBe(true);
  expect(local.map.has(PRE_REPAIR_BACKUP_KEY)).toBe(false);
  expect(readVault(local)).toBeNull();
  expect(readCloudRecovery(local)).toBeNull();

  const otherProfile = fakeStorage({
    [PRE_REPAIR_BACKUP_KEY]: save(999, "p2"),
  });
  writeVault(save(777, "p2"), { storage: otherProfile, now: 5000 });
  writeCloudRecovery(save(555, "p2"), { storage: otherProfile, now: 6000 });
  expect(clearLocalSaveRecovery(otherProfile, "p1")).toBe(true);
  expect(readVault(otherProfile).profileId).toBe("p2");
  expect(readCloudRecovery(otherProfile).profileId).toBe("p2");
  expect(otherProfile.map.has(PRE_REPAIR_BACKUP_KEY)).toBe(true);

  const unclassified = fakeStorage({ [PRE_REPAIR_BACKUP_KEY]: "not-json" });
  expect(clearLocalSaveRecovery(unclassified, "p1")).toBe(false);
  expect(unclassified.map.has(PRE_REPAIR_BACKUP_KEY)).toBe(true);

  const blocked = fakeStorage({ [PRE_REPAIR_BACKUP_KEY]: save(123) });
  writeVault(save(456), { storage: blocked, now: 7000 });
  writeCloudRecovery(save(789), { storage: blocked, now: 8000 });
  const removeItem = blocked.removeItem;
  blocked.removeItem = (key) => {
    if (key === PRE_REPAIR_BACKUP_KEY) throw new Error("blocked");
    return removeItem(key);
  };
  expect(clearLocalSaveRecovery(blocked, "p1")).toBe(false);
  expect(readVault(blocked)).toBeNull();
  expect(readCloudRecovery(blocked)).toBeNull();
});

test("playing the game keeps a compressed backup in this browser", async ({
  page,
}) => {
  await seedProgress(page, { balance: 123456, totalEarned: 123456 });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), SAVE_VAULT_KEY),
    )
    .toBeTruthy();
  const vault = await page.evaluate(
    ({ key, progressKey }) => {
      const envelope = JSON.parse(localStorage.getItem(key));
      return {
        packed: typeof envelope.raw === "string",
        compressed: envelope.raw.startsWith("rngvault1:"),
        bigger: envelope.raw.length,
        saveBytes: localStorage.getItem(progressKey).length,
      };
    },
    { key: SAVE_VAULT_KEY, progressKey: PROGRESS_KEY },
  );
  expect(vault.packed).toBe(true);
  expect(vault.compressed).toBe(true);
  expect(vault.bigger).toBeLessThan(vault.saveBytes);
});

test("Restore save marks a damaged copy and will not restore it", async ({
  page,
}) => {
  await seedProgress(page, { balance: 500 });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: SAVE_HISTORY_KEY,
      value: JSON.stringify({
        version: 1,
        copies: [
          {
            id: "damaged-copy",
            at: Date.now(),
            profileId: "damaged-profile",
            source: "manual",
            raw: '{"balance":',
          },
        ],
      }),
    },
  );
  await page.goto("/settings/save-recovery");

  const damaged = page.getByTestId("recovery-copy-history:damaged-copy");
  await expect(damaged).toBeDisabled();
  await expect(damaged).toContainText("Unavailable · cannot restore");
  await expect(
    page.getByTestId("settings-restore-selected-copy"),
  ).toBeDisabled();
});

test("Settings lets players inspect and restore a selected local save copy", async ({
  page,
}) => {
  await seedProgress(page, { balance: 4242, totalEarned: 12345 });
  await page.goto("/settings");
  await page.getByTestId("settings-open-recovery").click();
  await expect(page).toHaveURL(/\/settings\/save-recovery$/);
  const block = page.getByTestId("settings-recovery");
  const automatic = page.getByTestId("recovery-copy-vault");
  await expect(automatic).toBeVisible();
  await automatic.click();
  const details = page.getByTestId("settings-recovery-details");
  await expect(details).toContainText("LuckyTester");
  await expect(details).toContainText("4,242 EP");
  await expect(
    block.getByTestId("settings-restore-selected-copy"),
  ).toBeEnabled();

  // Damage the save the way a bad write would, then restore the chosen copy.
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"balance": 1'),
    PROGRESS_KEY,
  );
  await block.getByTestId("settings-restore-selected-copy").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved copy restored" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).balance,
        PROGRESS_KEY,
      ),
    )
    .toBe(4242);
});

test("Settings preserves the active save before restoring a selected archive copy", async ({
  page,
}) => {
  const archivedSave = JSON.stringify({
    ...emptyProgress(),
    balance: 73,
    totalEarned: 73,
    profile: { id: "test-profile", username: "LuckyTester", createdAt: 1 },
  });
  const storage = fakeStorage();
  expect(
    archiveSavedCopy(archivedSave, {
      storage,
      now: Date.now(),
      source: "manual",
    }),
  ).toBe(true);
  const archivedCopy = getRecoveryCopies(storage).find((copy) =>
    copy.id.startsWith("history:"),
  );
  expect(archivedCopy).toBeTruthy();

  await seedProgress(page, { balance: 4242, totalEarned: 12345 });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: SAVE_HISTORY_KEY, value: storage.getItem(SAVE_HISTORY_KEY) },
  );
  await page.goto("/settings/save-recovery");

  const selected = page.getByTestId(`recovery-copy-${archivedCopy.id}`);
  await expect(selected).toBeVisible();
  await selected.click();
  await expect(page.getByTestId("settings-recovery-details")).toContainText(
    "73 EP",
  );
  await page.getByTestId("settings-restore-selected-copy").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved copy restored" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).balance,
        PROGRESS_KEY,
      ),
    )
    .toBe(73);
  await expect(page.getByText("Before manual restore")).toBeVisible();
  const activeSaveWasArchived = await page.evaluate((key) => {
    const envelope = JSON.parse(localStorage.getItem(key));
    return envelope.copies.some((copy) => copy.source === "manual-restore");
  }, SAVE_HISTORY_KEY);
  expect(activeSaveWasArchived).toBe(true);
});

test("Settings exposes and restores the separate displaced cloud-save copy", async ({
  page,
}) => {
  const displaced = JSON.stringify({
    ...emptyProgress(),
    balance: 314159,
    totalEarned: 314159,
    profile: { id: "p1", username: "player-one", createdAt: 1 },
  });
  const storage = fakeStorage();
  writeCloudRecovery(displaced, {
    storage,
    now: 25_000,
    reason: "Cloud version kept on a tie.",
  });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: CLOUD_RECOVERY_KEY, value: storage.map.get(CLOUD_RECOVERY_KEY) },
  );
  await page.goto("/settings/save-recovery");

  const recovery = page.getByTestId("settings-recovery");
  const conflictCopy = page.getByTestId("recovery-copy-cloud-recovery");
  await expect(conflictCopy).toBeVisible();
  await conflictCopy.click();
  await expect(page.getByTestId("settings-recovery-details")).toContainText(
    "player-one",
  );
  await recovery.getByTestId("settings-restore-selected-copy").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved copy restored" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).balance,
        PROGRESS_KEY,
      ),
    )
    .toBe(314159);
});

test("Restore save keeps a displaced online copy available without account controls", async ({
  page,
}) => {
  const recoveryStorage = fakeStorage();
  writeCloudRecovery(save(200), { storage: recoveryStorage, now: 100 });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: CLOUD_RECOVERY_KEY,
      value: recoveryStorage.map.get(CLOUD_RECOVERY_KEY),
    },
  );
  await seedProgress(page, { balance: 500 });
  await page.goto("/settings/save-recovery");

  await expect(page.getByTestId("recovery-copy-cloud-recovery")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Delete account & progress/ }),
  ).toHaveCount(0);
});
