import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PAGES } from "../src/router.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { rebirthUnlocked, REBIRTH_VISIBLE_AT } from "../src/rebirth.js";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
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

test("companions are uncaged with an animation, on the shelf and on arrival", () => {
  // The shelf: a barred door across every cage, swinging open with a hop
  // while the friend is uncaged.
  const shelf = read("components/PetShelf.jsx");
  expect(shelf).toContain("pet-cage-door");
  expect(shelf).toContain("is-uncaging");
  expect(shelf).toContain("pet-cage-hanger");
  const css = read("pets.css");
  expect(css).toContain("@keyframes pet-uncage-door");
  expect(css).toContain("@keyframes pet-uncage-hop");
  // The arrival: a found friend bursts out of its cage on the roll stage.
  const parade = read("components/PetParade.jsx");
  expect(parade).toContain("pet-arrival-cage");
  expect(read("pet-parade.css")).toContain("@keyframes pet-arrival-cage");
});

test("the roll animates each wallet bonus charge instead of showing a static extra line", () => {
  const roll = read("components/RollExperience.jsx");
  // The settlement formula drives the balance counter, and each bonus part
  // floats up as its own animated charge rather than sitting as a static text
  // line above "Your EP balance".
  expect(roll).toContain("walletMultiplier(session, firedSkills)");
  expect(roll).toContain("creditedEP");
  expect(roll).toContain("floatingCharges");
  expect(roll).toContain("is-bonus-charge");
  expect(roll).not.toContain("roll-credit");
  expect(roll).not.toContain("EP banked");
  expect(roll).not.toContain("roll-credit-total");
  expect(read("roll.css")).toContain(".floating-ep.is-bonus-charge");
  expect(read("roll.css")).not.toContain(".roll-credit");
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
  // At 0 rebirths, 3 clear rungs + 1 blurred/faded 4th rung are shown, hiding #5 and #6.
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(4);
  await expect(page.locator(".rebirth-ladder > li.is-current")).toHaveCount(1);
  await expect(page.locator(".rebirth-ladder > li.is-faded")).toHaveCount(1);
  await expect(
    page.locator(".rebirth-ladder > li.is-faded .rebirth-rung-name"),
  ).toHaveText("#4");
  await expect(page.locator(".rebirth-reward")).toHaveCount(4);
  await expect(page.locator(".rebirth-reward-chip").first()).toContainText(
    "+2% EP forever",
  );
  // After 1 rebirth, #4 is clear and the blurred/faded preview moves to #5, hiding #6.
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.rebirths = 1;
    localStorage.setItem(key, JSON.stringify(raw));
  }, PROGRESS_KEY);
  await page.reload();
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(5);
  await expect(
    page.locator(".rebirth-ladder > li.is-faded .rebirth-rung-name"),
  ).toHaveText("#5");
  // After 2 rebirths, #5 is clear and the blurred/faded preview moves to #6.
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.rebirths = 2;
    localStorage.setItem(key, JSON.stringify(raw));
  }, PROGRESS_KEY);
  await page.reload();
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(6);
  await expect(
    page.locator(".rebirth-ladder > li.is-faded .rebirth-rung-name"),
  ).toHaveText("#6");
  // After 3 rebirths, all 6 rungs are clear with no faded rung.
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.rebirths = 3;
    localStorage.setItem(key, JSON.stringify(raw));
  }, PROGRESS_KEY);
  await page.reload();
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(6);
  await expect(page.locator(".rebirth-ladder > li.is-faded")).toHaveCount(0);
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

test("equipped skills stand alone while pet and rebirth families stack in the skill row, excluding unequipped skills", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    owned: ["surge", "trail"],
    skills: ["surge", "trail"],
    equippedSkills: ["surge"],
    skillCharge: { surge: 2, trail: 1 },
    pets: ["pebble"],
    activePet: "pebble",
    rebirths: 2,
    ultraRebirths: 1,
    surplusBanked: 3,
  });
  await page.goto("/");
  const bar = page.locator(".skill-bar");
  await expect(bar).toBeVisible();
  // The equipped skill stands alone while the pet and rebirth families ride in
  // stacks that fan out on hover; the unequipped non-companion skill (trail)
  // stays out entirely.
  await expect(bar.locator('[data-skill="surge"]')).toContainText(
    "×2 banked EP · 2/5",
  );
  await expect(bar.locator('[data-skill="trail"]')).toHaveCount(0);
  await expect(bar.locator('[data-stack="pet"]')).toBeVisible();
  await expect(bar.locator('[data-stack="rebirth"]')).toBeVisible();
  await bar.locator('[data-stack="pet"]').hover();
  await expect(bar.locator('[data-skill="pebble-steady"]')).toBeVisible();
  await expect(bar.locator('[data-skill="pet:pebble"]')).toBeVisible();
  await bar.locator('[data-stack="rebirth"]').hover();
  await expect(bar.locator('[data-skill="rebirth"]')).toBeVisible();
  await expect(bar.locator('[data-skill="pet:pebble"]')).toContainText(
    "+5% EP",
  );
  await expect(bar.locator('[data-skill="rebirth"]')).toContainText("+4% EP");
  await expect(bar.locator('[data-skill="ultra"]')).toContainText("+10% EP");
  await expect(bar.locator('[data-skill="surplus"]')).toContainText("+3% EP");
});

test("profile export downloads a valid PNG account card with username and biggest roll", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    balance: 250000,
    totalEarned: 900000,
    rebirths: 1,
    history: [
      {
        id: "r1",
        type: "roll",
        at: 1700000001000,
        number: 777777,
        ep: 500000,
        tier: "godly",
        badges: [],
      },
    ],
  });
  await page.goto("/profile");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export my data/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^rngdle-infinite-luckytester-\d{4}-\d{2}-\d{2}\.png$/,
  );
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(buffer.length).toBeGreaterThan(1000);
});
