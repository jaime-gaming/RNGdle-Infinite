import { ACTIVE_WINTER_MARKET, ADVENT_DOORS } from "../src/rngmas.js";
import assert from "node:assert/strict";
import {
  WINTER_LIVE_EVENTS,
  WINTER_SPECIAL_TASKS,
  WINTER_GATHERINGS,
} from "../src/winter-festival.js";
import {
  WINTER_ROTATIONS,
  WINTER_EXTRA_GATHERINGS,
  winterRollMatches,
} from "../src/winter-rotation.js";
const start = Date.UTC(2026, 11, 1),
  end = Date.UTC(2027, 0, 2);
assert.equal(WINTER_ROTATIONS.length, 8);
assert.equal(WINTER_GATHERINGS.length, 11);
assert.equal(
  new Set([...WINTER_SPECIAL_TASKS, ...WINTER_LIVE_EVENTS].map((m) => m.id))
    .size,
  22,
);
for (const events of [WINTER_ROTATIONS, WINTER_GATHERINGS]) {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  assert.equal(sorted[0].start, start);
  assert.equal(sorted.at(-1).end, end);
  for (let i = 1; i < sorted.length; i++)
    assert.equal(
      sorted[i - 1].end,
      sorted[i].start,
      "No overlaps or empty days",
    );
}
for (const [bundleId, singleId] of [
  ["snow-surge-bundle", "snow-surge"],
  ["snow-overdrive-bundle", "snow-overdrive"],
]) {
  const bundle = ACTIVE_WINTER_MARKET.find((item) => item.id === bundleId),
    single = ACTIVE_WINTER_MARKET.find((item) => item.id === singleId);
  assert(
    bundle.price < single.price * bundle.charges,
    "Bundles must beat their single-charge unit price",
  );
}
const adventEP = ADVENT_DOORS.reduce((sum, door) => sum + (door.ep ?? 0), 0);
assert.equal(
  adventEP,
  1547500,
  "The fixed Advent EP budget must be reviewed explicitly",
);
assert.equal(ADVENT_DOORS[0].ep, 10000);
let seed = 20261217;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor((seed / 4294967296) * 1000001);
};
const activities = WINTER_LIVE_EVENTS.filter((m) => m.metric !== "donations");
const simulations = activities.map((m) => {
  const attempts = [];
  for (let sample = 0; sample < 2000; sample++) {
    let progress = 0,
      rolls = 0;
    const found = new Set();
    while (progress < m.goal && rolls < 10000) {
      const number = random();
      rolls++;
      if (["digits", "ingredients"].includes(m.metric)) {
        found.add(m.metric === "digits" ? number % 10 : (number % 10) % 4);
        progress = found.size;
      } else progress += Number(winterRollMatches(m.metric, number));
    }
    assert(rolls < 10000);
    attempts.push(rolls);
  }
  attempts.sort((a, b) => a - b);
  const p50 = attempts[1000],
    p90 = attempts[1800];
  assert(p90 <= 90, `${m.id} is too demanding for a casual window`);
  return {
    id: m.id,
    metric: m.metric,
    goal: m.goal,
    medianRolls: p50,
    p90Rolls: p90,
    coins: m.coins,
  };
});
const added = [...WINTER_ROTATIONS, ...WINTER_EXTRA_GATHERINGS];
const boostCharges = Object.fromEntries(
  ["boost-spark", "boost-surge", "boost-overdrive"].map((id) => [
    id,
    added.filter((m) => m.boost === id).reduce((sum, m) => sum + m.charges, 0),
  ]),
);
const extraCoins = added.reduce((sum, m) => sum + m.coins, 0);
assert.equal(extraCoins, 128);
assert.equal(boostCharges["boost-overdrive"], 0);
console.log(
  JSON.stringify(
    {
      adventEP,
      windows: WINTER_LIVE_EVENTS.length,
      rotations: 8,
      gatherings: 11,
      extraCoins,
      boostCharges,
      simulations,
      note: "Seeded 2,000-player samples per activity, uniform main rolls. Quantiles are not guarantees; activities overlap and are not additive playtime. All claims are once per window. No free EP, odds or cooldown changes.",
    },
    null,
    2,
  ),
);
