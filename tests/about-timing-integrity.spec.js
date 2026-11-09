import { test, expect } from "@playwright/test";
import { waitForApp } from "./helpers/app.js";
import fs from "node:fs";
import { PAGES, pathForPage, validPage } from "../src/router.js";
import {
  parseProgress,
  parseAndRepairProgress,
  emptyProgress,
} from "../src/progress.js";
import { rollSettings, shopProducts } from "../src/shop-data.js";
import { cooldownLabel, displayedCooldownSeconds } from "../src/cooldown.js";
import { POPULATION } from "../src/probability.js";
import { PETS } from "../src/pets.js";
import { gameNow } from "../src/game-clock.js";

const main = fs.readFileSync("src/main.jsx", "utf8");

const about = fs.readFileSync("src/components/About.jsx", "utf8");

test("the help icon opens a real About page that is not a top navigation entry", () => {
  expect(validPage("about")).toBe("about");
  expect(pathForPage("about")).toBe("/about");

  expect(main).toContain('icon-button help-button ${page === "about"');
  expect(main).toMatch(/help-button[\s\S]{0,200}navigate\("about"\)/);
  expect(main).toContain('{page === "about" && (');

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

test("the home screen has no generic account banner; account choices stay on the profile page", () => {
  const cloudStyles = fs.readFileSync("src/cloud-account.css", "utf8");
  const cloudAccount = fs.readFileSync(
    "src/components/CloudAccount.jsx",
    "utf8",
  );
  expect(main).not.toContain('className="play-choice-banner"');
  expect(cloudStyles).not.toContain(".play-choice-banner");

  expect(main).toContain('page === "profile" && (');
  expect(main).toContain("<CloudAccount");
  expect(cloudAccount).toContain('data-testid="continue-locally"');
  expect(cloudAccount).toContain("Create an account");

  expect(main).toContain('className="cloud-choice-banner"');
  expect(main).toContain('className="auth-password-banner"');
});

test("About is concise, current, and uses figures from the game", () => {
  for (const cls of [
    "about-intro",
    "about-steps",
    "about-topic",
    "about-fair",
    "about-actions",
    "about-footnote",
  ])
    expect(about).toContain(cls);

  expect(about.match(/^\s+title: "/gm)?.length ?? 0).toBe(6);
  for (const symbol of ["POPULATION", "PETS.length", "gameUrlForLocation"])
    expect(about).toContain(symbol);
  expect(about).not.toContain(String(POPULATION));
  expect(about).not.toMatch(/\b45 seconds|\b60 seconds/);
  expect(about).toContain(
    "Give your local profile a name and your progress stays on this device.",
  );
  expect(about).toContain(
    "A Cloud Account is optional if you want to continue on another device.",
  );
  expect(about).toContain("Settings → Restore save");
  expect(PETS.length).toBeGreaterThan(0);
  expect(about.toLowerCase().replace(/\s+/g, " ")).toContain(
    "nothing you buy changes the odds",
  );
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

  for (const forged of [
    { rollMS: max.rollMS, cooldownMS: max.cooldownMS },
    { rollMS: max.rollMS },
    { cooldownMS: max.cooldownMS },
  ]) {
    const { progress, repairs } = parseAndRepairProgress(
      save([], pending(forged)),
    );
    expect(progress.pendingRoll).toBeNull();
    expect(repairs.join(" ")).toMatch(/committed roll/);
  }

  expect(parseProgress(save([], pending({}))).pendingRoll.rollMS).toBe(45000);
  expect(
    parseProgress(save(["quickwind-1"], pending({ rollMS: 35000 }))).pendingRoll
      .rollMS,
  ).toBe(35000);

  expect(parseProgress(save(fastest, pending({}))).pendingRoll.cooldownMS).toBe(
    60000,
  );

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

  for (const now of [startedAt, startedAt + 10000, startedAt + 45000])
    expect(displayedCooldownSeconds(window, deadline, now)).toBe(60);
  expect(displayedCooldownSeconds(window, deadline, startedAt + 75000)).toBe(
    30,
  );
  expect(displayedCooldownSeconds(window, deadline, deadline)).toBe(0);

  for (const past of [1, 500, 1500, 4000, 60000, 864e5]) {
    const shown = displayedCooldownSeconds(window, deadline, deadline + past);
    expect(shown).toBe(0);
    expect(Boolean(shown)).toBe(false);
  }
  expect(displayedCooldownSeconds(null, deadline, deadline + 4000)).toBe(0);

  expect(displayedCooldownSeconds(window, deadline, deadline - 50)).toBe(1);

  expect(displayedCooldownSeconds(null, deadline, startedAt)).toBe(105);
  expect(
    displayedCooldownSeconds({ startsAt: 0, endsAt: 5 }, deadline, startedAt),
  ).toBe(105);

  expect(cooldownLabel(window, deadline, startedAt)).toBe("COOLDOWN IN");
  expect(cooldownLabel(window, deadline, startedAt + 30000)).toBe(
    "COOLDOWN IN",
  );
  expect(cooldownLabel(window, deadline, window.startsAt)).toBe("NEXT ROLL IN");
  expect(cooldownLabel(window, deadline, startedAt + 75000)).toBe(
    "NEXT ROLL IN",
  );

  expect(cooldownLabel(null, deadline, startedAt)).toBe("NEXT ROLL IN");

  const roll = fs.readFileSync("src/components/RollExperience.jsx", "utf8");
  expect(roll).toContain("cooldownLabel(");
  expect(roll).not.toContain("NEXT ROLL IN");
  expect(roll).toContain('"REVEAL IN"');
});

test("the reveal is paced by the hardened clock, not by a replaceable timer", () => {
  const source = fs.readFileSync("src/components/RollExperience.jsx", "utf8");
  const reveal = source.slice(
    source.indexOf("if (!run || finishedRun.current === run.id) return;"),
    source.indexOf("mounted.current = true;"),
  );

  const code = reveal.replace(/\/\/.*$/gm, "");
  expect(code).toContain("gameNow()");
  expect(code).not.toContain("performance.now()");
});

test("a committed roll's own deadline cannot be truncated away by an edited save", () => {
  const committed = pending({});
  const honest = committed.startedAt + committed.rollMS + committed.cooldownMS;
  const saved = (cooldownUntil) =>
    parseProgress(
      JSON.stringify({
        ...emptyProgress(),
        pendingRoll: committed,
        cooldownUntil,
      }),
    );

  for (const forged of [0, 1, committed.startedAt, honest - 1])
    expect(saved(forged).cooldownUntil).toBe(honest);

  expect(saved(honest).cooldownUntil).toBe(honest);
  expect(saved(honest + 500000).cooldownUntil).toBe(honest + 500000);

  expect(saved(0).cooldownWindow).toEqual({
    startsAt: committed.startedAt + committed.rollMS,
    endsAt: honest,
  });

  expect(
    parseProgress(JSON.stringify({ ...emptyProgress(), cooldownUntil: 205000 }))
      .cooldownUntil,
  ).toBe(205000);
});
