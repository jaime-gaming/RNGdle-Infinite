import { test, expect } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import {
  groupResultBadges,
  formatEP,
  buildShareText,
} from "../src/roll-data.js";
import { buildRevealTimeline } from "../src/roll-timeline.js";
import { PROGRESS_KEY } from "../src/progress.js";

// A draw skill spends several ordinary draws and keeps the best. The overview
// shows one panel per draw, filling the screen behind visible dividing lines,
// every draw rolling its digits and earning its badges in the open. When the
// best is known it is filled green and every number stays on the screen. A tap
// opens that number: the best one is the roll's own result, any other one shows
// its own stats at the same size, with the roll's button in the middle.

// Four numbers, none of which reaches Bedrock's 25,000 EP floor, so the skill
// spends its whole budget of four draws and keeps the best of them.
const DRAWS = [88125, 375660, 861456, 90750];
const KEPT = 90750;
// The roll's own ordinary draw comes after the skills' draws. It pays far less
// than the kept number, so it is one more panel, and it loses.
const ORDINARY = 139598;
const PANELS = [...DRAWS, ORDINARY];
// Double Vision and Bedrock together: six skill draws, then the ordinary one.
const SIX = [88125, 375660, 861456, 90750, 577281, 25663];
const SEVEN = [...SIX, ORDINARY];
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

const scored = new Map(PANELS.map((number) => [number, evaluate(number)]));
const keptEP = Math.max(...DRAWS.map((number) => scored.get(number).totalEP));

async function startSplitRoll(page, overrides = {}) {
  await mockRandom(page, overrides.draws ?? PANELS);
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

const decided = () =>
  document.querySelector(".draw-stage")?.classList.contains("is-decided");
const complete = () =>
  document.querySelector(".roll-experience")?.dataset.phase === "complete";

function parseRgb(color) {
  return color
    .match(/\d+(\.\d+)?/g)
    .slice(0, 3)
    .map(Number);
}

test("every draw gets its own quadrant, divided by visible lines", async ({
  page,
}) => {
  await startSplitRoll(page);
  await expect(page.locator(".draw-panel")).toHaveCount(PANELS.length);
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
  // The screen is shared, not stacked in a list: more than one column and more
  // than one row, with room for every panel (five panels is not a square).
  const columns = new Set(panels.map((p) => Math.round(p.x))).size;
  const rows = new Set(panels.map((p) => Math.round(p.y))).size;
  expect(columns).toBeGreaterThan(1);
  expect(rows).toBeGreaterThan(1);
  expect(columns * rows).toBeGreaterThanOrEqual(PANELS.length);
  // Dividing lines: a real, visible gap between neighbours, both ways.
  expect(Math.round(panels[1].x - (panels[0].x + panels[0].w))).toBe(2);
  expect(Math.round(panels[columns].y - (panels[0].y + panels[0].h))).toBe(2);
  // The overview takes the screen from under the header to the bottom edge,
  // and every panel sits inside it.
  const header = await page.locator(".header").boundingBox();
  const stage = await page.locator(".draw-stage").boundingBox();
  const viewport = page.viewportSize();
  expect(stage.y).toBeCloseTo(header.y + header.height, 0);
  expect(stage.y + stage.height).toBeCloseTo(viewport.height, 0);
  expect(panels[0].y).toBeGreaterThanOrEqual(stage.y);
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
  expect(digits).toEqual(PANELS.map(String));
  // With the digits down, every panel states what its number was worth.
  await expect(page.locator(".draw-ep.is-known")).toHaveCount(PANELS.length);
  const eps = await page
    .locator(".draw-panel .draw-ep")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent));
  expect(eps).toEqual(
    PANELS.map((n) => `${formatEP(scored.get(n).totalEP)} EP`),
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

test("the best draw is filled green, and every number stays on the grid", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(await runUntil(page, decided)).toBe(true);
  await expect(page.locator(".draw-panel")).toHaveCount(PANELS.length);
  await expect(page.locator(".draw-detail")).toHaveCount(0);
  await expect(page.locator(".draw-stage-label")).toContainText(
    "Best of 5 kept",
  );
  await expect(
    page.locator(".draw-panel.is-winner .draw-panel-tag"),
  ).toHaveText("Best");
  await expect(page.locator(".draw-panel.is-out").first()).toContainText(
    "Discarded",
  );
  // The best is filled with the theme's green and the others stay plain, so it
  // reads from across the screen in either theme.
  const fills = await page.locator(".draw-panel").evaluateAll((nodes) =>
    nodes.map((node) => ({
      winner: node.classList.contains("is-winner"),
      background: getComputedStyle(node).backgroundColor,
    })),
  );
  const best = fills.find((fill) => fill.winner);
  const [r, g, b] = parseRgb(best.background);
  expect(g).toBeGreaterThan(r + 30);
  expect(g).toBeGreaterThan(b + 10);
  for (const other of fills.filter((fill) => !fill.winner))
    expect(other.background).not.toBe(best.background);
  await expect(page.locator(".draw-grid")).toHaveCSS("filter", "none");
  await expect(page.locator(".draw-grid")).toHaveCSS("pointer-events", "auto");
  // The best one's chips are written in the same page colour as its EP, so
  // their names read on the green in either theme.
  const chipColor = await page
    .locator(".draw-panel.is-winner .draw-badge")
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  const epColor = await page
    .locator(".draw-panel.is-winner .draw-ep")
    .evaluate((node) => getComputedStyle(node).color);
  expect(chipColor).toBe(epColor);
});

test("the overview is a takeover: opaque, nothing under it scrolls, nothing shows through", async ({
  page,
}) => {
  await startSplitRoll(page);
  await expect(page.locator("html")).toHaveClass(/draw-takeover/);
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  const stage = page.locator(".draw-stage");
  // An opaque colour, not a translucent one: the page never shows through.
  await expect(stage).toHaveCSS("background-color", /^rgb\(/);
  const box = await stage.boundingBox();
  for (const [fx, fy] of [
    [0.02, 0.02],
    [0.5, 0.5],
    [0.98, 0.98],
    [0.02, 0.98],
    [0.98, 0.02],
  ]) {
    const inside = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest(".draw-stage"),
      [box.x + box.width * fx, box.y + box.height * fy],
    );
    expect(inside, `point ${fx},${fy}`).toBe(true);
  }
  // Scrolling over the overview moves nothing underneath it.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  // Nothing is cut off inside a panel: the grid never needs to scroll.
  const fits = await page
    .locator(".draw-panel")
    .evaluateAll((nodes) =>
      nodes.every(
        (n) =>
          n.scrollHeight <= n.clientHeight + 1 &&
          n.scrollWidth <= n.clientWidth + 1,
      ),
    );
  expect(fits).toBe(true);
});

test("tapping a number opens its own stats at the roll's size, and All numbers brings the overview back", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(await runUntil(page, decided)).toBe(true);
  expect(await runUntil(page, complete)).toBe(true);
  // The first discarded draw, not the best one.
  const discarded = DRAWS.find((number) => number !== KEPT);
  await page.locator(".draw-panel.is-out .draw-pick").first().click();
  await expect(page.locator(".draw-stage")).toHaveCount(0);
  const detail = page.locator(".draw-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Discarded");
  // Its own number, large, as the roll shows its own.
  await expect(detail.locator(".artifact-digits")).toHaveText(
    String(discarded),
  );
  // Its own stats: the EP it was worth, its rank and its badges, read from the
  // same verified index the other panels use.
  await expect(detail.locator('[data-testid="draw-detail-ep"]')).toHaveText(
    `${formatEP(scored.get(discarded).totalEP)} EP`,
  );
  await expect(detail.locator(".result-rank .rank-pill")).toHaveText(
    scored.get(discarded).tier,
  );
  await expect(detail.locator(".badge-breakdown")).toBeVisible();
  // The roll's own button, in the middle of the stats.
  const button = detail.locator(".generate");
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(4);
  // All numbers goes back to the overview, with every number on it.
  await detail.getByRole("button", { name: "All numbers" }).click();
  await expect(page.locator(".draw-panel")).toHaveCount(PANELS.length);
  await expect(page.locator(".draw-detail")).toHaveCount(0);
});

test("tapping the best number shows the roll's own result, with a way back to the numbers", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(await runUntil(page, decided)).toBe(true);
  await page.locator(".draw-panel.is-winner .draw-pick").click();
  await expect(page.locator(".draw-stage")).toHaveCount(0);
  await expect(page.locator(".draw-detail")).toHaveCount(0);
  expect(await runUntil(page, complete)).toBe(true);
  await expect(page.locator(".number-artifact")).toContainText(String(KEPT));
  await expect(page.locator(".roll-ep")).toHaveText(`${formatEP(keptEP)} EP`);
  await page.getByRole("button", { name: "All numbers" }).click();
  await expect(page.locator(".draw-panel")).toHaveCount(PANELS.length);
});

test("two draw skills stack their budgets into one plan of panels", async ({
  page,
}) => {
  // Double Vision draws twice and Bedrock would draw four. Stacked, the roll
  // spends six draws — not four — and keeps the best of the six, and
  // none of these numbers reaches Bedrock's floor to stop it early.
  const six = SIX;
  await startSplitRoll(page, {
    draws: SEVEN,
    seed: {
      ...seed,
      owned: [...seed.owned, "twice"],
      skills: ["bedrock", "twice"],
      equippedSkills: ["bedrock", "twice"],
      skillCharge: { bedrock: 9, twice: 9 },
    },
  });
  await expect(page.locator(".draw-panel")).toHaveCount(SEVEN.length);
  expect(await runUntil(page, decided)).toBe(true);
  await expect(page.locator(".draw-stage-label")).toContainText(
    "2 numbers paid",
  );
  // The paid number that is not the best one opens with its own card, the
  // numbers it is paid with, and the EP it banks.
  const paid = page.locator(".draw-panel", {
    has: page.locator(".draw-panel-tag.is-paid"),
  });
  await paid.locator(".draw-pick").click();
  const detail = page.locator(".draw-detail");
  await expect(detail).toContainText("Paid with");
  await expect(detail.locator(".paid-number")).toHaveCount(2);
  // Minimized to the best one, the roll shows the best number as paid, and the
  // card names both numbers, each with its own EP.
  await detail.getByRole("button", { name: "All numbers" }).click();
  await page.locator(".draw-stage-minimize").click();
  expect(await runUntil(page, complete)).toBe(true);
  await expect(page.locator(".result-summary .paid-number")).toHaveCount(2);
  await expect(
    page.locator(".result-summary .paid-number.is-best .paid-number-ep"),
  ).toHaveText(
    `${formatEP(Math.max(...six.map((n) => evaluate(n).totalEP)))} EP`,
  );
});

test("a stacked roll counts up no total while its numbers reveal, and ends on one card per number", async ({
  page,
}) => {
  const six = SIX;
  await startSplitRoll(page, {
    draws: SEVEN,
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
  expect(await runUntil(page, complete)).toBe(true);
  await page.locator(".draw-stage-minimize").click();
  await expect(page.locator(".roll-ep")).toHaveCount(0);
  await expect(page.locator(".result-summary .paid-number")).toHaveCount(2);
  await expect(
    page.locator(".result-summary .paid-number.is-best .paid-number-ep"),
  ).toHaveText(`${formatEP(keptEP)} EP`);
});

test("the result summary stays out of sight while the overview is open", async ({
  page,
}) => {
  await startSplitRoll(page);
  // The summary underneath already lists every number, so it must not show
  // through the screen. It comes back once the overview is closed.
  const summary = page.locator(".result-summary");
  await expect(summary).toHaveCSS("visibility", "hidden");
  expect(await runUntil(page, decided)).toBe(true);
  await expect(summary).toHaveCSS("visibility", "hidden");
  await page.locator(".draw-stage-minimize").click();
  await expect(summary).toHaveCSS("visibility", "visible");
});

test("the overview stays up after the reveal, and minimizing hands the roll back", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(await runUntil(page, complete)).toBe(true);
  // The reveal has ended and every number is still on the screen.
  await expect(page.locator(".draw-panel")).toHaveCount(PANELS.length);
  await expect(page.locator(".draw-stage")).toBeVisible();
  // Minimizing hands the roll back: the kept number is the one that pays.
  await page.locator(".draw-stage-minimize").click();
  await expect(page.locator(".draw-stage")).toHaveCount(0);
  await expect(page.locator(".number-artifact")).toContainText(String(KEPT));
  await expect(page.locator(".roll-ep")).toHaveText(`${formatEP(keptEP)} EP`);
});

test("on a phone the overview fits the screen, and a number's stats open in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startSplitRoll(page);
  expect(await runUntil(page, decided)).toBe(true);
  // The overview stops above the phone's tab bar, and nothing in it scrolls.
  const stage = await page.locator(".draw-stage").boundingBox();
  const tabs = await page.locator(".mobile-tabbar").boundingBox();
  expect(stage.y + stage.height).toBeLessThanOrEqual(tabs.y + 1);
  const fits = await page
    .locator(".draw-grid, .draw-panel")
    .evaluateAll((nodes) =>
      nodes.every(
        (n) =>
          n.scrollHeight <= n.clientHeight + 1 &&
          n.scrollWidth <= n.clientWidth + 1,
      ),
    );
  expect(fits).toBe(true);
  // A number opened from the overview starts at its own top, so the way back
  // to the numbers is on screen, not scrolled out of sight.
  await page.locator(".draw-panel.is-out .draw-pick").first().click();
  await expect(page.locator(".draw-detail")).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".draw-detail-bar").boundingBox())?.y)
    .toBeLessThan(200);
  // The skill rack keeps the corner, so "All numbers" starts past its circles.
  const rack = await page.locator(".skill-bar").boundingBox();
  const back = await page.locator(".draw-detail-back").boundingBox();
  expect(back.x).toBeGreaterThanOrEqual(rack.x + rack.width);
  await page.getByRole("button", { name: "All numbers" }).click();
  await expect(page.locator(".draw-stage-minimize")).toBeVisible();
  await page.locator(".draw-stage-minimize").click();
  await expect(page.locator(".number-artifact")).toContainText(String(KEPT));
  await expect
    .poll(async () => (await page.locator(".draw-back-row").boundingBox())?.y)
    .toBeLessThan(200);
  const rackAtBest = await page.locator(".skill-bar").boundingBox();
  const backAtBest = await page
    .locator(".draw-back-row .draw-detail-back")
    .boundingBox();
  expect(backAtBest.x).toBeGreaterThanOrEqual(rackAtBest.x + rackAtBest.width);
});

// Auto-Roll armed from the rack, on a roll whose first draw keeps four numbers.
// The overview of that first roll is up and decided when this returns.
async function armedAutoRoll(page, draws = PANELS) {
  await mockRandom(page, draws);
  await seedProgress(page, { ...seed, owned: [...seed.owned, "auto-roll"] });
  await page.goto("/");
  // The roll data loads first, as it does for any player; the clock only starts
  // to move once the page is ready.
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await expect(page.locator(".auto-roll-control")).toBeVisible();
  await page.locator(".auto-roll-control").click();
  // The first roll starts by itself, and its overview opens.
  expect(
    await runUntil(page, () => !!document.querySelector(".draw-stage"), 300),
  ).toBe(true);
  expect(await runUntil(page, decided, 400)).toBe(true);
}

test("auto-roll keeps turning while the overview is open", async ({ page }) => {
  await armedAutoRoll(page);
  // Nothing is touched: the overview stays up, and the next roll starts under it.
  await expect(page.locator(".draw-stage")).toBeVisible();
  expect(
    await runUntil(
      page,
      () =>
        document.querySelector(".roll-experience")?.dataset.phase === "digits",
      400,
    ),
  ).toBe(true);
});

test("auto-roll stands still while a number matching the winner is open, and turns again once the overview is back", async ({
  page,
}) => {
  // A non-winning draw can repeat the winning number. It is still its own
  // draw, and opening it must pause just like any other detail screen.
  await armedAutoRoll(page, Array(PANELS.length).fill(KEPT));
  // Looking at a number up close stops the rolls: three minutes pass and no
  // roll starts while the stats are open.
  await page
    .locator(".draw-panel.is-out .draw-pick")
    .first()
    .evaluate((button) => button.click());
  await expect(page.locator(".draw-detail")).toBeVisible();
  for (let step = 0; step < 180; step++) await page.clock.runFor(1000);
  await expect(page.locator(".draw-detail")).toBeVisible();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  // Back on the overview, the next roll starts again.
  await page.getByRole("button", { name: "All numbers" }).click();
  await expect(page.locator(".draw-stage")).toBeVisible();
  expect(
    await runUntil(
      page,
      () =>
        document.querySelector(".roll-experience")?.dataset.phase === "digits",
      400,
    ),
  ).toBe(true);
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

// The roll button of the overview sits where the panels meet when that spot
// covers no number, label or hint; otherwise it sits in the strip under them.
// Both are centred on the screen, clear of every number, and above the tab bar.
const inkOverlapsButton = () => {
  const button = document.querySelector(".draw-stage .generate");
  const b = button.getBoundingClientRect();
  return [...document.querySelectorAll(".draw-panel *")]
    .filter((el) => el.children.length === 0)
    .filter((el) => {
      const hasText = [...el.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
      let r = el.getBoundingClientRect();
      if (hasText) {
        const range = document.createRange();
        range.selectNodeContents(el);
        r = range.getBoundingClientRect();
      }
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.left < b.right &&
        r.right > b.left &&
        r.top < b.bottom &&
        r.bottom > b.top
      );
    }).length;
};

async function expectButtonPlaced(page, { hub }) {
  await expect(page.locator(".draw-stage .generate")).toBeVisible();
  // The button rises into place over a short transition; measure it once it has
  // settled, not halfway up.
  await expect(
    page.locator(".draw-stage .generate-wrap:not(.is-away)"),
  ).toHaveCSS("max-height", hub ? "none" : "96px");
  // The wrap also slides into place; its transform is settled only at "none".
  await expect(
    page.locator(".draw-stage .generate-wrap:not(.is-away)"),
  ).toHaveCSS("transform", "none");
  const geometry = await page.evaluate(() => {
    const button = document
      .querySelector(".draw-stage .generate")
      .getBoundingClientRect();
    const grid = document.querySelector(".draw-grid").getBoundingClientRect();
    const tabBar = document.querySelector(".mobile-tabbar");
    const tabTop =
      tabBar && getComputedStyle(tabBar).display !== "none"
        ? tabBar.getBoundingClientRect().top
        : window.innerHeight;
    return {
      centreX: button.left + button.width / 2,
      centreY: button.top + button.height / 2,
      gridCentreX: grid.left + grid.width / 2,
      gridCentreY: grid.top + grid.height / 2,
      width: window.innerWidth,
      bottom: button.bottom,
      tabTop,
    };
  });
  expect(Math.abs(geometry.centreX - geometry.width / 2)).toBeLessThan(4);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.tabTop);
  expect(await page.evaluate(inkOverlapsButton)).toBe(0);
  if (hub) {
    // At the crossing: the middle of the grid, where the four corners meet.
    expect(Math.abs(geometry.centreY - geometry.gridCentreY)).toBeLessThan(4);
  }
}

test("the overview's roll button is centred and covers no number, wherever it sits", async ({
  page,
}) => {
  await startSplitRoll(page);
  expect(await runUntil(page, decided)).toBe(true);
  expect(await runUntil(page, complete)).toBe(true);
  // Five numbers on a desktop: the tap hints sit in the outer corners, so the
  // crossing is free and the button takes it.
  const hub = (await page.locator(".draw-hub").count()) === 1;
  expect(hub).toBe(true);
  await expectButtonPlaced(page, { hub });
});

test("seven numbers leave the crossing free, and the roll button sits in it", async ({
  page,
}) => {
  await startSplitRoll(page, {
    draws: SEVEN,
    seed: {
      ...seed,
      owned: [...seed.owned, "twice"],
      skills: ["bedrock", "twice"],
      equippedSkills: ["bedrock", "twice"],
      skillCharge: { bedrock: 9, twice: 9 },
    },
  });
  expect(await runUntil(page, decided)).toBe(true);
  expect(await runUntil(page, complete)).toBe(true);
  await expect(page.locator(".draw-hub .generate")).toBeVisible();
  await expect(page.locator(".draw-stage-roll")).toHaveCount(0);
  await expectButtonPlaced(page, { hub: true });
});

test("a paid number's stats show the EP balance and share that number's own result", async ({
  page,
  context,
}) => {
  const six = SIX;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await startSplitRoll(page, {
    draws: SEVEN,
    seed: {
      ...seed,
      owned: [...seed.owned, "twice"],
      skills: ["bedrock", "twice"],
      equippedSkills: ["bedrock", "twice"],
      skillCharge: { bedrock: 9, twice: 9 },
    },
  });
  expect(await runUntil(page, decided)).toBe(true);
  expect(await runUntil(page, complete)).toBe(true);
  // The paid number that is not the best: a roll's own result would show its
  // balance and its share line, and so does its stats page.
  await page
    .locator(".draw-panel", { has: page.locator(".draw-panel-tag.is-paid") })
    .locator(".draw-pick")
    .click();
  const detail = page.locator(".draw-detail");
  await expect(detail.locator(".session-total")).toContainText(
    "Your EP balance",
  );
  await detail.getByRole("button", { name: "Share", exact: true }).click();
  await expect(
    detail.getByRole("button", { name: "Copied result + link!", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    buildShareText(evaluate(25663)),
  );
});

test("identical skill picks are paid separately, and only their actual draw is marked best", async ({
  page,
}) => {
  const number = 88125;
  const draws = [number, number, number, number, number, number, number];
  await startSplitRoll(page, {
    draws,
    seed: {
      ...seed,
      owned: [...seed.owned, "twice"],
      skills: ["bedrock", "twice"],
      equippedSkills: ["bedrock", "twice"],
      skillCharge: { bedrock: 9, twice: 9 },
    },
  });
  expect(await runUntil(page, decided)).toBe(true);
  await expect(page.locator(".draw-panel")).toHaveCount(draws.length);
  await expect(page.locator(".draw-stage-label")).toContainText(
    "2 numbers paid",
  );
  await expect(page.locator(".draw-panel.is-winner")).toHaveCount(1);
  await expect(page.locator(".draw-panel-tag.is-best")).toHaveCount(1);
  await expect(page.locator(".draw-panel-tag.is-paid")).toHaveCount(1);
  await expect(page.locator(".draw-panel").nth(0)).toContainText("Bedrock");
  await expect(page.locator(".draw-panel").nth(4)).toContainText(
    "Double Vision",
  );
  await expect(page.locator(".draw-panel").nth(4)).toHaveClass(/is-out/);

  expect(await runUntil(page, complete)).toBe(true);
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  // The second skill's card repeats the winner's value, but is still its own
  // paid draw with a distinct index and claim.
  await page
    .locator(".draw-panel")
    .nth(4)
    .locator(".draw-pick")
    .evaluate((button) => button.click());
  const duplicateDetail = page.locator(".draw-detail");
  await expect(duplicateDetail).toHaveAttribute(
    "aria-label",
    `Draw 5 of 7: ${number}`,
  );
  await expect(duplicateDetail.locator(".draw-detail-paid")).toContainText(
    "Paid with Double Vision",
  );
  await expect(duplicateDetail.locator(".paid-number")).toHaveCount(2);
  await duplicateDetail.getByRole("button", { name: "All numbers" }).click();
  await expect(page.locator(".draw-stage")).toBeVisible();

  await page.locator(".draw-stage-minimize").click();
  const cards = page.locator(".result-summary .paid-number");
  await expect(cards).toHaveCount(2);
  await expect(
    page.locator(".result-summary .paid-number.is-best"),
  ).toHaveCount(1);
  const progress = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key));
  }, PROGRESS_KEY);
  expect(progress.balance).toBe(2 * evaluate(number).totalEP);
  const rolls = progress.history.filter((entry) => entry.type === "roll");
  expect(rolls.map((entry) => entry.number)).toEqual([number, number]);
  expect(rolls[1].with).toBe(rolls[0].id);
});

test("an ordinary draw can win, and the number Bedrock kept stays paid", async ({
  page,
}) => {
  // The roll's own ordinary draw is a plain number like any other. Here it is
  // the best of all five, so it wins. Bedrock's kept number is still paid, and
  // the result lists it beside the roll's own number.
  const ordinaryWins = [...DRAWS, 999999];
  await startSplitRoll(page, { draws: ordinaryWins });
  expect(await runUntil(page, decided)).toBe(true);
  await expect(page.locator(".draw-panel")).toHaveCount(ordinaryWins.length);
  await expect(page.locator(".draw-stage-label")).toContainText(
    "2 numbers paid",
  );
  await expect(page.locator(".draw-panel .is-best")).toHaveCount(1);
  await expect(page.locator(".draw-panel .is-paid")).toHaveCount(1);
  expect(await runUntil(page, complete)).toBe(true);
  // Minimizing hands the roll back: its own result, with a card for every number
  // it pays. The roll's own number is the Best card, and Bedrock's stays paid.
  await page.locator(".draw-stage-minimize").click();
  const cards = page.locator(".paid-numbers > li");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveClass(/is-best/);
  await expect(cards.first()).toContainText("Ordinary draw");
  await expect(cards.first()).toContainText(formatEP(evaluate(999999).totalEP));
  await expect(cards.nth(1)).toContainText("Bedrock");
});
