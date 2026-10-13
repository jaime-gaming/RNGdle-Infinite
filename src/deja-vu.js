// Déjà vu: a number that has already been rolled on this account turns up
// again. It is a look, not a rank: no multiplier, no EP, no badge. The history
// is the only record, so a number forgotten by the history cap is new again.
export function priorRollsOf(history = [], number, excludeId = null) {
  let count = 0;
  for (const entry of history)
    if (
      entry?.type === "roll" &&
      entry.number === number &&
      entry.id !== excludeId
    )
      count++;
  return count;
}

// For a history list: the ids of roll rows whose number already appeared in
// an earlier row. Rows are in save order, oldest first.
export function dejaVuIds(history = []) {
  const seen = new Set();
  const repeats = new Set();
  for (const entry of history) {
    if (entry?.type !== "roll") continue;
    if (seen.has(entry.number)) repeats.add(entry.id);
    else seen.add(entry.number);
  }
  return repeats;
}
