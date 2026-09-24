import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PAGES } from "../src/router.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { rebirthUnlocked, REBIRTH_VISIBLE_AT } from "../src/rebirth.js";
import { emptyProgress } from "../src/progress.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const badgeIds = allBadgeMetadata.map((b) => b.id);

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

test("rebirth says nothing at all until the ladder unlocks", () => {
  // The component renders nothing, the header entry renders nothing, and the
  // old locked-panel copy is gone for good.
  const rebirth = read("components/Rebirth.jsx");
  expect(rebirth).toContain("rebirthUnlocked");
  expect(rebirth).toContain("if (!unlocked) return null;");
  expect(rebirth).not.toContain("rebirth-locked");
  expect(read("rebirth.css")).not.toContain(".rebirth-locked");
  expect(read("components/RebirthNav.jsx")).toContain(
    "if (!rebirthUnlocked(progress)) return null;",
  );
  // A direct link to the locked page is normalised away by the app shell.
  expect(read("main.jsx")).toContain("rebirthVisible");
  expect(read("main.jsx")).toContain('page === "rebirth" && rebirthVisible');
  // The help page keeps quiet too.
  expect(read("components/About.jsx")).toContain("showsRebirth");
  // …and the threshold itself is unchanged.
  const locked = {
    ...emptyProgress(),
    discovered: badgeIds.slice(0, REBIRTH_VISIBLE_AT - 1),
  };
  expect(rebirthUnlocked(locked)).toBe(false);
  expect(
    rebirthUnlocked({
      ...locked,
      discovered: badgeIds.slice(0, REBIRTH_VISIBLE_AT),
    }),
  ).toBe(true);
  // Once the collection resets, a player who has rebirthed still sees it.
  expect(rebirthUnlocked({ ...emptyProgress(), rebirths: 1 })).toBe(true);
});

test("profile and rebirth pages render with headings and no dialogs", async ({
  page,
}) => {
  const errors = [];
  page.on(
    "console",
    (message) => message.type() === "error" && errors.push(message.text()),
  );
  page.on("pageerror", (error) => errors.push(String(error)));
  await seedProgress(page, {
    profile: { id: "u1", username: "pages", createdAt: 1700000000000 },
  });
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Profile", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your profile, pages" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to rolling" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Rebirth stays silent under the threshold: a direct link goes home and the
  // page never mentions it.
  await page.goto("/rebirth");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Rebirth", level: 1 }),
  ).toHaveCount(0);
  await expect(page.locator(".rebirth-page, .rebirth-ladder")).toHaveCount(0);
  await expect(page.locator(".rebirth-nav")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the rebirth page explains the ladder, its rewards and the reset once it unlocks", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    discovered: badgeIds.slice(0, 150),
  });
  await page.goto("/rebirth");
  await expect(
    page.getByRole("heading", { name: "Rebirth", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /The ladder/ })).toBeVisible();
  // Six rungs, each with the badges it asks for and the skill it hands over.
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(6);
  await expect(page.locator(".rebirth-ladder > li.is-current")).toHaveCount(1);
  await expect(page.locator(".rebirth-reward")).toHaveCount(6);
  // What is kept and what is reset are both stated.
  await expect(
    page.getByRole("heading", { name: /What a rebirth keeps/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /What it resets/ }),
  ).toBeVisible();
  // The ultra-rebirth bonus is explained, but its button waits for a full
  // collection.
  await expect(
    page.getByRole("heading", { name: /ultra-rebirth/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Ultra-rebirth/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeVisible();
});
