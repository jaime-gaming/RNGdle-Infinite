// In-game notices: the short cards that say what just happened ("+25,000 EP
// claimed", "New companion joined you"). The queue is plain data, so it can be
// tested without a browser. The cards and their timers live in Toasts.jsx.
//
// A notice is either a plain string (an information line, as it always was) or
// an object: a kind that sets its colour, icon and how long it stays, an
// optional title above the text, an optional icon, and an optional action
// button ("Open History") that also dismisses the notice.

export const TOAST_KINDS = [
  "info",
  "done",
  "reward",
  "milestone",
  "warning",
  "error",
];

// Up to this many notices are on screen at once; the oldest makes room.
export const TOAST_LIMIT = 3;

// How long each kind stays by default. Longer text earns a little more time, so
// a notice can be read without rushing, and it never stays past the cap.
const BASE_MS = {
  info: 3500,
  done: 3500,
  reward: 5000,
  milestone: 5500,
  warning: 7000,
  error: 7000,
};
const CAP_MS = 10000;
const EXTRA_MS_PER_CHARACTER = 35;
const FREE_CHARACTERS = 60;

export function toastLife({ kind, title = "", text = "" }) {
  const base = BASE_MS[kind] ?? BASE_MS.info;
  const extra =
    Math.max(0, `${title} ${text}`.length - FREE_CHARACTERS) *
    EXTRA_MS_PER_CHARACTER;
  return Math.min(CAP_MS, base + extra);
}

// Reads whatever a caller passed. A notice with nothing to say is dropped, and
// an unknown kind is treated as information rather than failing the page.
export function toastFrom(input) {
  if (typeof input === "string") {
    const text = input.trim();
    return text
      ? { kind: "info", title: "", text, icon: null, action: null }
      : null;
  }
  if (!input || typeof input !== "object") return null;
  const kind = TOAST_KINDS.includes(input.kind) ? input.kind : "info";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!title && !text) return null;
  const action =
    input.action &&
    typeof input.action.label === "string" &&
    typeof input.action.onSelect === "function"
      ? { label: input.action.label, onSelect: input.action.onSelect }
      : null;
  return { kind, title, text, icon: input.icon ?? null, action };
}

// The notices on screen, newest last. A notice that repeats one still on screen
// is counted instead of stacked, and its time starts again. Past the limit the
// oldest notice is the one that leaves.
export function pushToast(list, input, id) {
  const notice = toastFrom(input);
  if (!notice) return list;
  const same = list.findIndex(
    (item) =>
      item.kind === notice.kind &&
      item.title === notice.title &&
      item.text === notice.text,
  );
  if (same !== -1)
    return list.map((item, index) =>
      index === same
        ? {
            ...item,
            ...notice,
            count: item.count + 1,
            stamp: id,
            life: toastLife(notice),
          }
        : item,
    );
  const next = [
    ...list,
    { id, ...notice, count: 1, stamp: id, life: toastLife(notice) },
  ];
  return next.slice(Math.max(0, next.length - TOAST_LIMIT));
}

export function removeToast(list, id) {
  return list.filter((item) => item.id !== id);
}
