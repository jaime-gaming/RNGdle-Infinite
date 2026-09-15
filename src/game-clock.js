// Anchor once to wall time, then measure elapsed time monotonically. Changing
// the system clock or Date.now while a tab is open cannot skip its cooldown.
// A new document/time origin must re-anchor; across reloads this still needs
// trustworthy server time to be tamper-proof.
let origin, base, last;
export function gameNow() {
  const current = performance.now();
  if (
    base === undefined ||
    origin !== performance.timeOrigin ||
    current < last
  ) {
    origin = performance.timeOrigin;
    base = Date.now() - current;
  }
  last = current;
  return base + current;
}
