import { expect, test } from "./helpers/clock.js";
import { cloudGameAccess } from "../src/auth-gate.js";

test("cloud play requires a configured, ready account unless local play was chosen", () => {
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
  ).toContain("password");
  expect(
    cloudGameAccess({
      required: true,
      configured: false,
      authReady: false,
      localPlay: true,
    }),
  ).toEqual({ allowed: true, message: "" });
  expect(
    cloudGameAccess({
      required: true,
      configured: true,
      authReady: false,
      userId: null,
      localPlay: true,
    }).allowed,
  ).toBe(true);
  expect(
    cloudGameAccess({
      required: true,
      configured: true,
      authReady: true,
      userId: "google-only",
      passwordRequired: true,
      localPlay: true,
    }).allowed,
  ).toBe(false);
  expect(
    cloudGameAccess({
      required: true,
      configured: true,
      authReady: true,
      userId: "uid-1",
    }).allowed,
  ).toBe(true);
});

test("deployments that allow local play do not need an extra opt-in", () => {
  expect(
    cloudGameAccess({
      required: false,
      configured: false,
      authReady: false,
    }),
  ).toEqual({ allowed: true, message: "" });
});
