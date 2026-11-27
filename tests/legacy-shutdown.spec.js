import { test, expect, pauseClockAt } from "./helpers/clock.js";
import {
  LEGACY_SHUTDOWN_AT,
  legacyShutdownState,
} from "../src/legacy-shutdown.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { emptyProgress } from "../src/progress.js";
import { waitForApp } from "./helpers/app.js";

test("Legacy closes at Spanish peninsular midnight, not UTC midnight", () => {
  expect(new Date(LEGACY_SHUTDOWN_AT).toISOString()).toBe(
    "2026-11-30T23:00:00.000Z",
  );
  expect(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      dateStyle: "short",
      timeStyle: "short",
      hour12: false,
    }).format(LEGACY_SHUTDOWN_AT),
  ).toBe("01/12/2026, 00:00");
  expect(legacyShutdownState(LEGACY_SHUTDOWN_AT - 1).closed).toBe(false);
  expect(legacyShutdownState(LEGACY_SHUTDOWN_AT).closed).toBe(true);
  expect(legacyShutdownState(LEGACY_SHUTDOWN_AT + 100000)).toMatchObject({
    closed: true,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  expect(legacyShutdownState(LEGACY_SHUTDOWN_AT - 90061000)).toMatchObject({
    days: 1,
    hours: 1,
    minutes: 1,
    seconds: 1,
  });
});
test("the root-domain game remains usable after the Legacy deadline", async ({
  page,
}) => {
  await seedProgress(page, { ...emptyProgress(), profile: testProfile });
  await pauseClockAt(page, Date.UTC(2026, 11, 2));
  await page.goto("/");
  await waitForApp(page);
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".legacy-closed")).toHaveCount(0);
  await expect(page.locator(".mirror-notice")).toHaveCount(0);
});
