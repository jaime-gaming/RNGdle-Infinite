import { expect, test } from "./helpers/clock.js";
import {
  authMessage,
  isAuthReadyForCloud,
  isEmailPasswordOnlyUser,
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

test("sign-in errors use clear, player-friendly messages", () => {
  expect(authMessage({ code: "auth/popup-blocked" })).toContain(
    "Allow pop-ups",
  );
  expect(authMessage({ code: "auth/unauthorized-domain" })).toContain(
    "continue locally",
  );
  expect(authMessage({ code: "auth/operation-not-allowed" })).toContain(
    "continue locally",
  );
  expect(
    authMessage(
      { code: "auth/unknown", message: "Firebase internal error: 503" },
      "Please try again.",
    ),
  ).toBe("Please try again.");
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

test("credential management is limited to password-only accounts", () => {
  expect(isEmailPasswordOnlyUser({ providers: ["password"] })).toBe(true);
  expect(
    isEmailPasswordOnlyUser({
      providerData: [{ providerId: "password" }],
    }),
  ).toBe(true);
  expect(
    isEmailPasswordOnlyUser({
      providers: ["password", "google.com"],
    }),
  ).toBe(false);
  expect(isEmailPasswordOnlyUser({ providers: ["google.com"] })).toBe(false);
  expect(isEmailPasswordOnlyUser(null)).toBe(false);
});

test("recent-login errors explain that credentials must be verified again", () => {
  expect(authMessage({ code: "auth/requires-recent-login" })).toContain(
    "verify your sign-in again",
  );
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
