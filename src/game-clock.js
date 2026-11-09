const nativeNow =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now.bind(performance)
    : null;
const nativeDateNow = Date.now.bind(Date);
const nativeTimeOrigin =
  typeof performance !== "undefined" ? performance.timeOrigin : undefined;

let origin, base, last;

let ceiling = 0;

export function gameNow() {
  if (!nativeNow) {
    ceiling = Math.max(ceiling, nativeDateNow());
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
  const value = base + current;
  ceiling = Math.max(ceiling, value);
  return ceiling;
}
