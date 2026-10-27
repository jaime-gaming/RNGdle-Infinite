import { expect, test } from "./helpers/clock.js";
import { authMessage } from "../src/use-firebase-auth.js";

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
});
