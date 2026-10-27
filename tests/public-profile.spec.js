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
    publicProfileUrl(
      "LuckyOtter41",
      "https://game.example",
      "/RNGdle-Infinite/",
    ),
  );
  expect(url.pathname).toBe("/RNGdle-Infinite/profile/LuckyOtter41");
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
    owner_uid: "firebase-user-42",
    username: "LuckyOtter41",
    username_key: "luckyotter41",
    record: {
      name: "LuckyOtter41",
      at: "2026-10-27T12:00:00.000Z",
      rolls: 0,
    },
  });
  expect(Object.keys(data).sort()).toEqual([
    "owner_uid",
    "record",
    "username",
    "username_key",
  ]);
  expect(data).not.toHaveProperty("email");
  expect(data).not.toHaveProperty("save_data");
  expect(data.record).not.toHaveProperty("history");
  expect(data.record).not.toHaveProperty("balance");
});

test("public profile reads reject mismatched names and sanitize card fields", () => {
  const data = publicProfileDocument("firebase-user-42", progress);
  expect(sanitizePublicProfileDocument(data, "luckyotter41")).toMatchObject({
    name: "LuckyOtter41",
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
