import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PAGES } from "../src/router.js";
import { seedProgress } from "./helpers/progress.js";

const read = (file) => fs.readFileSync(`src/${file}`, "utf8");

test("profile and rebirth are routed pages, not dialogs", () => {
  // The router knows both pages…
  expect(PAGES).toContain("profile");
  expect(PAGES).toContain("rebirth");
  // …and main.jsx renders each one as a page section.
  const main = read("main.jsx");
  expect(main).toContain('page === "profile"');
  expect(main).toContain('page === "rebirth"');
  // The sign-up entry point navigates to the profile page…
  expect(main).toContain('navigate("profile")');
  // …and no auth modal branch survives.
  expect(main).not.toContain('modal === "auth"');
});

test("profile page keeps the signup contract: same headings, button and copy", () => {
  const profile = read("components/LocalProfile.jsx");
  expect(profile).toContain("validUsername");
  expect(profile).toContain("aria-invalid");
  expect(profile).toContain("disabled={pending || !ready}");
  expect(profile).toContain("Start saving my progress");
  expect(profile).toContain("Your profile, ");
  expect(profile).toContain("not an online account");
  expect(profile).toContain("Continue playing");
  expect(profile).toContain("Not carried over:");
  expect(profile).toContain("Saved from here on:");
});

test("only the equipped companion walks the roll screen", () => {
  const roll = read("components/RollExperience.jsx");
  // PetParade receives exactly the active pet (or nothing), never the
  // whole collection: one companion equipped at a time.
  expect(roll).toMatch(
    /session\.activePet\s*&&\s*session\.activePet\s*!==\s*"none"\s*\?\s*\[session\.activePet\]\s*:\s*\[\]/,
  );
  const shelf = read("components/PetShelf.jsx");
  expect(shelf).toMatch(/only one.*equipped/i);
});

test("skill ring icons render: the ring keeps its own svg class", () => {
  // The collapse bug: `.skill-ring svg` also matched the inner lucide icon,
  // which sat absolutely positioned inside the 0×0 icon box and vanished.
  const bar = read("components/SkillBar.jsx");
  expect(bar).toContain('className="skill-ring-svg"');
  const css = read("skills.css");
  expect(css).toContain(".skill-ring-svg");
  expect(css).not.toContain(".skill-ring svg");
});

test("rebirth page: the ladder is hidden, never gone, before the threshold", () => {
  const rebirth = read("components/Rebirth.jsx");
  expect(rebirth).toContain("rebirth-locked");
  expect(read("rebirth.css")).toContain(".rebirth-locked");
});

test("profile and rebirth pages render with headings and no dialogs", async ({
  page,
}) => {
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(String(error)));
  await seedProgress(page, {
    profile: { id: "u1", username: "pages", createdAt: 1700000000000 },
  });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your profile, pages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to rolling" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/rebirth");
  await expect(page.getByRole("heading", { name: "Rebirth", level: 1 })).toBeVisible();
  // Under the 30% threshold the ladder is locked, not missing.
  await expect(page.locator(".rebirth-locked")).toBeVisible();
  expect(errors).toEqual([]);
});
