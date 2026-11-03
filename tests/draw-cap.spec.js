import { test, expect } from "./helpers/clock.js";
import { pauseClockAt } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { drawPicksFor, drawPlanFor, SKILL_MAX_DRAWS } from "../src/skills.js";
import { runDrawPicks } from "../src/draw-plan.js";
import {
  emptyProgress,
  parsePending,
  parseProgress,
  PROGRESS_KEY,
} from "../src/progress.js";

const LOW = [88125, 375660, 861456, 90750, 577281, 25663];
const PACE = ["quickwind-1", "quickwind-2", "quickwind-3", "quickwind-4"];
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

function staged(numbers) {
  let index = 0;
  return {
    roll: async () => {
      if (index >= numbers.length)
        throw new Error("A hidden extra number was drawn");
      return numbers[index++];
    },
    used: () => index,
  };
}

async function settle(page) {
  for (let i = 0; i < 70; i++) {
    if (
      (await page.locator(".roll-experience").getAttribute("data-settled")) ===
      "true"
    )
      return;
    await page.clock.runFor(250);
  }
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
}

test("six skill draws leave no room for a hidden seventh ordinary number", async () => {
  expect(SKILL_MAX_DRAWS).toBe(6);
  const stream = staged(LOW);
  const result = await runDrawPicks(
    drawPicksFor(["twice", "bedrock"]),
    stream.roll,
    async (n) => evaluate(n),
    { ordinary: true },
  );
  expect(stream.used()).toBe(6);
  expect(result.draws).toEqual(LOW);
  expect(result.picks).toHaveLength(2);
  expect(result.draws).toContain(result.result.number);
  expect(result.result.totalEP).toBe(
    Math.max(...LOW.map((n) => evaluate(n).totalEP)),
  );
});

test("an overflow skill keeps its full budget for the next roll, rather than a truncated promise", async () => {
  const picks = drawPicksFor(["triptych", "quarry"]);
  expect(picks.map((pick) => pick.attempts)).toEqual([3, 5]);
  expect(drawPlanFor(["triptych", "quarry"])).toEqual({
    attempts: 3,
    floor: 0,
    keeps: 1,
  });
  const stream = staged(LOW.slice(0, 4));
  const first = await runDrawPicks(
    picks,
    stream.roll,
    async (n) => evaluate(n),
    { ordinary: true },
  );
  expect(stream.used()).toBe(4);
  expect(first.picks.map((pick) => pick.skill)).toEqual(["triptych"]);
  const next = staged(LOW);
  const second = await runDrawPicks(
    picks.filter((pick) => pick.id === "quarry"),
    next.roll,
    async (n) => evaluate(n),
    { ordinary: true },
  );
  expect(second.picks).toEqual([
    { skill: "quarry", number: second.picks[0].number, spent: 5 },
  ]);
  expect(second.draws).toHaveLength(6);
});

test("a floor stopping early makes room without ever generating a seventh number", async () => {
  const high = 777777;
  expect(evaluate(high).totalEP).toBeGreaterThanOrEqual(25000);
  const stream = staged([high, ...LOW.slice(0, 5)]);
  const outcome = await runDrawPicks(
    drawPicksFor(["bedrock", "quarry"]),
    stream.roll,
    async (n) => evaluate(n),
    { ordinary: true },
  );
  expect(stream.used()).toBe(6);
  expect(outcome.picks.map(({ skill, spent }) => ({ skill, spent }))).toEqual([
    { skill: "bedrock", spent: 1 },
    { skill: "quarry", spent: 5 },
  ]);
  expect(outcome.draws).toHaveLength(6);
});

test("new committed rolls reject a seventh number, but already-committed legacy rewards survive", () => {
  const legacy = {
    id: "legacy-six-plus-ordinary",
    number: 90750,
    startedAt: 1000,
    rollMS: 45000,
    cooldownMS: 60000,
    skills: ["bedrock", "twice"],
    draws: [...LOW, 139598],
    picks: [
      { skill: "bedrock", number: 90750, spent: 4 },
      { skill: "twice", number: 25663, spent: 2 },
    ],
    winnerSkill: "bedrock",
    winnerIndex: 3,
  };
  expect(parsePending(legacy).draws).toHaveLength(7);
  const read = parseProgress(
    JSON.stringify({
      ...emptyProgress(),
      owned: ["bedrock", "twice"],
      skills: legacy.skills,
      pendingRoll: legacy,
    }),
  );
  expect(read.pendingRoll.draws).toEqual(legacy.draws);
  expect(() => parsePending({ ...legacy, drawLimit: 6 })).toThrow(
    "Invalid committed roll",
  );
  expect(
    parsePending({ ...legacy, draws: LOW, drawLimit: 6 }).draws,
  ).toHaveLength(6);
});

test("overflow charge survives settlement and reload, then fires on the following real roll", async ({
  page,
}) => {
  // Two animated multi-rolls and the full virtual cooldown can be slow under load.
  test.setTimeout(60000);
  const words = [...LOW, 139598, 861456, 375660, 577281];
  await mockRandom(page, words);
  await seedProgress(page, {
    owned: [...PACE, "triptych", "quarry"],
    skills: ["triptych", "quarry"],
    equippedSkills: ["triptych", "quarry"],
    skillCharge: { triptych: 6, quarry: 11 },
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await pauseClockAt(page, new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".draw-panel")).toHaveCount(4);
  let progress = await saved(page);
  expect(progress.pendingRoll.draws).toEqual(words.slice(0, 4));
  expect(progress.pendingRoll.drawLimit).toBe(6);
  expect(progress.pendingRoll.skills).toEqual(["triptych"]);
  expect(progress.skillCharge.quarry).toBe(11);
  await settle(page);
  progress = await saved(page);
  expect(progress.skillCharge).toMatchObject({ triptych: 0, quarry: 11 });
  const receipts = progress.receipts.length;
  await page.reload();
  await expect(page.locator(".idle-roll .generate")).toBeVisible();
  expect((await saved(page)).skillCharge.quarry).toBe(11);
  await page.clock.runFor(120000);
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".draw-panel")).toHaveCount(6);
  progress = await saved(page);
  expect(progress.pendingRoll.skills).toEqual(["quarry"]);
  expect(progress.pendingRoll.picks[0].spent).toBe(5);
  expect(progress.pendingRoll.draws).toHaveLength(6);
  await settle(page);
  progress = await saved(page);
  expect(progress.skillCharge).toMatchObject({ triptych: 1, quarry: 0 });
  expect(progress.receipts).toHaveLength(receipts + 1);
});
