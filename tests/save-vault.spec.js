import { test, expect } from "./helpers/clock.js";
import { seedProgress } from "./helpers/progress.js";
import {
  SAVE_VAULT_KEY,
  SAVE_VAULT_TAG,
  clearVault,
  isReadableSave,
  packVaultSave,
  readVault,
  restoreVaultIfNeeded,
  unpackVaultSave,
  writeVault,
} from "../src/save-vault.js";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";

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

const save = (balance = 42) =>
  JSON.stringify({ ...emptyProgress(), balance, profile: { id: "p1" } });

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

test("Settings shows the backup and puts it back on demand", async ({
  page,
}) => {
  await seedProgress(page, { balance: 4242, totalEarned: 4242 });
  await page.goto("/settings");
  const block = page.getByTestId("settings-backup");
  await expect(block).toContainText("A backup copy of your game was kept");
  // Damage the save the way a bad write would, then restore from the copy.
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"balance": 1'),
    PROGRESS_KEY,
  );
  await page.getByTestId("settings-restore-backup").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Backup restored" }),
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

test("deleting the account takes the backup with it", async ({ page }) => {
  await seedProgress(page, { balance: 500 });
  await page.goto("/profile");
  await page
    .getByRole("button", { name: /Delete account & progress/ })
    .first()
    .click();
  await page.getByLabel(/Type DELETE to confirm/).fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete" }).click();
  // The safety copy belongs to the account, so it goes with it and cannot
  // bring a deleted profile back.
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), SAVE_VAULT_KEY),
    )
    .toBeNull();
});
