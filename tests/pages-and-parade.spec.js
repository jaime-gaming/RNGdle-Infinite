import { mockOperationalStatus } from "./helpers/status.js";
import { waitForApp } from "./helpers/app.js";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PAGES } from "../src/router.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { rebirthUnlocked, REBIRTH_VISIBLE_AT } from "../src/rebirth.js";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mutateSavedProgress } from "./helpers/save.js";

test.beforeEach(async ({ page }) => {
  await mockOperationalStatus(page);
});

const badgeIds = allBadgeMetadata.map((b) => b.id);

const read = (file) => fs.readFileSync(`src/${file}`, "utf8");

test("profile and rebirth are routed pages, not dialogs", () => {
  expect(PAGES).toContain("profile");
  expect(PAGES).toContain("rebirth");

  const main = read("main.jsx");
  expect(main).toContain('page === "profile"');
  expect(main).toContain('page === "rebirth"');

  expect(main).toContain('navigate("profile")');

  expect(main).not.toContain('modal === "auth"');
});

test("profile page lets players name and save a local profile", () => {
  const profile = read("components/LocalProfile.jsx");
  expect(profile).toContain("validUsername");
  expect(profile).toContain("aria-invalid");
  expect(profile).toContain("disabled={pending || !ready}");
  expect(profile).toContain("Start saving my progress");
  expect(profile).toContain("Your profile, ");
  expect(profile).toContain("Choose a name to save progress on this device.");
  expect(profile).toContain("Your current guest progress will be kept.");
  expect(profile).toContain(
    "Guest progress from this session will not carry over.",
  );
  expect(profile).toContain(
    "An online backup is optional and can be added later.",
  );
  expect(profile).toContain("Continue playing");
  expect(profile).toContain("This profile stays on this device.");
});

test("only the equipped companion walks the roll screen", () => {
  const roll = read("components/RollExperience.jsx");

  expect(roll).toMatch(
    /session\.activePet\s*&&\s*session\.activePet\s*!==\s*"none"\s*\?\s*\[session\.activePet\]\s*:\s*\[\]/,
  );
  const shelf = read("components/PetShelf.jsx");
  expect(shelf).toMatch(/only one.*equipped/i);
});

test("a firing companion skill pins the companion to the number's corner", () => {
  const roll = read("components/RollExperience.jsx");

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
  const shelf = read("components/PetShelf.jsx");
  expect(shelf).toContain("pet-cage-door");
  expect(shelf).toContain("is-uncaging");
  expect(shelf).toContain("pet-cage-hanger");
  const css = read("pets.css");
  expect(css).toContain("@keyframes pet-uncage-door");
  expect(css).toContain("@keyframes pet-uncage-hop");

  const parade = read("components/PetParade.jsx");
  expect(parade).toContain("pet-arrival-cage");
  expect(read("pet-parade.css")).toContain("@keyframes pet-arrival-cage");
});

test("the roll animates each wallet bonus charge instead of showing a static extra line", () => {
  const roll = read("components/RollExperience.jsx");

  expect(roll).toContain("walletMultiplier(session, firedSkills, gameNow())");
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

  expect(styles).toContain(".header nav button.active,");
  expect(styles).toContain(".header nav button.active:hover");
  expect(styles).toContain("box-shadow: 0 2px var(--green)");

  expect(styles).toContain(".icon-button.active,");
  const main = read("main.jsx");
  expect(main).toContain('page === "about" ? "active" : ""');
  expect(main).toContain('page === "settings" ? "active" : ""');
});

test("skill ring icons render: the ring keeps its own svg class", () => {
  const bar = read("components/SkillBar.jsx");
  expect(bar).toContain('className="skill-ring-svg"');
  const css = read("skills.css");
  expect(css).toContain(".skill-ring-svg");
  expect(css).not.toContain(".skill-ring svg");
});

test("rebirth says nothing at all until the ladder unlocks", () => {
  const rebirth = read("components/Rebirth.jsx");
  expect(rebirth).toContain("rebirthUnlocked");
  expect(rebirth).toContain("if (!unlocked) return null;");
  expect(rebirth).not.toContain("rebirth-locked");
  expect(read("rebirth.css")).not.toContain(".rebirth-locked");
  expect(read("components/RebirthNav.jsx")).toContain(
    "if (!rebirthUnlocked(progress)) return null;",
  );

  expect(read("main.jsx")).toContain("rebirthVisible");
  expect(read("main.jsx")).toContain('page === "rebirth" && rebirthVisible');

  expect(read("components/About.jsx")).toContain("showsRebirth");

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
  await waitForApp(page);
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

  await page.goto("/rebirth");
  await waitForApp(page);
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
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "Rebirth", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /The ladder/ })).toBeVisible();

  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(4);
  await expect(page.locator(".rebirth-ladder > li.is-current")).toHaveCount(1);
  await expect(page.locator(".rebirth-ladder > li.is-faded")).toHaveCount(1);
  await expect(
    page.locator(".rebirth-ladder > li.is-faded .rebirth-rung-name"),
  ).toHaveText("#4");
  await expect(page.locator(".rebirth-reward")).toHaveCount(4);
  await expect(page.locator(".rebirth-reward-chip").first()).toContainText(
    "+2% EP",
  );

  await mutateSavedProgress(page, { rebirths: 1 });
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(5);
  await expect(
    page.locator(".rebirth-ladder > li.is-faded .rebirth-rung-name"),
  ).toHaveText("#5");

  await mutateSavedProgress(page, { rebirths: 2 });
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(6);
  await expect(
    page.locator(".rebirth-ladder > li.is-faded .rebirth-rung-name"),
  ).toHaveText("#6");

  await mutateSavedProgress(page, { rebirths: 3 });
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".rebirth-ladder > li")).toHaveCount(6);
  await expect(page.locator(".rebirth-ladder > li.is-faded")).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: /What a rebirth keeps/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /What it resets/ }),
  ).toBeVisible();

  await expect(
    page.getByText("Wait, but there is more...", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /prestige/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Prestige/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rebirth", exact: true }),
  ).toBeVisible();

  await mutateSavedProgress(page, { rebirths: 6 });
  await page.reload();
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "After the ladder: Prestige" }),
  ).toBeVisible();
  await expect(
    page.getByText("Wait, but there is more...", { exact: true }),
  ).toHaveCount(0);
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
  await waitForApp(page);
  const bar = page.locator(".skill-bar");
  await expect(bar).toBeVisible();

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

test("a skill family is one circle: the icon in the middle, every member a slice of that circle, each in its own colour", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    owned: [
      "skill-bay-1",
      "skill-bay-2",
      "surge",
      "reborn-drive",
      "reborn-tempo",
      "reborn-depth",
    ],
    skills: ["surge", "reborn-drive", "reborn-tempo", "reborn-depth"],
    equippedSkills: ["surge", "reborn-drive", "reborn-tempo", "reborn-depth"],
    pets: ["pebble"],
    activePet: "pebble",
    rebirths: 4,
    ultraRebirths: 1,
  });
  await page.goto("/");
  await waitForApp(page);
  const family = page.locator('[data-stack="rebirth"]');
  await expect(family).toBeVisible();

  await expect(family.locator(".skill-stack-ring")).toHaveCount(1);
  const count = Number(
    await family.locator(".skill-stack-count").textContent(),
  );
  expect(count).toBeGreaterThan(3);
  await expect(family.locator(".skill-stack-arc")).toHaveCount(count);

  await expect(
    family.locator(".skill-stack-ring .skill-stack-icon"),
  ).toBeVisible();

  const single = await page
    .locator(".skill-bar .skill-ring")
    .first()
    .boundingBox();
  const group = await family.locator(".skill-stack-ring").boundingBox();
  expect(Math.round(group.width)).toBe(Math.round(single.width));
  expect(Math.round(group.height)).toBe(Math.round(single.height));
  expect(
    await family
      .locator(".skill-stack-fill")
      .first()
      .evaluate((node) => getComputedStyle(node).strokeWidth),
  ).toBe("5px");
  const arcs = await family.locator(".skill-stack-arc").evaluateAll((nodes) =>
    nodes.map((node) => {
      const [track] = node.querySelectorAll("circle");
      return {
        radius: Number(track.getAttribute("r")),
        turn: node.getAttribute("transform"),
        dash: track.style.strokeDasharray,
        colour: getComputedStyle(node.querySelector(".skill-stack-fill"))
          .stroke,
        tint: [...node.classList].find((name) => name.startsWith("tint-")),
      };
    }),
  );

  const radii = arcs.map((arc) => arc.radius);
  expect(new Set(radii).size).toBe(1);
  expect(new Set(arcs.map((arc) => arc.turn)).size).toBe(arcs.length);

  const circumference = 2 * Math.PI * radii[0];

  const lengths = arcs.map((arc) => Number(arc.dash.split(/[\s,]+/)[0]));
  const used = lengths.reduce((sum, length) => sum + length, 0);
  expect(used).toBeLessThan(circumference);
  expect(used).toBeGreaterThan(circumference * 0.8);

  expect(arcs.every((arc) => arc.tint)).toBe(true);
  expect(new Set(arcs.map((arc) => arc.colour)).size).toBeGreaterThan(2);

  await family.hover();
  await expect(family.locator('[data-skill="reborn-drive"]')).toBeVisible();
  await expect(family.locator('[data-skill="reborn-depth"]')).toBeVisible();
});

test("the phone rack becomes a compact horizontal dock below the header", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    owned: ["surge", "twice"],
    skills: ["surge", "twice"],
    equippedSkills: ["surge", "twice"],
    skillCharge: { surge: 2, twice: 3 },
    pets: ["pebble"],
    activePet: "pebble",
    rebirths: 1,
  });
  const bar = page.locator(".skill-bar");
  const ring = page.locator('[data-skill="surge"] .skill-ring');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await waitForApp(page);
  await expect(bar).toBeVisible();
  const deskRing = await ring.boundingBox();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const phoneBar = await bar.boundingBox();
  const phoneRing = await ring.boundingBox();
  const header = await page.locator(".header").boundingBox();
  expect(phoneBar.x).toBeGreaterThanOrEqual(0);
  expect(phoneBar.x + phoneBar.width).toBeLessThanOrEqual(390);
  expect(phoneBar.y).toBeGreaterThanOrEqual(header.y + header.height);

  expect(phoneBar.height).toBeLessThanOrEqual(56);

  expect(phoneRing.width).toBeLessThan(deskRing.width);
  expect(phoneRing.width).toBeGreaterThan(24);

  const numberBox = await page.locator(".number-box").boundingBox();
  expect(phoneBar.y + phoneBar.height).toBeLessThan(numberBox.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
  await waitForApp(page);
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

  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(buffer.length).toBeGreaterThan(1000);
});

test("after a prestige the ladder teases Rollback, not a second Prestige", async ({
  page,
}) => {
  await seedProgress(page, {
    profile: testProfile,
    discovered: badgeIds.slice(0, 150),
    ultraRebirths: 1,
    rebirths: 2,
  });
  await page.goto("/rebirth");
  await waitForApp(page);
  await expect(page.locator('[data-teaser="rollback"]')).toBeVisible();
  await expect(page.locator('[data-teaser="prestige"]')).toHaveCount(0);
  await expect(
    page.getByText("Wait, but there is more...", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".rebirth-teaser-hint")).toContainText(
    "One last stage is still ahead.",
  );
});
