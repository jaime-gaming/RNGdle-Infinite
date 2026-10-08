import { test, expect } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { groupResultBadges, formatEP } from "../src/roll-data.js";
import { buildRevealTimeline } from "../src/roll-timeline.js";

// A draw skill spends several ordinary draws and keeps the best. This is the
// screen that says so: one panel per draw, filling the screen behind visible
// dividing lines, every draw rolling its digits and earning its badges in the
// open, and the best one taking the centre behind a grey filter that lifts
// under the pointer.

// Four numbers, none of which reaches Bedrock's 25,000 EP floor, so the skill
// spends its whole budget of four draws and keeps the best of them.
const DRAWS = [88125, 375660, 861456, 90750];
const KEPT = 90750;
const REVEAL_MS = 10000;

const seed = {
  owned: [
    "bedrock",
    "quickwind-1",
    "quickwind-2",
    "quickwind-3",
    "quickwind-4",
  ],
  skills: ["bedrock"],
  equippedSkills: ["bedrock"],
  skillCharge: { bedrock: 6 },
};

const scored = new Map(DRAWS.map((number) => [number, evaluate(number)]));
const keptEP = Math.max(...DRAWS.map((number) => scored.get(number).totalEP));

async function startSplitRoll(page, overrides = {}) {
  await mockRandom(page, overrides.draws ?? DRAWS);
  await seedProgress(page, overrides.seed ?? seed);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".draw-stage")).toBeVisible();
}

// The reveal only moves when the clock does, and it only reads its clock at its
// own cues, so a test walks the clock forward in small steps instead of
// guessing one jump that lands on a beat.
async function runUntil(page, ready, limit = 60) {
  for (let step = 0; step < limit; step++) {
    if (await page.evaluate(ready)) return true;
    await page.clock.runFor(250);
  }
  return page.evaluate(ready);
}

test("every draw gets its own quadrant, divided by visible lines", async ({
  page,
}) => {
  await startSplitRoll(page);
  await expect(page.locator(".draw-panel")).toHaveCount(DRAWS.length);
  // The dividing lines are real space the grid leaves between panels, and the
  // geometry below only means anything once that stylesheet is in place.
  await expect(page.locator(".draw-grid")).toHaveCSS("column-gap", "2px");
  await expect(page.locator(".draw-grid")).toHaveCSS("row-gap", "2px");
  const panels = await page.locator(".draw-panel").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }),
  );
  // Two columns, two rows: the screen is shared, not stacked in a list.
  expect(new Set(panels.map((p) => Math.round(p.x))).size).toBe(2);
  expect(new Set(panels.map((p) => Math.round(p.y))).size).toBe(2);
  // Dividing lines: a real, visible gap between neighbours, both ways.
  expect(Math.round(panels[1].x - (panels[0].x + panels[0].w))).toBe(2);
  expect(Math.round(panels[2].y - (panels[0].y + panels[0].h))).toBe(2);
  // The takeover starts under the header and covers what is left of the
  // viewport, so no panel is pushed off the screen.
  const header = await page.locator(".header").boundingBox();
  const viewport = page.viewportSize();
  expect(panels[0].y).toBeCloseTo(header.y + header.height + 2, 0);
  expect(panels.at(-1).y + panels.at(-1).h).toBeLessThanOrEqual(
    viewport.height + 1,
  );
  for (const panel of panels) expect(panel.w).toBeGreaterThan(100);
});

test("each quadrant rolls its own digits and earns its own badges", async ({
  page,
}) => {
  await startSplitRoll(page);
  // Digits land on the same clock in every panel.
  expect(
    await runUntil(page, () => {
      const stage = document.querySelector(".draw-stage");
      return (
        !!stage &&
        [...stage.querySelectorAll(".draw-digit.is-scrambling")].length === 0
      );
    }),
  ).toBe(true);
  const digits = await page
    .locator(".draw-panel .draw-digits")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent.replace(/\s/g, "")));
  expect(digits).toEqual(DRAWS.map(String));
  // With the digits down, every panel states what its number was worth.
  await expect(page.locator(".draw-ep.is-known")).toHaveCount(DRAWS.length);
  const eps = await page
    .locator(".draw-panel .draw-ep")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent));
  expect(eps).toEqual(
    DRAWS.map((n) => `${formatEP(scored.get(n).totalEP)} EP`),
  );
  // Badges arrive in every panel at once — including in the draws that are
  // about to be discarded — and the decision waits for them.
  expect(
    await runUntil(page, () => {
      const panels = [...document.querySelectorAll(".draw-panel")];
      return (
        panels.length > 0 &&
        panels.every((p) => p.querySelectorAll(".draw-badge").length > 0)
      );
    }),
  ).toBe(true);
  await expect(page.locator(".draw-stage")).not.toHaveClass(/is-decided/);
});

test("the best draw takes the centre behind a grey filter the pointer lifts", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(
    await runUntil(page, () =>
      document.querySelector(".draw-stage")?.classList.contains("is-decided"),
    ),
  ).toBe(true);
  await expect(page.locator(".draw-winner")).toBeVisible();
  // The winner is the draw that scored the most EP, stated in words.
  await expect(page.locator(".draw-winner-ep")).toHaveText(
    `${formatEP(keptEP)} EP`,
  );
  await expect(page.locator(".draw-winner-kicker")).toContainText("Best of 4");
  await expect(
    page.locator(".draw-panel.is-winner .draw-panel-tag"),
  ).toHaveText("Best");
  await expect(page.locator(".draw-panel.is-out").first()).toContainText(
    "Discarded",
  );
  // Grey until the pointer is over it: the discarded draws are still there,
  // just not in colour.
  const grid = page.locator(".draw-grid");
  await expect(grid).toHaveCSS("filter", "grayscale(1) brightness(0.92)");
  await expect(page.locator(".draw-winner")).toHaveCSS(
    "filter",
    "grayscale(0.55)",
  );
  const box = await page.locator(".draw-winner").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 4);
  await page.waitForTimeout(900);
  await expect(page.locator(".draw-stage")).toHaveClass(/is-peeking/);
  await expect(grid).toHaveCSS("filter", "grayscale(0) brightness(1)");
  // The discarded draws stay readable underneath, not hidden.
  await expect(page.locator(".draw-panel")).toHaveCount(DRAWS.length);
});

test("two draw skills stack their budgets into one plan of panels", async ({
  page,
}) => {
  // Double Vision draws twice and Bedrock would draw four. Stacked, the roll
  // spends six ordinary draws — not four — and keeps the best of the six, and
  // none of these numbers reaches Bedrock's floor to stop it early.
  const six = [88125, 375660, 861456, 90750, 577281, 25663];
  await startSplitRoll(page, {
    draws: six,
    seed: {
      ...seed,
      owned: [...seed.owned, "twice"],
      skills: ["bedrock", "twice"],
      equippedSkills: ["bedrock", "twice"],
      skillCharge: { bedrock: 9, twice: 9 },
    },
  });
  await expect(page.locator(".draw-panel")).toHaveCount(six.length);
  expect(
    await runUntil(page, () =>
      document.querySelector(".draw-stage")?.classList.contains("is-decided"),
    ),
  ).toBe(true);
  await expect(page.locator(".draw-winner-kicker")).toContainText("Best of 6");
  // Two numbers are paid, each on its own card with its own EP. The best of
  // the six is the one the roll commits, and no headline total is shown.
  await expect(page.locator(".draw-winner-ep")).toHaveCount(0);
  await expect(page.locator(".draw-winner .paid-number")).toHaveCount(2);
  await expect(
    page.locator(".draw-winner .paid-number.is-best .paid-number-ep"),
  ).toHaveText(
    `${formatEP(Math.max(...six.map((n) => evaluate(n).totalEP)))} EP`,
  );
});

test("a stacked roll counts up no total while its numbers reveal, and ends on one card per number", async ({
  page,
}) => {
  const six = [88125, 375660, 861456, 90750, 577281, 25663];
  await startSplitRoll(page, {
    draws: six,
    seed: {
      ...seed,
      owned: [...seed.owned, "twice"],
      skills: ["bedrock", "twice"],
      equippedSkills: ["bedrock", "twice"],
      skillCharge: { bedrock: 9, twice: 9 },
    },
  });
  // The committed number's EP is never counted up on screen: the headline is
  // not there at all while the reveal plays.
  expect(
    await runUntil(
      page,
      () =>
        document.querySelector(".roll-experience")?.dataset.phase === "badges",
    ),
  ).toBe(true);
  await expect(page.locator(".roll-ep")).toHaveCount(0);
  expect(
    await runUntil(
      page,
      () =>
        document.querySelector(".roll-experience")?.dataset.phase ===
        "complete",
    ),
  ).toBe(true);
  await expect(page.locator(".roll-ep")).toHaveCount(0);
  await expect(page.locator(".result-summary .paid-number")).toHaveCount(2);
  await expect(
    page.locator(".result-summary .paid-number.is-best .paid-number-ep"),
  ).toHaveText(`${formatEP(keptEP)} EP`);
});

test("the split screen hands the roll back before the reveal ends", async ({
  page,
}) => {
  await startSplitRoll(page);
  // Watch the roll screen itself: the phase it is in at the exact commit that
  // takes the split stage away is the honest answer to "does it let go in
  // time", and no amount of clock stepping can blur it.
  await page.evaluate(() => {
    window.__leftPhase = null;
    const stage = document.querySelector(".draw-stage");
    new MutationObserver(() => {
      if (!document.querySelector(".draw-stage"))
        window.__leftPhase ??=
          document.querySelector(".roll-experience")?.dataset.phase;
    }).observe(stage.parentElement, { childList: true, subtree: true });
  });
  expect(
    await runUntil(
      page,
      () =>
        document.querySelector(".roll-experience")?.dataset.phase ===
        "complete",
    ),
  ).toBe(true);
  // It let go while the reveal was still running, not at the end of it.
  expect(await page.evaluate(() => window.__leftPhase)).toBe("badges");
  await expect(page.locator(".draw-stage")).toHaveCount(0);
  // The roll kept going underneath: the kept number is the one that pays.
  await expect(page.locator(".number-artifact")).toContainText(String(KEPT));
  await expect(page.locator(".roll-ep")).toHaveText(`${formatEP(keptEP)} EP`);
});

test("the split stage keeps the whole reveal's own schedule", () => {
  // Nothing above hard-codes a beat: the panels are driven by the same
  // timeline the roll always uses, scaled to whatever the player bought.
  const timeline = buildRevealTimeline(
    String(KEPT).length,
    groupResultBadges(scored.get(KEPT).badges).length,
    REVEAL_MS,
  );
  expect(timeline.end).toBe(REVEAL_MS);
  expect(timeline.badgeTimes.at(-1)).toBeGreaterThan(timeline.collapse);
  expect(timeline.slots).toBe(6);
});
