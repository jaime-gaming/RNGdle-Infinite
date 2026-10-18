import { applyProgress } from "../../src/progress.js";
import { worldState } from "../../src/rngween-world-zones.js";

// Pure tests settle the real saved deadline explicitly; never shorten the game.
export function completedWorldRoll(progress, action) {
  const pending = applyProgress(progress, {
    ...action,
    type: "rngween-world-roll",
    zone: action.zone ?? "valley",
  });
  const roll = worldState(pending.rngweenLimited).pending;
  if (!roll) return pending;
  return applyProgress(pending, {
    type: "rngween-world-reveal",
    id: roll.id,
    at: roll.revealsAt,
    rngweenAt: roll.revealsAt,
  });
}
export const savedWorld = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("rng-infinite-progress-v1")),
  );
export async function revealWorld(page) {
  const pending = (await savedWorld(page)).rngweenLimited.world.pending;
  if (!pending) throw new Error("No saved World result to reveal.");
  await page.clock.fastForward(pending.revealsAt - pending.startedAt + 50);
}

// Accumulate real badge results through committed deadlines, not fragment
// flags. Deterministic test numbers never change production randomness.
export function completedWorldObjectives(progress, zone, at) {
  const numbers = {
    "pumpkin-patch": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    graveyard: [66, 13, 49, 66, 6],
    "haunted-house": [
      666, 13, 123, 313, 111, 169, 343, 246, 123, 666, 111, 121, 313,
    ],
    "blood-moon-ridge": [666, 606, 616, 626, 13, 7],
  }[zone];
  let p = progress,
    cursor = at;
  for (
    let index = 0;
    !worldState(p.rngweenLimited).fragments[zone] && index < numbers.length * 2;
    index++
  ) {
    p = completedWorldRoll(p, {
      zone,
      number: numbers[index % numbers.length],
      at: cursor,
      rngweenAt: cursor,
    });
    cursor = p.rngweenLimited.world.last.revealsAt;
  }
  if (!worldState(p.rngweenLimited).fragments[zone])
    throw new Error(
      "The scripted collection did not complete its fragment objectives.",
    );
  return p;
}

// Grant World points without scripting dozens of rolls: n Infernal results in
// the Haunted House (500 points each), recorded the way the parser expects.
export function withWorldPoints(progress, points) {
  const n = Math.ceil(points / 500);
  const limited = progress.rngweenLimited;
  const world = worldState(limited);
  const previous = world.mini?.["haunted-house"] ?? {
    rolls: 0,
    counts: {},
    rareRolls: 0,
    last: null,
    best: null,
  };
  return {
    ...progress,
    rngweenLimited: {
      ...limited,
      world: {
        ...world,
        rounds: {
          ...world.rounds,
          "haunted-house": world.rounds["haunted-house"] + n,
        },
        visited: world.visited.includes("haunted-house")
          ? world.visited
          : [...world.visited, "haunted-house"],
        mini: {
          ...world.mini,
          "haunted-house": {
            ...previous,
            rolls: previous.rolls + n,
            counts: {
              ...previous.counts,
              infernal: (previous.counts.infernal ?? 0) + n,
            },
            rareRolls: previous.rareRolls + n,
          },
        },
      },
    },
  };
}
