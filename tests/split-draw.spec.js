import { test, expect } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { groupResultBadges, formatEP } from "../src/roll-data.js";
import { buildRevealTimeline } from "../src/roll-timeline.js";

// A draw skill spends several ordinary draws and keeps the best. This is the
// screen that says so: one panel per draw, filling the screen behind visible
// dividing lines, every draw rolling its digits and earning its badges in the
// open. When the best is known every number stays on the screen, the best one
// marked, and tapping a number minimizes the screen to that number's stats.

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

test("the best draw is marked, and every number stays on the grid", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(
    await runUntil(page, () =>
      document.querySelector(".draw-stage")?.classList.contains("is-decided"),
    ),
  ).toBe(true);
  // Nothing flies to the centre and nothing greys out: every number is still
  // there, and the one the roll keeps is marked as the best.
  await expect(page.locator(".draw-panel")).toHaveCount(DRAWS.length);
  await expect(page.locator(".draw-card")).toHaveCount(0);
  await expect(page.locator(".draw-stage-label")).toContainText(
    "Best of 4 kept",
  );
  await expect(
    page.locator(".draw-panel.is-winner .draw-panel-tag"),
  ).toHaveText("Best");
  await expect(page.locator(".draw-panel.is-out").first()).toContainText(
    "Discarded",
  );
  await expect(page.locator(".draw-grid")).toHaveCSS("filter", "none");
  await expect(page.locator(".draw-grid")).toHaveCSS("pointer-events", "auto");
});

test("tapping a number minimizes the screen to its stats, and All numbers brings it back", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(
    await runUntil(page, () =>
      document.querySelector(".draw-stage")?.classList.contains("is-decided"),
    ),
  ).toBe(true);
  // The first discarded draw, not the best one.
  const discarded = DRAWS.find((number) => number !== KEPT);
  await page.locator(".draw-panel.is-out .draw-pick").first().click();
  await expect(page.locator(".draw-stage")).toHaveCount(0);
  const card = page.locator(".draw-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Discarded");
  const digits = await card
    .locator(".draw-digits")
    .evaluate((node) => node.textContent.replace(/\s/g, ""));
  expect(digits).toBe(String(discarded));
  // Its own stats: the EP it was worth and its badge count, read from the same
  // verified index the other panels use.
  await expect(card.locator(".draw-card-ep")).toHaveText(
    `${formatEP(scored.get(discarded).totalEP)} EP`,
  );
  await expect(card.locator(".result-rank .rank-pill")).toHaveText(
    scored.get(discarded).tier,
  );
  // The rest of the screen is back underneath, and the grid is one tap away.
  await expect(page.locator(".result-summary")).toHaveCSS(
    "visibility",
    "visible",
  );
  await card.getByRole("button", { name: "All numbers" }).click();
  await expect(page.locator(".draw-panel")).toHaveCount(DRAWS.length);
  await expect(page.locator(".draw-card")).toHaveCount(0);
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
  await expect(page.locator(".draw-stage-label")).toContainText(
    "2 numbers paid",
  );
  // Two numbers are paid. Minimized to the best one, the card names both, each
  // with its own EP, and the best is the one the roll commits.
  await page.locator(".draw-stage-minimize").click();
  await expect(page.locator(".draw-card .paid-number")).toHaveCount(2);
  await expect(
    page.locator(".draw-card .paid-number.is-best .paid-number-ep"),
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

test("the result summary stays out of sight while the draw screen is open", async ({
  page,
}) => {
  await startSplitRoll(page);
  // The summary underneath already lists every number, so it must not show
  // through the screen. It comes back once the screen is minimized.
  const summary = page.locator(".result-summary");
  await expect(summary).toHaveCSS("visibility", "hidden");
  expect(
    await runUntil(page, () =>
      document.querySelector(".draw-stage")?.classList.contains("is-decided"),
    ),
  ).toBe(true);
  await expect(summary).toHaveCSS("visibility", "hidden");
  await page.locator(".draw-stage-minimize").click();
  await expect(summary).toHaveCSS("visibility", "visible");
});

test("the screen stays up after the reveal, and minimizing hands the roll back", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(
    await runUntil(
      page,
      () =>
        document.querySelector(".roll-experience")?.dataset.phase ===
        "complete",
    ),
  ).toBe(true);
  // The reveal has ended and every number is still on the screen.
  await expect(page.locator(".draw-panel")).toHaveCount(DRAWS.length);
  await expect(page.locator(".draw-stage")).toBeVisible();
  // Minimizing hands the roll back: the kept number is the one that pays.
  await page.locator(".draw-stage-minimize").click();
  await expect(page.locator(".draw-stage")).toHaveCount(0);
  await expect(page.locator(".draw-card")).toContainText(String(KEPT));
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
