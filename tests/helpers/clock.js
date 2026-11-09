import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install();
    await use(page);
  },
});

export { expect };

export async function pauseClockAt(page, time) {
  const at = time instanceof Date ? time : new Date(time);
  const live = await page.evaluate(() => Date.now());

  if (at.getTime() >= live) return page.clock.pauseAt(at);
  await page.clock.pauseAt(new Date(live + 1000));
  await page.clock.setSystemTime(at);
}
