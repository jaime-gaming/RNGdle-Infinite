import { expect, test } from "./helpers/clock.js";
import { localSaveUsableForCloudFallback } from "../src/local-fallback.js";

test("healthy unlinked device progress is playable locally but another account's save is not", () => {
  const common = {
    userId: "account-a",
    profile: { id: "local-profile" },
    healthy: true,
  };
  expect(localSaveUsableForCloudFallback({ ...common, owner: null })).toBe(
    true,
  );
  expect(
    localSaveUsableForCloudFallback({ ...common, owner: "account-a" }),
  ).toBe(true);
  expect(
    localSaveUsableForCloudFallback({ ...common, owner: "account-b" }),
  ).toBe(false);
  expect(
    localSaveUsableForCloudFallback({ ...common, owner: null, healthy: false }),
  ).toBe(false);
  expect(
    localSaveUsableForCloudFallback({ ...common, owner: null, profile: null }),
  ).toBe(false);
});
