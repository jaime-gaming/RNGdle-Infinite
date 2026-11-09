export const HISTORY_LIMIT = 10_000;

export const BOOKMARK_LIMIT = 10;

export const HISTORY_WARNING = 7_500;

export function isCycleMarker(entry) {
  return (
    entry?.type === "rebirth" ||
    entry?.type === "ultra-rebirth" ||
    entry?.type === "rollback" ||
    entry?.type === "fresh-start"
  );
}

function isKeptEntry(entry, bookmarks = []) {
  return (
    isCycleMarker(entry) ||
    (entry?.type === "roll" && bookmarks.includes(entry.id))
  );
}

function cutEntries(history, doomed) {
  const kept = [];
  const removed = [];
  history.forEach((entry, index) =>
    (doomed.has(index) ? removed : kept).push(entry),
  );
  return { history: kept, removed };
}

export function capHistory(
  history = [],
  bookmarks = [],
  limit = HISTORY_LIMIT,
) {
  let excess = history.length - limit;
  if (excess <= 0) return { history, removed: [] };
  const doomed = new Set();
  history.forEach((entry, index) => {
    if (excess <= 0 || isKeptEntry(entry, bookmarks)) return;
    excess--;
    doomed.add(index);
  });
  return cutEntries(history, doomed);
}

export function removableCount(history = [], bookmarks = []) {
  return history.reduce(
    (total, entry) => total + (isKeptEntry(entry, bookmarks) ? 0 : 1),
    0,
  );
}

function markerName(entry) {
  if (entry.type === "rollback") return "Rollback";
  if (entry.type === "fresh-start") return "Fresh start";
  return entry.type === "ultra-rebirth"
    ? `Prestige ${entry.count}`
    : `Rebirth ${entry.count}`;
}

function countRange(history, from, to, bookmarks) {
  let entries = 0;
  let kept = 0;
  for (let index = from; index < to; index++) {
    if (!isKeptEntry(history[index], bookmarks)) entries++;
    else kept++;
  }
  return { entries, kept };
}

export function historyCycles(history = [], bookmarks = []) {
  const finished = [];
  let start = 0;
  let started = history[0]?.at ?? null;
  history.forEach((entry, index) => {
    if (!isCycleMarker(entry)) return;
    finished.push({
      marker: entry.id,
      label: `Before ${markerName(entry)}`,
      started,
      ended: entry.at,
      ...countRange(history, start, index, bookmarks),
    });
    started = entry.at;
    start = index + 1;
  });
  return {
    finished,
    current: {
      started,
      ...countRange(history, start, history.length, bookmarks),
    },
  };
}

export function pruneCycle(history, bookmarks, markerId) {
  const index = history.findIndex(
    (entry) => isCycleMarker(entry) && entry.id === markerId,
  );
  if (index < 0) throw new Error("That cycle is no longer in your history.");
  const start = history.slice(0, index).findLastIndex(isCycleMarker) + 1;
  const doomed = new Set();
  for (let i = start; i < index; i++)
    if (!isKeptEntry(history[i], bookmarks)) doomed.add(i);
  if (!doomed.size)
    throw new Error("There is nothing to delete in that cycle.");
  return cutEntries(history, doomed);
}

export function pruneOldest(history, bookmarks, count) {
  const doomed = new Set(
    history
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !isKeptEntry(entry, bookmarks))
      .sort((a, b) => a.entry.at - b.entry.at || a.index - b.index)
      .slice(0, count)
      .map(({ index }) => index),
  );
  if (!doomed.size) throw new Error("There is nothing to delete.");
  return cutEntries(history, doomed);
}
