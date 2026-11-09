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
