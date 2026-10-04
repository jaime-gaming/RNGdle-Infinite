import { SKILL_MAX_DRAWS } from "./skills.js";

// The one rule every draw-modifying skill collapses into: take this many
// ordinary, independent draws and stop early once one of them clears the floor.
// The best-scoring draw is the number the roll commits — the others are kept
// only to be shown and then discarded.
//
// `roll` draws one uniform number and `score` re-reads it from the verified
// index, so nothing here can invent EP, bias a draw or edit a number: it only
// chooses between numbers the player genuinely rolled.
export async function runDrawPlan(plan, roll, score) {
  const attempts = Math.min(plan?.attempts ?? 1, SKILL_MAX_DRAWS);
  const draws = [];
  let best = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const number = await roll();
    draws.push(number);
    const scored = await score(number);
    if (!best || scored.totalEP > best.totalEP) best = scored;
    // A floor skill stops the moment a draw is good enough; the rest of its
    // budget is never spent.
    if (plan?.floor > 0 && scored.totalEP >= plan.floor) break;
  }
  return { draws, result: best };
}
