import { test, expect } from "@playwright/test";
import {
  FRESH_START_PRESTIGES,
  PROGRESS_KEY,
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
} from "../src/progress.js";
import { RNGWEEN_ID } from "../src/rngween.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";

const during = Date.UTC(2026, 9, 26, 12);
const before = Date.UTC(2026, 9, 10, 12);
const account = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  ...patch,
});
const attend = { type: "attend-event", id: RNGWEEN_ID, at: during };

test("attending an event is stamped once on the account and survives every reset", () => {
  const stamped = applyProgress(account(), attend);
  expect(stamped.events).toEqual({ [RNGWEEN_ID]: { at: during } });
  // Later visits do not move the stamp.
  expect(applyProgress(stamped, { ...attend, at: during + 1 })).toBe(stamped);
  // Guests, unknown events and bad times are refused.
  expect(() => applyProgress(account({ profile: null }), attend)).toThrow();
  expect(() => applyProgress(account(), { ...attend, id: "x" })).toThrow();
  expect(() => applyProgress(account(), { ...attend, at: -1 })).toThrow();
  // Rebirth, prestige, rollback and fresh start all keep it.
  const veteran = {
    ...stamped,
    ultraRebirths: FRESH_START_PRESTIGES,
    rebirths: 7,
    rollbacks: 1,
    balance: 1,
    totalEarned: 1,
  };
  const fresh = applyProgress(veteran, { type: "fresh-start", at: during + 5 });
  expect(fresh.events).toEqual(stamped.events);
  expect(fresh.freshStarts).toBe(1);
  // Signing up again (a new account) starts without it; a repaired save
  // keeps only known events with valid times.
  const parsed = parseAndRepairProgress(
    JSON.stringify({
      ...stamped,
      events: { [RNGWEEN_ID]: { at: during }, bogus: { at: 1 }, late: null },
    }),
  ).progress;
  expect(parsed.events).toEqual({ [RNGWEEN_ID]: { at: during } });
  expect(
    parseAndRepairProgress(JSON.stringify({ ...stamped, events: "nope" }))
      .progress.events,
  ).toEqual({});
});

test("opening the game during RNGween stamps the account with the website clock, never a guest", async ({
  page,
}) => {
  const saved = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);
  const clock = await mockSeasonClock(page, before);
  await seedProgress(page, { balance: 10, totalEarned: 10 });
  await page.goto("/");
  await expect.poll(saved).toHaveProperty("profile");
  // Before the event: nothing.
  await page.waitForTimeout(500);
  expect((await saved()).events ?? {}).toEqual({});
  // During the event: stamped on first load, with the website's time.
  clock.set(during);
  await page.reload();
  await expect
    .poll(async () => (await saved()).events?.[RNGWEEN_ID]?.at)
    .toBeGreaterThanOrEqual(during);
  const stamp = (await saved()).events[RNGWEEN_ID].at;
  expect(stamp).toBeLessThan(during + 60_000);
  // A later day does not move it.
  clock.set(during + 86_400_000);
  await page.reload();
  await page.waitForTimeout(800);
  expect((await saved()).events[RNGWEEN_ID].at).toBe(stamp);
});
