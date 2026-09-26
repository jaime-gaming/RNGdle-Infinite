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

test("a firing companion skill pins the companion to the number's corner", () => {
  const roll = read("components/RollExperience.jsx");
  // While the worn companion's signature skill is one of the roll's fired
  // skills, the walker steps off the stage (docked) and the number box
  // carries a small corner mark until the roll settles.
  expect(roll).toContain("skillForPet(session.activePet)");
  expect(roll).toContain("companionSkillFiring");
  expect(roll).toContain("docked={companionSkillFiring}");
  expect(roll).toContain(
    "dockedPet={companionSkillFiring ? session.activePet : null}",
  );
  const parade = read("components/PetParade.jsx");
  expect(parade).toContain("is-docked");
  expect(read("pet-parade.css")).toContain(".pet-walker.is-docked");
  expect(roll).toContain("artifact-companion");
  expect(read("roll.css")).toContain(".artifact-companion");
});

test("the roll names the wallet bonus only when there is one", () => {
  const roll = read("components/RollExperience.jsx");
  // The settlement formula still drives the balance counter, but the visible
  // line only exists when a multiplier adds EP beyond the score: it quotes the
  // extra and its parts, never repeats the number, never says "banked".
  expect(roll).toContain("walletMultiplier(session, firedSkills)");
  expect(roll).toContain("creditedEP");
  expect(roll).toContain("digitsDone && bonusEP > 0");
  expect(roll).toContain("roll-credit");
  expect(roll).not.toContain("EP banked");
  expect(roll).not.toContain("roll-credit-total");
  expect(read("roll.css")).toContain(".roll-credit");
  expect(read("roll.css")).not.toContain(".roll-credit-total");
});

test("the header marks the current page, and hover can never impersonate it", () => {
  const styles = read("styles.css");
  // Hover is a background plus the ink colour; the selected page owns the
  // green underline — and keeps it while hovered.
  expect(styles).toContain(".header nav button.active,");
  expect(styles).toContain(".header nav button.active:hover");
  expect(styles).toContain("box-shadow: 0 2px var(--green)");
  // The icon buttons (help, settings) opt into the same state with a class,
  // not just aria-current.
  expect(styles).toContain(".icon-button.active,");
  const main = read("main.jsx");
  expect(main).toContain('page === "about" ? "active" : ""');
  expect(main).toContain('page === "settings" ? "active" : ""');
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
  // Six rungs, each with the badges it asks for and the skill it hands over —
  // plus the permanent +2% wallet bonus every rung pays.
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(6);
  await expect(page.locator(".rebirth-ladder > li.is-current")).toHaveCount(1);
  await expect(page.locator(".rebirth-reward")).toHaveCount(6);
  await expect(page.locator(".rebirth-reward-chip").first()).toContainText(
    "+2% EP forever",
  );
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
