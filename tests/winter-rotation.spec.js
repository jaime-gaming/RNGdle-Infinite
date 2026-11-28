import { test, expect, pauseClockAt } from "./helpers/clock.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import { recordWinterRoll, winterReadyCount } from "../src/rngmas.js";
import {
  WINTER_LIVE_EVENTS,
  WINTER_GATHERINGS,
  parseWinterFestival,
  winterFestivalCount,
} from "../src/winter-festival.js";
import {
  WINTER_ROTATIONS,
  winterRollMatches,
  winterSchedule,
} from "../src/winter-rotation.js";
import { compareSaveRichness } from "../src/cloud-save.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { waitForApp } from "./helpers/app.js";
import { readSavedProgress } from "./helpers/save.js";
const state = () => ({ ...emptyProgress(), profile: testProfile });

test("both calendars cover the whole season with one window each and no overlap", () => {
  expect(WINTER_ROTATIONS).toHaveLength(8);
  expect(WINTER_GATHERINGS).toHaveLength(11);
  for (const events of [WINTER_ROTATIONS, WINTER_GATHERINGS]) {
    const sorted = [...events].sort((a, b) => a.start - b.start);
    expect(sorted[0].start).toBe(Date.UTC(2026, 11, 1));
    expect(sorted.at(-1).end).toBe(Date.UTC(2027, 0, 2));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBe(sorted[i - 1].end);
      expect(
        winterSchedule(events, sorted[i].start).active.map((m) => m.id),
      ).toEqual([sorted[i].id]);
    }
  }
  expect(
    new Set(WINTER_LIVE_EVENTS.map((m) => m.metric)).size,
  ).toBeGreaterThanOrEqual(9);
});
test("new roll rules do not add leading zeroes or treat a non-adjacent pair as adjacent", () => {
  expect(winterRollMatches("pairs", 121234)).toBe(false);
  expect(winterRollMatches("pairs", 122345)).toBe(true);
  expect(winterRollMatches("pairs", 0)).toBe(false);
  expect(winterRollMatches("zero", 1)).toBe(false);
  expect(winterRollMatches("zero", 0)).toBe(true);
  expect(winterRollMatches("thirds", 123456)).toBe(true);
  expect(winterRollMatches("odd", 21)).toBe(true);
});
test("every new activity completes, claims once and keeps its receipt through reload and Fresh Start", () => {
  const numbers = [
    100000, 111111, 222222, 333333, 444444, 555555, 666666, 777777, 888888,
    999999, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ];
  for (const mission of WINTER_LIVE_EVENTS.filter((m) => m.group)) {
    const saved = state();
    let record = saved.rngmas;
    for (
      let i = 0;
      i < 1000 && winterFestivalCount(record, mission) < mission.goal;
      i++
    )
      record = recordWinterRoll(
        record,
        { number: numbers[i % numbers.length] },
        mission.start,
      );
    expect(winterFestivalCount(record, mission), mission.id).toBe(mission.goal);
    const action = {
      type: "winter-special-claim",
      id: mission.id,
      at: mission.start,
    };
    const claimed = applyProgress({ ...saved, rngmas: record }, action);
    expect(claimed.rngmas.snowcoins).toBe(record.snowcoins + mission.coins);
    expect(claimed.balance).toBe(saved.balance);
    expect(claimed.battlePass.boosts.charges[mission.boost]).toBe(
      mission.charges,
    );
    const loaded = parseProgress(JSON.stringify(claimed));
    expect(loaded.history.at(-1).missionId).toBe(mission.id);
    expect(() => applyProgress(loaded, action)).toThrow(/already/);
    expect(() =>
      applyProgress(
        { ...saved, rngmas: record },
        { ...action, at: mission.end },
      ),
    ).toThrow(/closed/);
    loaded.ultraRebirths = 3;
    expect(
      applyProgress(loaded, { type: "fresh-start", at: mission.start }).rngmas
        .festival.live[mission.id].claimed,
    ).toBe(true);
  }
});
test("rotating windows never carry progress forward, and ingredients repair to four valid slots", () => {
  const [first, second] = WINTER_ROTATIONS;
  let record = state().rngmas;
  for (let i = 0; i < 5; i++)
    record = recordWinterRoll(record, { number: 100 }, first.start);
  expect(record.festival.live[first.id].count).toBe(5);
  expect(record.festival.live[second.id].count).toBe(0);
  record = recordWinterRoll(record, { number: 100 }, second.start);
  expect(record.festival.live[first.id].count).toBe(5);
  expect(record.festival.live[second.id].count).toBe(1);
  const repaired = parseWinterFestival({
    live: {
      "winter-bakery": {
        count: Infinity,
        digits: [0, 0, 1, 2, 3, 4, 9, -1, "2"],
        claimed: "yes",
      },
      forged: { claimed: true },
    },
  });
  expect(repaired.live["winter-bakery"]).toEqual({
    count: 0,
    digits: [0, 1, 2, 3],
    claimed: false,
  });
  expect(repaired.live.forged).toBeUndefined();
  const local = state(),
    cloud = state();
  local.rngmas.festival = repaired;
  expect(compareSaveRichness(local, cloud)).toBe("local");
});
test("discounted bundles retain historical receipts and malformed prices are rejected", () => {
  const saved = state();
  saved.rngmas.snowcoins = 100;
  const bought = applyProgress(saved, {
    type: "winter-market-buy",
    id: "snow-surge-bundle",
    at: Date.UTC(2026, 11, 12),
  });
  expect(bought.rngmas.snowcoins).toBe(60);
  expect(bought.battlePass.boosts.charges["boost-surge"]).toBe(3);
  const historic = {
    ...bought,
    history: [
      {
        id: "winter-market:snow-surge-bundle",
        type: "winter-market",
        at: Date.UTC(2026, 11, 12),
        itemId: "snow-surge-bundle",
        coins: 60,
      },
    ],
  };
  expect(parseProgress(JSON.stringify(historic)).history.at(-1).coins).toBe(60);
  delete historic.history[0].coins;
  expect(
    parseProgress(JSON.stringify(historic)).history.some(
      (e) => e.type === "winter-market",
    ),
  ).toBe(false);
});
test("kitchen ingredients, rewards and schedule filters work on a phone", async ({
  page,
}) => {
  const saved = state();
  saved.rngmas.festival.live["winter-bakery"].digits = [0, 1, 2, 3];
  await seedProgress(page, saved);
  await pauseClockAt(page, Date.UTC(2026, 11, 17));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Live schedule", exact: true })
    .click();
  const bakery = page.locator(".festival-card").filter({
    has: page.getByRole("heading", { name: /Gingerbread kitchen/ }),
  });
  await expect(bakery.locator('[data-found="true"]')).toHaveCount(4);
  await bakery
    .getByRole("button", {
      name: "Collect 1 Surge Capacitor charge",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await readSavedProgress(page)).battlePass.boosts.charges[
          "boost-surge"
        ],
    )
    .toBe(1);
  await expect(bakery).toHaveAttribute("data-collected", "true");
  await page
    .getByRole("button", { name: "Rotating commissions", exact: true })
    .click();
  const zone = page.locator(".festival-zone").filter({
    has: page.getByText("The village noticeboard", { exact: true }),
  });
  await expect(zone.locator(".festival-card")).toHaveCount(2);
  await zone
    .getByRole("button", { name: "Full calendar", exact: true })
    .click();
  await expect(zone.locator(".festival-card")).toHaveCount(8);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});
test("all new lights and ornaments stop animating under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedProgress(page, state());
  await pauseClockAt(page, Date.UTC(2026, 11, 17));
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  const animations = await page
    .locator(".winter-village-lights i,.winter-motif > svg")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationName),
    );
  expect(animations.length).toBeGreaterThan(9);
  expect(animations.every((value) => value === "none")).toBe(true);
});

test("ready task count includes current commissions but never expired rewards", () => {
  const saved = state(),
    mission = WINTER_ROTATIONS[0];
  saved.rngmas.festival.live[mission.id].count = mission.goal;
  expect(winterReadyCount(saved.rngmas, mission.start)).toBe(1);
  expect(winterReadyCount(saved.rngmas, mission.end)).toBe(0);
  saved.rngmas.festival.live[mission.id].claimed = true;
  expect(winterReadyCount(saved.rngmas, mission.start)).toBe(0);
});
