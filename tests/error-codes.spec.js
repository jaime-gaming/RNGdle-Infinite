import { expect, test } from "./helpers/clock.js";
import {
  ERROR_CATALOG,
  errorReference,
  gameAuthorityErrorReference,
  isErrorReference,
} from "../src/error-codes.js";
import { toastFrom } from "../src/toasts.js";

test("the support catalog is broad and every reference is unique and valid", () => {
  const ids = ERROR_CATALOG.map(({ id }) => id);
  expect(ids.length).toBeGreaterThanOrEqual(80);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => /^[A-Z]{2}[0-9]{3}$/.test(id))).toBe(true);
});

test("Cloud game authority failures map to stable support references", () => {
  expect(gameAuthorityErrorReference("game-security-unavailable")).toBe(
    "NT605",
  );
  expect(gameAuthorityErrorReference("request-not-secure")).toBe("NT606");
  expect(gameAuthorityErrorReference("account-changed")).toBe("CL307");
  expect(gameAuthorityErrorReference("cloud-restricted")).toBe("CL303");
  expect(gameAuthorityErrorReference("cloud-save-not-ready")).toBe("CL314");
  expect(gameAuthorityErrorReference("cloud-profile-changed")).toBe("CL314");
  expect(gameAuthorityErrorReference("roll-not-ready")).toBe("GM504");
  expect(
    gameAuthorityErrorReference("unrecognized", "Unclassified response"),
  ).toBe("GM516");
});

test("logic and UI errors expose stable support references", () => {
  expect(errorReference("Cloud progress could not be loaded")).toMatch(
    /^[A-Z]{2}[0-9]{3}$/,
  );
  expect(errorReference("A page failed to render", "UI101")).toBe("UI101");
  expect(isErrorReference("UI101")).toBe(true);
  expect(isErrorReference("UI-101")).toBe(false);
  expect(
    toastFrom({ kind: "error", text: "Progress could not be updated." }),
  ).toHaveProperty("reference");
});
