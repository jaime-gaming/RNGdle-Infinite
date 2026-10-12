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
  const numbers =
    zone === "graveyard"
      ? [66, 13, 49, 66, 6]
      : [666, 13, 123, 313, 111, 169, 343, 246, 123, 666, 111, 121, 313];
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
