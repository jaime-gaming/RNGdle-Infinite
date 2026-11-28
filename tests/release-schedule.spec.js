import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { CHANGELOG } from "../src/changelog.js";
import { RNGMAS_START, RNGMAS_END, RNGMAS_THEME_START } from "../src/rngmas.js";
import { BOOKMARK_LIMIT } from "../src/history-log.js";

test("November 28 publication does not bring forward the December event", () => {
  expect(CHANGELOG[0].date).toBe("2026-11-28");
  expect(RNGMAS_START).toBe(Date.UTC(2026, 11, 1));
  expect(RNGMAS_THEME_START).toBe(RNGMAS_START);
  expect(RNGMAS_END).toBe(Date.UTC(2027, 0, 2));
  const notes = CHANGELOG[0].body.join(" ").toLowerCase();
  expect(notes).toContain("november 28");
  expect(notes).toContain("december 1 at 00:00 utc");
  expect(notes).toContain("missed doors cannot be recovered");
  expect(notes).not.toMatch(/five weekly golems|claimable for three days/);
});

test("bookmark limits agree across the client, Firestore rules and local permission model", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const model = fs.readFileSync(
    "tools/cloud-sync-sim/fakes/firestore.mjs",
    "utf8",
  );
  expect(BOOKMARK_LIMIT).toBe(25);
  expect(Number(rules.match(/pins\.size\(\) <= (\d+)/)?.[1])).toBe(
    BOOKMARK_LIMIT,
  );
  expect(Number(model.match(/record\.pins\.length <= (\d+)/)?.[1])).toBe(
    BOOKMARK_LIMIT,
  );
  for (let index = 0; index < BOOKMARK_LIMIT; index++) {
    expect(rules).toContain(`validPinnedRoll(pins[${index}])`);
  }
});
