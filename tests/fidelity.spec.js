import { test, expect } from "@playwright/test";
import { buildChipPlan, chipLoopFrames } from "../src/chip-motion.js";
import {
  rankPopFrames,
  revealCueTimes,
  buildRevealTimeline,
} from "../src/roll-timeline.js";
import { groupResultBadges } from "../src/roll-data.js";
import { sampleByNumber } from "./helpers/index.js";
import { showRoll, mockRandom, startRoll } from "./helpers/random-roll.js";

test("chip groups, alternating parity and centre ripple use the reference order", () => {
  const group = buildChipPlan(
    {
      id: "TEST",
      rarity: "rare",
      contributors: {
        type: "groups",
        groups: [
          [0, 2],
          [1, 3],
        ],
      },
    },
    1212,
  );
  expect(group.chips.map((c) => c.introAt)).toEqual([0, 260, 80, 340]);
  expect(group.chips.map((c) => c.background)).toEqual([
    "#93C5FD",
    "#86EFAC",
    "#93C5FD",
    "#86EFAC",
  ]);
  const trinity = buildChipPlan(
    {
      id: "TRINITY",
      rarity: "uncommon",
      contributors: { type: "indices", indices: [0, 1, 2, 3] },
    },
    1337,
  );
  expect(trinity.chips.map((c) => c.introAt)).toEqual([0, 180, 260, 440]);
  expect(trinity.chips.map((c) => c.background)).toEqual([
    "#6EE7B7",
    "#D1FAE5",
    "#D1FAE5",
    "#6EE7B7",
  ]);
  const parity = buildChipPlan(
    {
      id: "ALTERNATOR",
      rarity: "uncommon",
      contributors: { type: "indices", indices: [0, 1, 2, 3, 4, 5] },
    },
    123456,
  );
  expect(parity.chips.map((c) => c.introAt)).toEqual([
    0, 340, 80, 420, 160, 500,
  ]);
  const range = buildChipPlan(
    {
      id: "MOUNTAIN",
      rarity: "uncommon",
      contributors: { type: "range", start: 0, end: 6 },
    },
    125543,
  );
  expect(range.chips.map((c) => c.introAt)).toEqual([160, 80, 0, 80, 160, 240]);
  const whole = buildChipPlan(
    { id: "VALLEY", rarity: "uncommon", contributors: { type: "whole" } },
    543235,
  );
  expect(whole.chips.map((c) => c.introAt)).toEqual([240, 160, 80, 0, 80, 160]);
});

test("chip loops reset the entire group before re-highlighting", () => {
  const plan = buildChipPlan(
    { id: "STEPS", rarity: "rare", contributors: { type: "whole" } },
    123456,
  );
  expect(plan.loopDuration).toBe(5700);
  expect(plan.introDuration).toBe(600);
  expect(plan.highlightAt).toBe(900);
  const rest = { color: "#999" },
    lit = { color: "#000" };
  const first = chipLoopFrames(plan.chips[0], plan, rest, lit),
    last = chipLoopFrames(plan.chips[5], plan, rest, lit);
  expect(first[3].offset * 5700).toBe(900);
  expect(last[2].offset * 5700).toBe(800);
  expect(first[1].easing).toBe("cubic-bezier(.33,1,.68,1)");
  expect(
    buildChipPlan(
      {
        id: "PAIR",
        rarity: "common",
        contributors: { type: "indices", indices: [0, 1] },
      },
      112345,
    ).loopDuration,
  ).toBe(5060);
});

test("rank easing overshoots and the cue scheduler contains each settle/reset boundary", () => {
  const row = rankPopFrames(1.7, 0.9, true),
    pill = rankPopFrames(3, 0.5);
  expect(row[0].transform).toBe("scale(0.9)");
  expect(row.at(-1).transform).toBe("scale(1)");
  const scales = pill.map((f) => Number(f.transform.match(/[\d.]+/)[0]));
  expect(Math.max(...scales)).toBeCloseTo(1.125, 2);
  const t = buildRevealTimeline(6, 10),
    cues = revealCueTimes(t);
  expect(cues).toContain(t.digitTimes[0] + t.settleMS);
  expect(cues).toContain(t.collapse + t.pulseMS);
  expect(cues).toContain(t.rarity + t.pulseMS);
  expect(cues.at(-1)).toBe(t.end);
  expect(cues).toEqual([...new Set(cues)].sort((a, b) => a - b));
});

test("neutral EP is visible during spinning, first badge counts up, reduced motion lands exactly", async ({
  page,
}) => {
  await startRoll(page, 103381);
  await expect(page.locator(".roll-ep")).toHaveText("??? EP");
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  const t = buildRevealTimeline(
    6,
    groupResultBadges(sampleByNumber.get(103381).badges).length,
  );
  await page.clock.runFor(9310 * t.scale);
  const first = groupResultBadges(sampleByNumber.get(103381).badges).at(-1).lead
    .ep;
  const count = Number(
    (await page.locator(".roll-ep").innerText()).replace(/[^\d]/g, ""),
  );
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(first);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-ep")).toHaveText("2,730 EP");
  await expect(page.locator(".result-badge-group.is-entering")).toHaveCount(0);
  expect(
    await page
      .locator(".rank-pill")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
});

test("numbers are read-only; there are no editors or presets", async ({
  page,
}) => {
  await mockRandom(page, [1337]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".question-number")).toHaveJSProperty(
    "tagName",
    "DIV",
  );
  await page.locator(".question-number").click();
  await page.keyboard.type("42");
  await expect(
    page.locator('main input, main select, [contenteditable="true"]'),
  ).toHaveCount(0);
  await expect(page.getByText("Sample numbers", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    "Number 1337",
  );
  await page.locator(".number-artifact").click();
  await page.keyboard.type("42");
  await page.keyboard.press("Enter");
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    "Number 1337",
  );
  await expect(
    page.locator('main input, main select, [contenteditable="true"]'),
  ).toHaveCount(0);
  await expect(
    page.locator(
      ".history-card, .result-secondary-actions, .result-local-label",
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay reveal" })).toHaveCount(
    0,
  );
});

test("reveal and badge breakdown geometry match the reference without dashboard cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await showRoll(page, 1337);

  await page.evaluate(() => document.fonts.ready);
  const positions = await page.evaluate(() =>
    Object.fromEntries(
      [
        ".header",
        ".number-artifact",
        ".result-rank",
        ".roll-ep",
        ".share-row",
        ".generate",
        ".badge-breakdown",
        ".result-badge",
      ].map((s) => {
        const el = document.querySelector(s),
          r = el.getBoundingClientRect();
        return [s, { top: r.y, width: r.width, height: r.height }];
      }),
    ),
  );
  expect(positions[".header"].height).toBe(48);
  expect(positions[".number-artifact"].top).toBe(96);
  expect(positions[".number-artifact"].height).toBe(106);
  expect(positions[".result-rank"].top).toBe(226);
  expect(positions[".roll-ep"]).toEqual({ top: 266, width: 166, height: 34 });
  expect(positions[".share-row"].top).toBe(368);
  expect(positions[".generate"]).toEqual({ top: 426, width: 320, height: 72 });
  expect(positions[".badge-breakdown"].top).toBe(546);
  expect(positions[".result-badge"].top).toBe(606);
  await expect(page.locator(".loop-hub,.loop-card")).toHaveCount(0);
  expect(positions[".result-badge"].height).toBe(105);
  expect(positions[".badge-breakdown"].height).toBe(1812);
  for (const row of await page.locator(".superseded-badge").all())
    expect((await row.boundingBox()).height).toBe(36);
});

test("scoring badge highlights match the reference fixtures, including repeated sevens and adjacent neighbors", async () => {
  const { sampleResults, evaluate } = await import("./helpers/index.js");
  for (const sample of sampleResults) {
    const result = evaluate(sample.number);
    for (const expected of sample.badges.filter((b) => b.isScoring))
      expect(
        result.badges.find((b) => b.id === expected.id).contributors,
        `${sample.number}: ${expected.id}`,
      ).toEqual(expected.contributors);
  }
  expect(
    evaluate(77777).badges.find((b) => b.id === "LUCKY_7").contributors.indices,
  ).toEqual([0, 1, 2, 3, 4]);
  expect(
    evaluate(582104).badges.find((b) => b.id === "NEIGHBORS").contributors,
  ).toEqual({ type: "range", start: 2, end: 4 });
});
