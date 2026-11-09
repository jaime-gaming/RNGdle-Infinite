import { test, expect } from "@playwright/test";
import {
  CLOUD_QUOTA_PAUSE_MS,
  clearCloudQuotaPause,
  cloudQuotaNotice,
  cloudQuotaPauseRemaining,
  isCloudQuotaError,
  isCloudQuotaNotice,
  pauseCloudForQuota,
} from "../src/cloud-quota.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("quota errors pause cloud work and expire after the cooldown", () => {
  const storage = memoryStorage();
  const now = 1_000_000;
  expect(isCloudQuotaError({ code: "firestore/resource-exhausted" })).toBe(
    true,
  );
  expect(isCloudQuotaError({ message: "8 RESOURCE_EXHAUSTED" })).toBe(true);
  expect(isCloudQuotaError({ message: "Quota exceeded" })).toBe(true);
  expect(isCloudQuotaError({ code: "permission-denied" })).toBe(false);
  expect(CLOUD_QUOTA_PAUSE_MS).toBe(15 * 60 * 1000);

  expect(
    pauseCloudForQuota(
      { code: "resource-exhausted" },
      { storage, now, pauseMs: 60_000 },
    ),
  ).toBe(60_000);
  expect(cloudQuotaPauseRemaining({ storage, now: now + 30_000 })).toBe(30_000);
  expect(cloudQuotaPauseRemaining({ storage, now: now + 60_001 })).toBe(0);
  expect(cloudQuotaNotice(60_000)).toContain("Progress stays on this device");
  expect(cloudQuotaNotice(60_000)).toContain("1 minute");
  expect(isCloudQuotaNotice(cloudQuotaNotice(60_000))).toBe(true);
  expect(isCloudQuotaNotice("Changes are saved on this device.")).toBe(false);

  clearCloudQuotaPause({ storage });
  expect(cloudQuotaPauseRemaining({ storage, now })).toBe(0);
});
