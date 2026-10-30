import { expect, test } from "./helpers/clock.js";
import {
  LEGACY_DEVICE_LINK_STORAGE_KEYS,
  retireLegacyDeviceLink,
} from "../src/device-link-migration.js";

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("an active legacy device link is retired and reported once without exposing its key", () => {
  const store = storage({
    [LEGACY_DEVICE_LINK_STORAGE_KEYS[0]]: JSON.stringify({
      room: "private-room",
      key: "secret-link-key",
      device: "device-a",
    }),
    [LEGACY_DEVICE_LINK_STORAGE_KEYS[1]]: "https://old-relay.example",
  });

  expect(retireLegacyDeviceLink(store)).toBe(true);
  expect(store.data.has(LEGACY_DEVICE_LINK_STORAGE_KEYS[0])).toBe(false);
  expect(store.data.has(LEGACY_DEVICE_LINK_STORAGE_KEYS[1])).toBe(false);
  expect(store.data.get(LEGACY_DEVICE_LINK_STORAGE_KEYS[2])).toBe("1");
  expect(retireLegacyDeviceLink(store)).toBe(false);
  expect(JSON.stringify([...store.data])).not.toContain("secret-link-key");
});

test("no notice is shown for a missing or malformed old link", () => {
  const store = storage({ [LEGACY_DEVICE_LINK_STORAGE_KEYS[0]]: "not-json" });
  expect(retireLegacyDeviceLink(store)).toBe(false);
  expect(store.data.has(LEGACY_DEVICE_LINK_STORAGE_KEYS[0])).toBe(false);
});
