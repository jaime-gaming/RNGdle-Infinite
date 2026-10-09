import { SKILL_MAX_DRAWS, drawPicksFor } from "./skills.js";

// The one rule every draw-modifying skill collapses into: take this many
// ordinary, independent draws and keep the best of them. Two draw skills do
// not merge into one budget — each spends its own draws and keeps its own
// number, and the roll pays for every number it kept. The best of them is the
// number the roll commits and shows; the others are paid and recorded beside
// it rather than thrown away.
//
// A live roll with a draw skill also makes one ordinary draw of its own, after
// the skills'. That number is a plain draw and can win like any other; the
// skill numbers stay paid whether they win or not.
//
// `roll` draws one uniform number and `score` re-reads it from the verified
// index, so nothing here can invent EP, bias a draw or edit a number: it only
// chooses between numbers the player genuinely rolled.
export async function runDrawPicks(
  picks,
  roll,
  score,
  { ordinary = false } = {},
) {
  const draws = [];
  const kept = [];
  let best = null;
  for (const pick of picks) {
    const attempts = Math.min(
      pick.attempts ?? 1,
      SKILL_MAX_DRAWS - draws.length,
    );
    let bestHere = null,
      spent = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      spent++;
      const number = await roll();
      draws.push(number);
      const scored = await score(number);
      if (!bestHere || scored.totalEP > bestHere.totalEP) bestHere = scored;
      // A floor skill stops the moment a draw is good enough; the rest of its
      // own budget is never spent, and the next skill starts drawing again.
      if (pick.floor > 0 && scored.totalEP >= pick.floor) break;
    }
    if (!bestHere) continue;
    kept.push({ skill: pick.id, number: bestHere.number, spent });
    if (!best || bestHere.totalEP > best.totalEP) best = bestHere;
  }
  if (ordinary) {
    const number = await roll();
    draws.push(number);
    const scored = await score(number);
    // Ties keep the skill's number: the plain draw has to beat it outright.
    if (!best || scored.totalEP > best.totalEP) best = scored;
  }
  return { draws, result: best, picks: kept };
}

// One budget, one number: the shape a single draw skill has always had, and
// the one the tests quote when they want to reason about a plan instead of a
// rack.
export async function runDrawPlan(plan, roll, score) {
  return runDrawPicks(
    [{ id: null, attempts: plan?.attempts ?? 1, floor: plan?.floor ?? 0 }],
    roll,
    score,
  );
}
