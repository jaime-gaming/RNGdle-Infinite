import { expect, test } from "./helpers/clock.js";
import {
  authMessage,
  isAuthReadyForCloud,
  requiresPasswordSetup,
} from "../src/use-firebase-auth.js";

test("Google account collisions guide players to link the existing account", () => {
  expect(
    authMessage({ code: "auth/account-exists-with-different-credential" }),
  ).toContain("connect Google from this profile");
  expect(authMessage({ code: "auth/credential-already-in-use" })).toContain(
    "different game account",
  );
});

test("Google popup and Firebase domain errors have actionable messages", () => {
  expect(authMessage({ code: "auth/popup-blocked" })).toContain(
    "Allow pop-ups",
  );
  expect(authMessage({ code: "auth/unauthorized-domain" })).toContain(
    "authorized in Firebase Authentication",
  );
  expect(authMessage({ code: "auth/operation-not-allowed" })).toContain(
    "provider is not enabled",
  );
  expect(authMessage({ code: "auth/wrong-password" })).toContain(
    "email/password is incorrect",
  );
  expect(authMessage({ code: "auth/weak-password" })).toContain(
    "at least 6 characters",
  );
});

test("Google-only accounts must link a password, but email/password accounts do not", () => {
  expect(
    requiresPasswordSetup({
      providerData: [{ providerId: "google.com" }],
    }),
  ).toBe(true);
  expect(
    requiresPasswordSetup({
      providerData: [{ providerId: "google.com" }, { providerId: "password" }],
    }),
  ).toBe(false);
  expect(
    requiresPasswordSetup({
      providerData: [{ providerId: "password" }],
    }),
  ).toBe(false);
  expect(requiresPasswordSetup(null)).toBe(false);
});

test("cloud gameplay stays gated until a Google account has a password", () => {
  expect(
    isAuthReadyForCloud({
      ready: true,
      user: { passwordRequired: true },
    }),
  ).toBe(false);
  expect(
    isAuthReadyForCloud({
      ready: true,
      user: { passwordRequired: false },
    }),
  ).toBe(true);
  expect(isAuthReadyForCloud({ ready: false, user: null })).toBe(false);
});
