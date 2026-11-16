const nativeNow =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now.bind(performance)
    : null;
const nativeDateNow = Date.now.bind(Date);
const nativeTimeOrigin =
  typeof performance !== "undefined" ? performance.timeOrigin : undefined;
const PREVIEW_AT = Number(import.meta.env?.VITE_GAME_PREVIEW_AT ?? 0);
const PREVIEW_OFFSET =
  import.meta.env?.DEV && Number.isFinite(PREVIEW_AT) && PREVIEW_AT > 0
    ? PREVIEW_AT - nativeDateNow()
    : 0;

let origin, base, last;

let ceiling = 0;

export function gameNow() {
  if (!nativeNow) {
    ceiling = Math.max(ceiling, nativeDateNow() + PREVIEW_OFFSET);
    return ceiling;
  }
  const current = nativeNow();
  if (
    base === undefined ||
    origin !== nativeTimeOrigin ||
    current < last ||
    !Number.isFinite(current)
  ) {
    origin = nativeTimeOrigin;
    base = nativeDateNow() - current;
  }
  last = current;
  const value = base + current + PREVIEW_OFFSET;
  ceiling = Math.max(ceiling, value);
  return ceiling;
}
