// Regenerate the images used by README.md. They are real screenshots of the
// running game (no mockups), taken from a seeded local save so the collection,
// the shop and the profile have something to show.
//
//   npm run dev            # or any server on 127.0.0.1:5173
//   CHROMIUM_PATH=/path/to/chrome node tools/screenshots.mjs
//
// Any Chromium/Chrome binary works; the screenshots land in media/.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { AUTO_ROLL_KEY } from "../src/auto-roll.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { shopProducts } from "../src/shop-data.js";
import { PETS } from "../src/pets.js";

const BASE = process.env.SCREENSHOT_BASE ?? "http://127.0.0.1:5173";
const OUT = new URL("../media/", import.meta.url);
const ids = allBadgeMetadata.map((badge) => badge.id);
const owned = [
  "quickwind-1",
  "quickwind-2",
  "clockwork-1",
  "clockwork-2",
  "flywheel",
  "starfall",
  "aurora",
  "auto-roll",
  "offline-roller",
  "offline-clock-1",
  "surge",
  "trail",
  "twice",
  "bedrock",
  "skill-bay-1",
];

function seededSave() {
  const at = Date.UTC(2026, 6, 4, 18, 30, 0);
  const history = [];
  const numbers = [812044, 40219, 999999, 1337, 656565, 480123, 771912, 200001];
  numbers.forEach((number, index) => {
    const ep = [12400, 620, 512000, 40, 88000, 260, 4300, 31000][index];
    const tier = [
      "rare",
      "common",
      "godly",
      "trash",
      "anomaly",
      "trash",
      "uncommon",
      "epic",
    ][index];
    history.push({
      id: `shot-${index}`,
      type: "roll",
      at: at + index * 95000,
      number,
      tier,
      ep,
      tier,
      badges: ids.slice(index * 8, index * 8 + 4),
      ...(index === 4 ? { flywheel: "boost" } : {}),
      ...(index === 6 ? { skills: ["surge"] } : {}),
    });
  });
  history.push({
    id: "shot-pet",
    type: "pet",
    at: at + 200000,
    productId: "moth",
    name: "Lumen Moth",
  });
  history.push({
    id: "shot-buy",
    type: "purchase",
    at: at + 300000,
    productId: "aurora",
    name: "Aurora Veil",
    ep: 200000,
  });
  history.push({
    id: "shot-rebirth",
    type: "rebirth",
    at: at + 400000,
    count: 1,
    skill: "reborn-drive",
  });
  return {
    ...emptyProgress(),
    profile: { id: "shot-profile", username: "LuckyOtter41", createdAt: at },
    balance: 2412500,
    totalEarned: 8430000,
    discovered: ids.slice(0, 158),
    owned,
    equipped: "aurora",
    equippedSkills: ["surge", "twice"],
    skillCharge: { surge: 6, twice: 3, trail: 2 },
    flywheelCharge: 3,
    pets: PETS.slice(0, 6).map((pet) => pet.id),
    activePet: "jelly",
    skills: ["surge", "trail", "twice", "bedrock", "reborn-drive"],
    rebirths: 1,
    goalId: "quickwind-3",
    history,
  };
}

async function seed(page) {
  const save = seededSave();
  await page.addInitScript(
    ([key, value, autoRollPrefix]) => {
      localStorage.setItem(key, value);
      // Auto-Roll is deliberately left off and its switch is hidden, so the
      // pictures show the roll itself rather than a settings card.
      localStorage.removeItem(
        `${autoRollPrefix}:${JSON.parse(value).profile.id}`,
      );
      window.__hideAutoRoll = true;
    },
    [PROGRESS_KEY, JSON.stringify(save), AUTO_ROLL_KEY],
  );
}

async function hideAutoRoll(page) {
  await page.addStyleTag({
    content: ".auto-roll-control { display: none !important; }",
  });
}

async function shot(page, name, options = {}) {
  await page.screenshot({
    path: new URL(`${name}.png`, OUT).pathname,
    ...options,
  });
  console.log(`media/${name}.png`);
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? {
        executablePath: process.env.CHROMIUM_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
      }
    : {},
);
await fs.mkdir(OUT, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  // 1. The roll screen, as it loads, with a charged circle explaining itself
  //    on hover (the rack has no text of its own).
  await seed(page);
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".generate");
  await hideAutoRoll(page);
  await page.locator('.skill-slot[data-skill="surge"]').hover();
  await page.waitForTimeout(700);
  await shot(page, "roll");

  // 2. A finished roll: reduced motion settles it instantly, and the worker is
  //    pinned to one number so the picture is reproducible.
  await page.route("**/src/roll.worker.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `const testWords=[812044]; let testWord=0;
        Object.defineProperty(crypto,'getRandomValues',{value(array){array[0]=testWords[testWord++ % testWords.length];return array;}});\n${await response.text()}`,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await page.waitForSelector('.roll-experience[data-phase="complete"]', {
    timeout: 20000,
  });
  await page.waitForTimeout(1200);
  await hideAutoRoll(page);
  await shot(page, "result");

  // 3. The skill rack, close up, with a tooltip open on the armed skill.
  await hideAutoRoll(page);
  const rack = page.locator(".skill-bar");
  await rack.waitFor({ state: "visible" });
  await page.locator('.skill-slot[data-skill="flywheel"]').hover();
  await page.waitForTimeout(500);
  await shot(page, "skills", { clip: await rack.boundingBox() });

  // 4. The shop, from the jump bar down through the skills shelf.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/shop`);
  await page.waitForSelector(".shop-jump");
  await hideAutoRoll(page);
  await page.waitForTimeout(700);
  await shot(page, "shop");

  // 5. The rebirth ladder, on its own page.
  await page.goto(`${BASE}/rebirth`);
  await page.waitForSelector(".rebirth-option");
  await page.waitForTimeout(700);
  await shot(page, "rebirth");

  // 6. The profile page, with the derived history and the export button. A
  //    taller viewport keeps the whole page in one frame.
  await page.setViewportSize({ width: 1280, height: 1500 });
  await page.goto(`${BASE}/profile`);
  await page.waitForSelector(".profile-history");
  await page.waitForTimeout(600);
  await shot(page, "profile", { fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 7. The changelog.
  await page.goto(`${BASE}/changelog`);
  await page.waitForTimeout(700);
  await shot(page, "changelog");
  await page.close();
} finally {
  await browser.close();
}
