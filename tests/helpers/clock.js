import { test as base, expect } from "@playwright/test";

// Files that drive the roll with a virtual clock import `test` from here.
//
// The game anchors its own monotonic clock when its modules load (see
// src/game-clock.js), so a fake clock installed after the page has booted has
// no effect on the reveal or the cooldown. Installing it here — before the
// first navigation — means every assertion about timing is deterministic and
// still exercises the real code path.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install();
    await use(page);
  },
});

export { expect };
// pauseAt() refuses to move backwards, and the suite runs on today's date while
// its fixtures live on fixed dates that may already be in the past. Setting the
// system time first makes the pause valid whatever the calendar says.
export async function pauseClockAt(page, time) {
  const at = time instanceof Date ? time : new Date(time);
  await page.clock.setSystemTime(at);
  await page.clock.pauseAt(at);
}
