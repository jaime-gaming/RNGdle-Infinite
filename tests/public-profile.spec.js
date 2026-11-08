import fs from "node:fs";
import { waitForApp } from "./helpers/app.js";
import { expect, test } from "./helpers/clock.js";
import { emptyProgress } from "../src/progress.js";
import {
  normalizedProfileName,
  publicProfileDocument,
  publicProfileId,
  publicProfileUrl,
  sanitizePublicProfileDocument,
} from "../src/public-profile.js";

const progress = {
  ...emptyProgress(),
  profile: {
    id: "private-profile-id",
    username: "LuckyOtter41",
    createdAt: Date.UTC(2026, 0, 1),
  },
  balance: 12_345,
  totalEarned: 87_654,
};

test("direct public-profile URLs use the name path and contain no card token", () => {
  const url = new URL(
    publicProfileUrl("LuckyOtter41", "https://game.example", "/preview/"),
  );
  expect(url.pathname).toBe("/preview/profile/luckyotter41");
  expect(url.search).toBe("");
  expect(url.hash).toBe("");
});

test("public profile names are normalized consistently and reject invalid names", () => {
  expect(normalizedProfileName("  LuckyOtter41 ")).toBe("luckyotter41");
  expect(publicProfileId("LUCKYOTTER41")).toBe(publicProfileId("LuckyOtter41"));
  expect(publicProfileId("Ｆｏｏ")).toBe("foo");
  expect(publicProfileId("two words")).toBe("");
});

test("the public document contains only a sanitized profile summary", () => {
  const data = publicProfileDocument(
    "firebase-user-42",
    progress,
    new Date("2026-10-27T12:00:00.000Z"),
  );
  expect(data).toMatchObject({
    username: "luckyotter41",
    username_key: "luckyotter41",
    record: {
      name: "luckyotter41",
      at: "2026-10-27T12:00:00.000Z",
      rolls: 0,
    },
  });
  expect(Object.keys(data).sort()).toEqual([
    "record",
    "username",
    "username_key",
  ]);
  expect(data).not.toHaveProperty("owner_uid");
  expect(data).not.toHaveProperty("email");
  expect(data).not.toHaveProperty("save_data");
  expect(Object.keys(data.record).sort()).toEqual(
    [
      "at",
      "avatar",
      "aura",
      "badges",
      "badgesTotal",
      "best",
      "companion",
      "earned",
      "favoriteTier",
      "name",
      "pins",
      "prestiges",
      "rebirths",
      "rolls",
      "since",
      "v",
    ].sort(),
  );
  expect(data.record).not.toHaveProperty("history");
  expect(data.record).not.toHaveProperty("balance");
});

test("a Cloud logo is omitted unless the caller explicitly publishes it", () => {
  const logo = "data:image/png;base64,aGk=";
  const withLocalLogo = {
    ...progress,
    profile: { ...progress.profile, avatar: logo },
  };
  const privateLogo = publicProfileDocument(
    "firebase-user-42",
    withLocalLogo,
    new Date("2026-10-27T12:00:00.000Z"),
    { avatar: "" },
  );
  const publishedLogo = publicProfileDocument(
    "firebase-user-42",
    withLocalLogo,
    new Date("2026-10-27T12:00:00.000Z"),
    { avatar: logo },
  );
  expect(privateLogo.record.avatar).toBeNull();
  expect(publishedLogo.record.avatar).toBe(logo);
});

test("public profile reads reject mismatched names and sanitize card fields", () => {
  const data = publicProfileDocument("firebase-user-42", progress);
  expect(sanitizePublicProfileDocument(data, "luckyotter41")).toMatchObject({
    name: "luckyotter41",
  });
  expect(sanitizePublicProfileDocument(data, "SomebodyElse")).toBeNull();
  expect(
    sanitizePublicProfileDocument(
      { ...data, record: { ...data.record, avatar: "https://evil.test/x" } },
      "LuckyOtter41",
    ).avatar,
  ).toBeNull();
  expect(
    sanitizePublicProfileDocument(
      { ...data, owner_uid: "", username_key: "somebodyelse" },
      "LuckyOtter41",
    ),
  ).toBeNull();
});

test("rules keep the two profile_id scopes apart", () => {
  // The owner pointer is keyed by the public name; the settings document and
  // the name claim record the game profile id. Comparing a settings or claim id
  // with the owner's made every public publish and public read fail.
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const block = (name) => {
    const start = rules.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return rules.slice(start, rules.indexOf("\n    }", start));
  };
  for (const name of ["profileIsPublic", "profileIsPublicAfter"]) {
    const body = block(name);
    // The owner id must still be the alias this document is keyed by.
    expect(body).toMatch(/ownerPath\)\.data\.profile_id == profileId/);
    // But the game profile ids must never be compared with the alias field.
    expect(body).not.toMatch(
      /(?:get|getAfter)\((?:settingsPath|claimPath)\)\.data\.profile_id\s*==\s*(?:get|getAfter)\(ownerPath\)/,
    );
    expect(body).not.toMatch(
      /ownerPath\)\.data\.profile_id\s*==\s*(?:get|getAfter)\((?:settingsPath|claimPath)\)/,
    );
    // The settings and the name claim must describe one game profile.
    const linked = body
      .split("\n")
      .some(
        (line) =>
          line.includes("profile_id") &&
          /settingspath/i.test(line) &&
          line.includes("claimPath"),
      );
    expect(linked).toBe(true);
  }
});
