import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { PAGES, pathForPage, validPage } from "../src/router.js";
import { parseProgress, emptyProgress } from "../src/progress.js";
import { rollSettings, shopProducts } from "../src/shop-data.js";
import { displayedCooldownSeconds } from "../src/cooldown.js";
import { POPULATION } from "../src/probability.js";
import { BADGE_TOTAL } from "../src/rebirth.js";
import { PETS } from "../src/pets.js";
import { gameNow } from "../src/game-clock.js";

const main = fs.readFileSync("src/main.jsx", "utf8");
// The page pulls its figures from the game modules, so the source is checked
// directly rather than rendered: the test runner has no DOM or CSS loader.
const about = fs.readFileSync("src/components/About.jsx", "utf8");

test("the help icon opens a real About page that is not a top navigation entry", () => {
  expect(validPage("about")).toBe("about");
  expect(pathForPage("about")).toBe("/about");
  // Reached from the ? icon button, never from the main nav list.
  expect(main).toContain('className="icon-button help-button"');
  expect(main).toMatch(/help-button[\s\S]{0,200}navigate\("about"\)/);
  expect(main).toContain('{page === "about" && (');
  // The old single-block help modal is gone.
  expect(main).not.toContain('modal === "help"');
  expect(main).not.toContain('setModal("help")');
  const navSource = main.slice(
    main.indexOf("<nav"),
    main.indexOf("</nav>") + 6,
  );
  for (const page of ["shop", "badges", "history"]) {
    expect(PAGES).toContain(page);
    expect(navSource).toContain(`"${page}"`);
  }
  expect(navSource).not.toContain('"about"');
});

test("About is grouped content whose figures come from the game modules", () => {
  // Structure: numbered steps plus topic cards, not one wall of prose.
  for (const cls of [
    "about-intro",
    "about-steps",
    "about-topic",
    "about-fair",
    "about-actions",
    "about-footnote",
  ])
    expect(about).toContain(cls);
  expect(about.match(/^\s+title: "/gm)?.length ?? 0).toBeGreaterThanOrEqual(7);
  // Figures are interpolated from the modules, never typed as literals that
  // could drift from the rules they describe.
  for (const symbol of [
    "POPULATION",
    "BADGE_TOTAL",
    "PETS.length",
    "PET_DROP_CHANCE",
    "BASE_ROLL_MS",
    "BASE_COOLDOWN_MS",
    "GAME_URL",
  ])
    expect(about).toContain(symbol);
  expect(about).not.toContain(String(POPULATION));
  expect(about).not.toMatch(new RegExp(`\\b${BADGE_TOTAL} badges`));
  expect(about).not.toMatch(/\b45 seconds|\b60 seconds/);
  expect(PETS.length).toBeGreaterThan(0);
  // The fairness promise must state what purchases cannot do.
  expect(about.toLowerCase()).toContain("no purchase");
});

const pending = (overrides) => ({
  id: "committed",
  number: 604827,
  startedAt: 1000,
  rollMS: 45000,
  cooldownMS: 60000,
  ...overrides,
});
const save = (owned, pendingRoll) =>
  JSON.stringify({
    ...emptyProgress(),
    owned,
    pendingRoll,
    cooldownUntil: pendingRoll.startedAt + pendingRoll.rollMS + 600000,
  });

test("a committed roll can never be faster than the upgrades the save has paid for", () => {
  const fastest = shopProducts
    .filter((p) => ["roll", "cooldown"].includes(p.kind))
    .map((p) => p.id);
  const max = rollSettings(fastest);
  // Forged snapshots on an upgrade-free profile are rejected.
  for (const forged of [
    { rollMS: max.rollMS, cooldownMS: max.cooldownMS },
    { rollMS: max.rollMS },
    { cooldownMS: max.cooldownMS },
  ])
    expect(() => parseProgress(save([], pending(forged)))).toThrow(
      /do not match your upgrades/,
    );
  // Honest snapshots, at or below the paid-for speed, survive.
  expect(parseProgress(save([], pending({}))).pendingRoll.rollMS).toBe(45000);
  expect(
    parseProgress(save(["quickwind-1"], pending({ rollMS: 35000 }))).pendingRoll
      .rollMS,
  ).toBe(35000);
  // Buying an upgrade mid-roll must not invalidate the roll in flight.
  expect(parseProgress(save(fastest, pending({}))).pendingRoll.cooldownMS).toBe(
    60000,
  );
  // A genuine Flywheel boost may still commit a zero cooldown.
  expect(
    parseProgress(
      save(["flywheel"], pending({ cooldownMS: 0, flywheel: "boost" })),
    ).pendingRoll.cooldownMS,
  ).toBe(0);
});

test("the clock only moves forward and ignores timing functions reassigned after load", () => {
  const realDate = Date.now;
  const realPerf = performance.now;
  const before = gameNow();
  try {
    Date.now = () => 0;
    performance.now = () => 0;
    expect(gameNow()).toBeGreaterThanOrEqual(before);
    Date.now = () => 8.64e15;
    performance.now = () => 8.64e15;
    expect(gameNow()).toBeLessThan(before + 60000);
  } finally {
    Date.now = realDate;
    performance.now = realPerf;
  }
  expect(gameNow()).toBeGreaterThanOrEqual(before);
});

test("the countdown displays the cooldown alone while the wait itself is unchanged", () => {
  const startedAt = 1000;
  const window = { startsAt: startedAt + 45000, endsAt: startedAt + 105000 };
  const deadline = window.endsAt;
  // Throughout the reveal it holds at the full cooldown, not reveal + cooldown.
  for (const now of [startedAt, startedAt + 10000, startedAt + 45000])
    expect(displayedCooldownSeconds(window, deadline, now)).toBe(60);
  expect(displayedCooldownSeconds(window, deadline, startedAt + 75000)).toBe(
    30,
  );
  expect(displayedCooldownSeconds(window, deadline, deadline)).toBe(0);
  // Legacy or mismatched saves fall back to the exact remaining time.
  expect(displayedCooldownSeconds(null, deadline, startedAt)).toBe(105);
  expect(
    displayedCooldownSeconds({ startsAt: 0, endsAt: 5 }, deadline, startedAt),
  ).toBe(105);
});
