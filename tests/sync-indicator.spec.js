import { test, expect } from "@playwright/test";
import {
  profileSyncDescription,
  profileSyncTone,
} from "../src/sync-indicator.js";

test("profile sync ring reflects link, delivery and serious connection errors", () => {
  expect(profileSyncTone({ linked: false, status: "live", peers: 2 })).toBe("");
  expect(
    profileSyncTone({
      linked: true,
      status: "live",
      peers: 2,
      pending: false,
    }),
  ).toBe("connected");
  expect(
    profileSyncTone({
      linked: true,
      status: "live",
      peers: 2,
      pending: true,
    }),
  ).toBe("pending");
  expect(
    profileSyncTone({
      linked: true,
      status: "waiting",
      peers: 1,
      pending: false,
    }),
  ).toBe("pending");
  expect(
    profileSyncTone({
      linked: true,
      status: "error",
      peers: 1,
      pending: true,
    }),
  ).toBe("error");
  expect(profileSyncDescription("connected")).toContain("syncing");
  expect(profileSyncDescription("pending")).toContain("Waiting");
  expect(profileSyncDescription("error")).toContain("may not be reaching");
});
