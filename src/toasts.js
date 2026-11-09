const TOAST_KINDS = ["info", "done", "reward", "milestone", "warning", "error"];

export const TOAST_LIMIT = 3;

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
