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
