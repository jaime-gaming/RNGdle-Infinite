import { SKILL_MAX_DRAWS } from "./skills.js";

export async function runDrawPicks(
  picks,
  roll,
  score,
  { ordinary = false } = {},
) {
  const draws = [];
  const kept = [];
  let best = null;
  let winnerSkill = null;
  let winnerIndex = null;
  for (const pick of picks) {
    const attempts = pick.attempts ?? 1;
    if (attempts > SKILL_MAX_DRAWS - draws.length) continue;
    let bestHere = null,
      bestHereIndex = null,
      spent = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      spent++;
      const number = await roll();
      const drawIndex = draws.length;
      draws.push(number);
      const scored = await score(number);
      if (!bestHere || scored.totalEP > bestHere.totalEP) {
        bestHere = scored;
        bestHereIndex = drawIndex;
      }

      if (pick.floor > 0 && scored.totalEP >= pick.floor) break;
    }
    if (!bestHere) continue;
    kept.push({ skill: pick.id, number: bestHere.number, spent });
    if (!best || bestHere.totalEP > best.totalEP) {
      best = bestHere;
      winnerSkill = pick.id;
      winnerIndex = bestHereIndex;
    }
  }
  if (ordinary && draws.length < SKILL_MAX_DRAWS) {
    const number = await roll();
    const drawIndex = draws.length;
    draws.push(number);
    const scored = await score(number);

    if (!best || scored.totalEP > best.totalEP) {
      best = scored;
      winnerSkill = null;
      winnerIndex = drawIndex;
    }
  }
  return { draws, result: best, picks: kept, winnerSkill, winnerIndex };
}

export async function runDrawPlan(plan, roll, score) {
  return runDrawPicks(
    [{ id: null, attempts: plan?.attempts ?? 1, floor: plan?.floor ?? 0 }],
    roll,
    score,
  );
}
