// Anchor once to wall time, then measure elapsed time monotonically. Changing
// the system clock or Date.now while a tab is open cannot skip its cooldown.
// A new document/time origin must re-anchor; across reloads this still needs
// trustworthy server time to be tamper-proof.
//
// Tamper resistance: the timing functions are captured at module load, before
// page scripts or an extension can replace them, and are called unbound from
// those captured references. Overwriting window.Date.now or performance.now
// later therefore has no effect on the cooldown, and the monotonic guard below
// means a rewound or fast-forwarded clock cannot shorten a wait either.
const nativeNow =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now.bind(performance)
    : null;
const nativeDateNow = Date.now.bind(Date);
const nativeTimeOrigin =
  typeof performance !== "undefined" ? performance.timeOrigin : undefined;

let origin, base, last;
// The highest value ever returned. Time is only ever allowed to move forwards.
let ceiling = 0;

export function gameNow() {
  // Without a monotonic source, fall back to wall time but still refuse to
  // ever move backwards.
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
