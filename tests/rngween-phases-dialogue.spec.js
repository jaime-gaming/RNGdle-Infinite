import fs from "node:fs";
import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockWorldNumbers } from "./helpers/world-random.js";
import { completedWorldRoll, savedWorld } from "./helpers/world-roll.js";
import {
  emptyProgress,
  applyProgress,
  parseAndRepairProgress,
} from "../src/progress.js";
import {
  WORLD_ZONES,
  WORLD_REVEAL_MS,
  emptyRngweenWorld,
} from "../src/rngween-world-zones.js";
import {
  WORLD_BADGES,
  WORLD_MINI_RANGES,
  worldPhaseComplete,
  worldMiniSummary,
} from "../src/rngween-world-badges.js";
import { randomWorldMiniNumber } from "../src/rngween-world-random.js";
import { RNGWEEN_MISSIONS, RNGWEEN_AURAS } from "../src/rngween.js";
import { reaperDialogue } from "../src/rngween-reaper.js";

const at = Date.UTC(2026, 9, 26, 12);
const account = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  ...patch,
});
const words = (values) => {
  let index = 0;
  return {
    getRandomValues(array) {
      array[0] = values[index++];
      return array;
    },
  };
};
async function finishLine(dialog) {
  // Tapping the speech text finishes the typewriter.
  const text = dialog.locator("[data-typing]");
  if ((await text.getAttribute("data-typing")) === "true") await text.click();
  await expect(dialog.locator("[data-typing]")).toHaveAttribute(
    "data-typing",
    "false",
  );
}
async function scene(page) {
  await page
    .getByRole("button", { name: "Talk to The Reaper", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "The Reaper", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("four numbered World phases map to the original event auras without replacing their missions", () => {
  expect(
    WORLD_ZONES.map((phase) => [
      phase.phase,
      phase.id,
      phase.auraId,
      phase.max,
    ]),
  ).toEqual([
    [1, "pumpkin-patch", "jack-o-glow", 9],
    [2, "graveyard", "phantom-veil", 99],
    [3, "haunted-house", "witchfire", 999],
    [4, "valley", "blood-moon", 9999],
  ]);
  expect(
    RNGWEEN_MISSIONS.map((mission) => [
      mission.id,
      mission.goal,
      mission.pumpkoins,
    ]),
  ).toEqual([
    ["jack-o-glow", 200, 100],
    ["phantom-veil", 40, 150],
    ["witchfire", 5000000, 200],
    ["blood-moon", 18, 150],
  ]);
  expect(Object.values(WORLD_BADGES).flat()).toHaveLength(39);
});

test("Pumpkin Patch samples every number uniformly with rejection, never a choice or a changed ordinary random source", () => {
  expect(randomWorldMiniNumber("pumpkin-patch", words([0xffffffff, 0]))).toBe(
    1,
  );
  expect(randomWorldMiniNumber("pumpkin-patch", words([8]))).toBe(9);
  const counts = Array(9).fill(0),
    provider = words(Array.from({ length: 900 }, (_, index) => index));
  for (let i = 0; i < 900; i++)
    counts[randomWorldMiniNumber("pumpkin-patch", provider) - 1]++;
  expect(counts).toEqual(Array(9).fill(100));
  expect(WORLD_REVEAL_MS).toEqual([10000, 8000, 5000, 2000]);
});

test("all Pumpkin Patch milestones are persistent collection goals, not an aura, EP, key fragment or ordinary task reward", () => {
  const initial = account();
  let p = initial;
  for (let number = 1; number <= 9; number++)
    p = completedWorldRoll(p, {
      zone: "pumpkin-patch",
      number,
      at: at + number * 11000,
    });
  const stats = p.rngweenLimited.world.mini["pumpkin-patch"];
  expect(worldMiniSummary("pumpkin-patch", stats)).toMatchObject({
    rolls: 9,
    unique: 8,
    score: 100,
  });
  expect(worldPhaseComplete("pumpkin-patch", stats)).toBe(true);
  for (const field of [
    "owned",
    "balance",
    "totalEarned",
    "history",
    "tasks",
    "pets",
    "skills",
    "skillCharge",
    "receipts",
  ])
    expect(p[field]).toEqual(initial[field]);
  expect(p.rngweenLimited.pumpkoins).toBe(0);
  expect(p.rngweenLimited.world.fragments).toEqual({
    graveyard: false,
    "haunted-house": false,
  });
  expect(parseAndRepairProgress(JSON.stringify(p)).repairs).toEqual([]);
});

for (const zone of ["graveyard", "haunted-house", "valley"])
  test(`a three-phase save gains an empty Pumpkin Patch without changing its committed ${zone} result or known ownership`, () => {
    let p = account({
      owned: ["starfall", "phantom-veil"],
      equipped: "starfall",
    });
    p.rngweenLimited.bought = ["rngween-world-key"];
    p = completedWorldRoll(p, { zone: "graveyard", number: 66, at });
    p = applyProgress(p, {
      type: "rngween-world-roll",
      zone,
      number: zone === "valley" ? 6666 : zone === "haunted-house" ? 666 : 66,
      expectedCount: 0,
      at: at + 11000,
    });
    const pending = p.rngweenLimited.world.pending;
    delete p.rngweenLimited.world.rounds["pumpkin-patch"];
    delete p.rngweenLimited.world.mini["pumpkin-patch"];
    const fixed = parseAndRepairProgress(JSON.stringify(p));
    expect(fixed.repairs).toEqual([]);
    expect(fixed.progress.rngweenLimited.world.pending).toEqual(pending);
    expect(fixed.progress.rngweenLimited.world.mini.graveyard).toEqual(
      p.rngweenLimited.world.mini.graveyard,
    );
    expect(
      fixed.progress.rngweenLimited.world.mini["pumpkin-patch"].rolls,
    ).toBe(0);
    expect(fixed.progress.owned).toEqual(p.owned);
    expect(fixed.progress.equipped).toBe("starfall");
  });

test("the Reaper's four phase and aura scripts read real progress, preserve the original trials and grant nothing", () => {
  const p = account(),
    before = JSON.stringify(p);
  for (const phase of WORLD_ZONES) {
    const dialogue = reaperDialogue(p, at, `aura:${phase.id}`);
    expect(dialogue.phaseId).toBe(phase.id);
    expect(dialogue.aura.id).toBe(phase.auraId);
    expect(dialogue.lines.join(" ")).toContain("October 25–31");
    // The aura is earned in Tasks, never in the World.
    expect(dialogue.lines.join(" ")).toContain("isn't earned in here");
    expect(dialogue.lines.join(" ")).toContain("claim it in Tasks");
  }
  expect(JSON.stringify(p)).toBe(before);
});

test("Reaper artwork improves the original vector silhouette rather than loading generated portrait imagery", () => {
  const source = fs.readFileSync("src/components/ReaperFigure.jsx", "utf8");
  expect(source).toContain('viewBox="0 0 180 200"');
  expect(source).toContain("M143 34v148");
  expect(source).toContain("reaper-lantern");
  expect(source).toContain("reaper-pencil-strokes");
  expect(source).not.toMatch(/<image|<img|\.png|\.jpe?g|\.webp/);
});

test("the four phases show distinct aura previews while the real result uses only the owned equipped skin", async ({
  page,
}) => {
  await mockSeasonClock(page, at);
  await seedProgress(page, { owned: ["starfall"], equipped: "starfall" });
  await page.goto("/rngween-world");
  await expect(page.locator("[data-world-zone]")).toHaveCount(4);
  for (const phase of WORLD_ZONES) {
    await page.locator(`[data-world-zone="${phase.id}"]`).click();
    await expect(page.locator("[data-phase-aura]")).toHaveAttribute(
      "data-phase-aura",
      phase.auraId,
    );
    await expect(page.locator(".world-number-box")).toHaveAttribute(
      "data-cosmetic",
      "starfall",
    );
    await expect(page.locator(".world-aura-source-note")).toContainText(
      "World rolls do not count",
    );
  }
  expect((await savedWorld(page)).owned).toEqual(["starfall"]);
});

test("the sketch scene types its dialogue before enabling the reply buttons, and never mutates gameplay", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockSeasonClock(page, at);
  await seedProgress(page);
  await page.goto("/rngween-world");
  const before = await savedWorld(page);
  const dialog = await scene(page);
  await expect(
    dialog.locator(".reaper-figure-sketch[data-reaper-art=original-vector]"),
  ).toHaveCount(1);
  await expect(dialog.locator("[data-typing]")).toHaveAttribute(
    "data-typing",
    "true",
  );
  const replies = dialog.getByLabel("Your reply", { exact: true });
  await expect(replies).toHaveAttribute("data-reply-ready", "false");
  await expect(replies.getByRole("button").first()).toBeDisabled();
  // No free-text input: the player picks from a few short buttons.
  await expect(dialog.locator("input, textarea")).toHaveCount(0);
  const count = () =>
    dialog
      .locator(".reaper-dialogue-text > p")
      .evaluate((node) => node.textContent.length);
  const first = await count();
  await page.clock.runFor(260);
  expect(await count()).toBeGreaterThan(first);
  await finishLine(dialog);
  await expect(replies).toHaveAttribute("data-reply-ready", "true");
  await expect(replies.getByRole("button").first()).toBeEnabled();
  const buttons = await replies.getByRole("button").count();
  expect(buttons).toBeGreaterThanOrEqual(4);
  expect(buttons).toBeLessThanOrEqual(6);
  await dialog
    .getByRole("button", { name: "What about the auras?", exact: true })
    .click();
  await finishLine(dialog);
  await expect(dialog).toContainText("four auras");
  await dialog
    .getByRole("button", { name: "What is Hexbound?", exact: true })
    .click();
  await finishLine(dialog);
  await expect(dialog).toContainText("6666");
  expect(await savedWorld(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Talk to The Reaper", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});

test("reduced motion presents the whole dialogue and a still portrait without changing a saved number's deadline", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSeasonClock(page, at);
  await mockWorldNumbers(page, { "pumpkin-patch": [6] });
  await seedProgress(page);
  await page.goto("/rngween-world");
  await page.getByRole("button", { name: /Roll in Pumpkin Patch/ }).click();
  await expect
    .poll(
      async () => (await savedWorld(page)).rngweenLimited.world.pending?.number,
    )
    .toBe(6);
  const pending = (await savedWorld(page)).rngweenLimited.world.pending;
  const dialog = await scene(page);
  await expect(dialog.locator("[data-typing]")).toHaveAttribute(
    "data-typing",
    "false",
  );
  expect(
    await dialog
      .locator(".reaper-lantern-aureole")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.clock.fastForward(1000);
  expect((await savedWorld(page)).rngweenLimited.world.pending).toEqual(
    pending,
  );
  expect(pending.revealsAt - pending.startedAt).toBe(10000);
  expect(
    (await savedWorld(page)).rngweenLimited.world.mini["pumpkin-patch"].rolls,
  ).toBe(0);
});

test("the original aura mission remains claimable from Tasks, not from clearing a themed World phase", async ({
  page,
}) => {
  const p = account();
  p.tasks.rngween.counts.rolls = 200;
  await mockSeasonClock(page, at);
  await seedProgress(page, p);
  await page.goto("/rngween-world");
  await page.getByRole("button", { name: "View aura mission" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page
    .getByRole("button", { name: "Collect Jack-o'-Glow", exact: true })
    .click();
  await expect
    .poll(async () => (await savedWorld(page)).owned.includes("jack-o-glow"))
    .toBe(true);
  const earned = await savedWorld(page);
  expect(earned.rngweenLimited.pumpkoins).toBe(100);
  expect(earned.rngweenLimited.world.mini["pumpkin-patch"].rolls).toBe(0);
  await page.reload();
  expect((await savedWorld(page)).rngweenLimited.pumpkoins).toBe(100);
});

for (const width of [340, 390, 768, 1440])
  test(`four decorated phases and the Reaper reply scene fit ${width}px in both themes`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockSeasonClock(page, at);
    await seedProgress(page);
    for (const theme of ["light", "dark"]) {
      await page.addInitScript(
        (value) => localStorage.setItem("rng-theme", value),
        theme,
      );
      await page.goto("/rngween-world");
      for (const phase of WORLD_ZONES) {
        await page.locator(`[data-world-zone="${phase.id}"]`).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const dialog = await scene(page);
        await expect(dialog.locator(".reaper-sketch-paper")).toBeVisible();
        expect(
          await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        await dialog
          .getByRole("button", {
            name: "How do I get into the Valley?",
            exact: true,
          })
          .click();
        await expect(dialog).toContainText("Two fragments make a key");
        await page.keyboard.press("Escape");
      }
    }
  });
