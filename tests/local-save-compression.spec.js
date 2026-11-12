import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { writeDeviceSave } from "../src/local-save.js";
import { unpackVaultSave, SAVE_VAULT_TAG } from "../src/save-codec.js";
import {
  emptyProgress,
  parseAndRepairProgress,
  PROGRESS_KEY,
} from "../src/progress.js";
import {
  isReadableSave,
  writeVault,
  readVault,
  restoreVaultIfNeeded,
  SAVE_VAULT_KEY,
} from "../src/save-vault.js";
import {
  recoverSaveAfterUpdate,
  APP_UPDATE_SAVE_KEY,
} from "../src/app-update.js";
import { seedProgress } from "./helpers/progress.js";
import { HISTORY_LIMIT } from "../src/history-log.js";

const history = Array.from({ length: 200 }, (_, i) => ({
  id: `roll-${i}`,
  type: "roll",
  number: 123456,
  tier: "common",
  ep: 10,
  at: 1700000000000 + i,
  badges: [],
}));
const state = {
  ...emptyProgress(),
  profile: {
    id: "quota-profile",
    username: "QuotaPlayer",
    createdAt: 1700000000000,
  },
  history,
  balance: 2000,
  totalEarned: 2000,
};
const raw = JSON.stringify(state);
function limitedStore(limit = Infinity) {
  const values = new Map();
  return {
    values,
    getItem: (k) => values.get(k) ?? null,
    setItem(k, value) {
      if (k === PROGRESS_KEY && value.length > limit)
        throw new DOMException("Full", "QuotaExceededError");
      values.set(k, value);
    },
    removeItem: (k) => values.delete(k),
  };
}

test("a compressed save survives a quota-limited store and never deletes history, recovery or owner data", () => {
  const store = limitedStore(5000);
  store.values.set(PROGRESS_KEY, "previous-save");
  store.values.set("owner", "owner-marker");
  store.values.set(SAVE_VAULT_KEY, "recovery-copy");
  writeDeviceSave(store, PROGRESS_KEY, raw);
  expect(store.getItem(PROGRESS_KEY).startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(unpackVaultSave(store.getItem(PROGRESS_KEY))).toBe(raw);
  expect(store.getItem(PROGRESS_KEY).length).toBeLessThan(raw.length / 4);
  expect(
    parseAndRepairProgress(store.getItem(PROGRESS_KEY)).progress.history,
  ).toHaveLength(200);
  expect(store.getItem("owner")).toBe("owner-marker");
  expect(store.getItem(SAVE_VAULT_KEY)).toBe("recovery-copy");
  writeDeviceSave(
    store,
    PROGRESS_KEY,
    JSON.stringify({ ...state, balance: 1900 }),
  );
  expect(store.getItem(PROGRESS_KEY).startsWith(SAVE_VAULT_TAG)).toBe(true);
});

test("every primary write is compressed, even with free storage", () => {
  const store = limitedStore();
  writeDeviceSave(store, PROGRESS_KEY, raw);
  expect(store.getItem(PROGRESS_KEY).startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(unpackVaultSave(store.getItem(PROGRESS_KEY))).toBe(raw);
  expect(store.getItem(PROGRESS_KEY).length).toBeLessThan(raw.length);
  writeDeviceSave(
    store,
    PROGRESS_KEY,
    JSON.stringify({ ...state, balance: 5 }),
  );
  expect(store.getItem(PROGRESS_KEY).startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(unpackVaultSave(store.getItem(PROGRESS_KEY))).toBe(
    JSON.stringify({ ...state, balance: 5 }),
  );

  writeDeviceSave(store, PROGRESS_KEY, '{"ok":true}');
  expect(unpackVaultSave(store.getItem(PROGRESS_KEY))).toBe('{"ok":true}');
});

test("a full 10,000-entry log round-trips inside a tight storage quota", () => {
  const full = {
    ...state,
    history: Array.from({ length: HISTORY_LIMIT }, (_, i) => ({
      id: `roll-${i}`,
      type: "roll",
      number: 123456,
      tier: "common",
      ep: 10,
      at: 1700000000000 + i,
      badges: [],
    })),
  };
  const rawFull = JSON.stringify(full);
  const store = limitedStore(900_000);
  writeDeviceSave(store, PROGRESS_KEY, rawFull);
  expect(store.getItem(PROGRESS_KEY).startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(store.getItem(PROGRESS_KEY).length).toBeLessThan(rawFull.length / 5);
  expect(
    parseAndRepairProgress(store.getItem(PROGRESS_KEY)).progress.history,
  ).toHaveLength(HISTORY_LIMIT);
});

test("a failed compressed write and disabled storage leave the previous save unchanged", () => {
  const store = limitedStore(1);
  store.values.set(PROGRESS_KEY, "previous-save");
  expect(() => writeDeviceSave(store, PROGRESS_KEY, raw)).toThrow();
  expect(store.getItem(PROGRESS_KEY)).toBe("previous-save");
  let writes = 0;
  expect(() =>
    writeDeviceSave(
      {
        getItem: () => null,
        setItem() {
          writes++;
          throw new DOMException("Denied", "SecurityError");
        },
      },
      PROGRESS_KEY,
      raw,
    ),
  ).toThrow();
  expect(writes).toBe(1);
  expect(() => parseAndRepairProgress(`${SAVE_VAULT_TAG}corrupt`)).toThrow();
});

test("vault and update recovery recognize a compressed primary save instead of replacing it", () => {
  const store = limitedStore(5000);
  writeDeviceSave(store, PROGRESS_KEY, raw);
  expect(isReadableSave(store.getItem(PROGRESS_KEY))).toBe(true);
  expect(
    writeVault(store.getItem(PROGRESS_KEY), { storage: store, now: 1000 }),
  ).toBe(true);
  expect(readVault(store).raw).toBe(raw);
  expect(restoreVaultIfNeeded({ storage: store }).restored).toBe(false);
  const scratch = limitedStore();
  scratch.values.set(
    APP_UPDATE_SAVE_KEY,
    JSON.stringify({ at: 1000, raw: JSON.stringify({ ...state, balance: 1 }) }),
  );
  expect(
    recoverSaveAfterUpdate({ storage: store, scratch, now: 2000 }).recovered,
  ).toBe(false);
  expect(unpackVaultSave(store.getItem(PROGRESS_KEY))).toBe(raw);
  store.removeItem(PROGRESS_KEY);
  expect(restoreVaultIfNeeded({ storage: store }).restored).toBe(true);
  expect(unpackVaultSave(store.getItem(PROGRESS_KEY))).toBe(raw);
});

test("a compressed rename syncs to another tab and survives a tight quota and reload with the complete history", async ({
  page,
  context,
}) => {
  await seedProgress(page, state);
  await page.goto("/profile");
  await waitForApp(page);
  const other = await context.newPage();
  await other.goto("/profile");
  await waitForApp(other);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) {
      if (k === key && value.length > 5000)
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, k, value);
    };
  }, PROGRESS_KEY);
  await page.getByRole("button", { name: "Change profile name" }).click();
  await page.locator("#profile-rename-input").fill("CompressedPlayer");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile, CompressedPlayer" }),
  ).toBeVisible();
  await expect(
    other.getByRole("heading", { name: "Your profile, CompressedPlayer" }),
  ).toBeVisible();
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    PROGRESS_KEY,
  );
  expect(stored.startsWith(SAVE_VAULT_TAG)).toBe(true);
  expect(parseAndRepairProgress(stored).progress.history).toHaveLength(200);
  await page.reload();
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "Your profile, CompressedPlayer" }),
  ).toBeVisible();
  await other.close();
});

test("help links use the themed buttons and historical notes are capitalized only on screen", async ({
  page,
}) => {
  await page.goto("/about");
  await waitForApp(page);
  for (const name of ["Privacy & Rights", "Terms of Service"]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toHaveClass(/secondary-button/);
  }
  await expect(
    page.getByRole("heading", { name: "Understand a roll" }),
  ).toBeVisible();
  await page.goto("/changelog");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "Changelog", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".changelog-entry").first().locator("p").first(),
  ).toHaveText(
    "The Battle Pass arrives: 28-day seasons themed by the month they open in, 30 vertical levels and optional EP premium.",
  );
});
