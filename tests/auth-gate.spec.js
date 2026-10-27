import { expect, test } from "./helpers/clock.js";
import { cloudGameAccess } from "../src/auth-gate.js";

test("cloud play requires a configured, ready account", () => {
  expect(
    cloudGameAccess({
      required: true,
      configured: false,
      authReady: true,
    }).allowed,
  ).toBe(false);
  expect(
    cloudGameAccess({
      required: true,
      configured: true,
      authReady: true,
      userId: null,
    }),
  ).toMatchObject({
    allowed: false,
    message: expect.stringContaining("Sign in"),
  });
  expect(
    cloudGameAccess({
      required: true,
      configured: true,
      authReady: true,
      userId: "uid-1",
      passwordRequired: true,
    }).message,
  ).toContain("adding a password");
  expect(
    cloudGameAccess({
      required: true,
      configured: true,
      authReady: true,
      userId: "uid-1",
    }).allowed,
  ).toBe(true);
});

test("the test-only local mode must be an explicit opt-out", () => {
  expect(
    cloudGameAccess({
      required: false,
      configured: false,
      authReady: false,
    }),
  ).toEqual({ allowed: true, message: "" });
});
