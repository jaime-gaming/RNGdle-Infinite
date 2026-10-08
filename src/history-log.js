// The activity log's capacity and the rules for making room in it.
//
// The log keeps every roll, discovery, purchase and rebirth, and it is capped so
// a save cannot outgrow the browser's storage. Two things are never removed:
// cycle markers (a rebirth or ultra-rebirth frames every cycle, and the cycle EP
// gate reads them) and bookmarked rolls (the player asked to keep them).
// Everything else can go, either in bulk from History or, once the log is full,
// oldest first, so a new roll always has somewhere to land.

// The most entries the log keeps. An entry is about 260 bytes of save, so this
// stays comfortably inside what mobile browsers allow a site to store.
export const HISTORY_LIMIT = 6000;
// From this many entries on, History warns that space is running low and offers
// bulk delete. It leaves room for the next few sessions before the cap.
export const HISTORY_WARNING = 4500;

export function isCycleMarker(entry) {
  return entry?.type === "rebirth" || entry?.type === "ultra-rebirth";
}

// True for an entry that no removal may touch.
export function isKeptEntry(entry, bookmarks = []) {
  return (
    isCycleMarker(entry) ||
    (entry?.type === "roll" && bookmarks.includes(entry.id))
  );
}

// The log brought back under the cap. Once it is over, the oldest removable
// entries go; markers and bookmarks are passed over, so the log can never shed
// the things it exists to keep.
export function capHistory(
  history = [],
  bookmarks = [],
  limit = HISTORY_LIMIT,
) {
  let excess = history.length - limit;
  if (excess <= 0) return history;
  return history.filter((entry) => {
    if (excess <= 0 || isKeptEntry(entry, bookmarks)) return true;
    excess--;
    return false;
  });
}

// How many entries bulk delete could remove at all.
export function removableCount(history = [], bookmarks = []) {
  return history.reduce(
    (total, entry) => total + (isKeptEntry(entry, bookmarks) ? 0 : 1),
    0,
  );
}

function markerName(entry) {
  return entry.type === "ultra-rebirth"
    ? `Ultra-rebirth ${entry.count}`
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

// The timeline split into cycles. Each finished cycle is the run of entries
// that a rebirth (or ultra-rebirth) closed, and is named after that marker; the
// cycle still in play has no marker yet and is reported on its own.
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

// Removes the removable entries of one finished cycle: those between the marker
// before it and the marker that closes it. The markers stay, so the timeline
// keeps its dividers and the cycle gate still finds its boundary.
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
  return {
    history: history.filter((_, i) => !doomed.has(i)),
    removed: doomed.size,
  };
}

// Removes the oldest removable entries, by time, up to the number asked for.
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
  return {
    history: history.filter((_, i) => !doomed.has(i)),
    removed: doomed.size,
  };
}
