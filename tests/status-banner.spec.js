import { readFileSync } from "node:fs";
import { expect, test } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import {
  MAINTENANCE_NOTICE_LEAD_MS,
  maintenanceActiveFor,
  maintenanceNoticeVisible,
  maintenanceSettingsVisible,
  serviceIssuesFromSummary,
  STATUS_POLL_INTERVAL_MS,
} from "../src/status-page.js";

const summary = (title, body) => ({
  components: [
    { id: "rngdle", name: "RNGdle Infinite", status: "degraded_performance" },
  ],
  incidents: [
    {
      id: "incident-1",
      name: `RNGdle Infinite: ${title}`,
      status: "investigating",
      impact: "minor",
      incident_updates: [{ body, created_at: "2026-11-08T00:00:00Z" }],
    },
  ],
  scheduled_maintenances: [],
});

test("scheduled maintenance moves from the Settings footer to live notices at 24 hours", () => {
  const now = Date.UTC(2026, 10, 10);
  const issue = {
    kind: "maintenance",
    status: "scheduled",
    componentStatus: "operational",
    scheduledFor: new Date(now + MAINTENANCE_NOTICE_LEAD_MS + 1).toISOString(),
    scheduledUntil: null,
  };
  expect(maintenanceNoticeVisible(issue, now)).toBe(false);
  expect(maintenanceSettingsVisible(issue, now)).toBe(true);
  const urgent = {
    ...issue,
    scheduledFor: new Date(now + MAINTENANCE_NOTICE_LEAD_MS).toISOString(),
  };
  expect(maintenanceNoticeVisible(urgent, now)).toBe(false);
  expect(maintenanceSettingsVisible(urgent, now)).toBe(true);
  const withinDay = {
    ...urgent,
    scheduledFor: new Date(now + MAINTENANCE_NOTICE_LEAD_MS - 1).toISOString(),
  };
  expect(maintenanceNoticeVisible(withinDay, now)).toBe(true);
  expect(maintenanceSettingsVisible(withinDay, now)).toBe(false);
  expect(
    maintenanceNoticeVisible(
      {
        ...issue,
        scheduledFor: new Date(now - 1).toISOString(),
        status: "in_progress",
      },
      now,
    ),
  ).toBe(true);
  expect(
    maintenanceNoticeVisible(
      {
        ...issue,
        scheduledFor: new Date(now - 60_000).toISOString(),
        status: "scheduled",
      },
      now,
    ),
  ).toBe(false);
  expect(maintenanceNoticeVisible({ ...issue, kind: "incident" }, now)).toBe(
    false,
  );
});

test("all active matching incidents and future maintenance windows are preserved", () => {
  const now = Date.UTC(2026, 10, 10);
  const data = summary("Database delay", "Backups may be slow.");
  data.incidents.push({
    id: "incident-2",
    name: "RNGdle Infinite: Login failures",
    status: "identified",
    impact: "major",
    incident_updates: [{ body: "Sign-in is affected." }],
  });
  data.scheduled_maintenances.push(
    {
      id: "maintenance-1",
      name: "RNGdle Infinite scheduled maintenance",
      status: "scheduled",
      scheduled_for: new Date(
        now + 3 * MAINTENANCE_NOTICE_LEAD_MS,
      ).toISOString(),
      scheduled_until: new Date(
        now + 4 * MAINTENANCE_NOTICE_LEAD_MS,
      ).toISOString(),
    },
    {
      id: "maintenance-linked-service",
      name: "Scheduled maintenance",
      status: "scheduled",
      scheduled_for: new Date(
        now + 2 * MAINTENANCE_NOTICE_LEAD_MS,
      ).toISOString(),
      scheduled_until: new Date(
        now + 3 * MAINTENANCE_NOTICE_LEAD_MS,
      ).toISOString(),
      components: [{ id: "rngdle", name: "RNGdle Infinite" }],
    },
    {
      id: "maintenance-other-service",
      name: "Other service maintenance",
      status: "scheduled",
      scheduled_for: new Date(now + MAINTENANCE_NOTICE_LEAD_MS).toISOString(),
    },
  );
  const issues = serviceIssuesFromSummary(data, now);
  expect(issues.map((issue) => issue.id)).toEqual([
    "incident-1",
    "incident-2",
    "maintenance-1",
    "maintenance-linked-service",
  ]);
  expect(issues.filter((issue) => issue.kind === "incident")).toHaveLength(2);
  expect(issues.filter((issue) => issue.kind === "maintenance")).toHaveLength(
    2,
  );
});

test("status notices refresh every minute and reflow the interface", async ({
  page,
}) => {
  expect(STATUS_POLL_INTERVAL_MS).toBe(60_000);
  let calls = 0;
  await page.route("**/api/v2/summary.json", (route) => {
    calls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json:
        calls === 1
          ? summary("First incident", "First incident details")
          : summary("Second incident", "Second incident details"),
    });
  });
  await page.goto("/");
  await waitForApp(page);
  const banner = page.getByTestId("status-banner");
  await expect(banner).toContainText("First incident details");

  const geometry = await page.evaluate(() => {
    const header = document.querySelector(".header")?.getBoundingClientRect();
    const notice = document
      .querySelector(".status-banner")
      ?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return {
      headerBottom: header?.bottom ?? 0,
      bannerTop: notice?.top ?? 0,
      bannerBottom: notice?.bottom ?? 0,
      mainTop: main?.top ?? 0,
    };
  });
  expect(geometry.bannerTop).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.mainTop).toBeGreaterThanOrEqual(geometry.bannerBottom);

  await page.clock.runFor(60_100);
  await expect(banner).toContainText("Second incident details");
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("production config has no App Check or reCAPTCHA site key", () => {
  const env = readFileSync(
    new URL("../.env.production", import.meta.url),
    "utf8",
  );
  const firebase = readFileSync(
    new URL("../src/firebase.js", import.meta.url),
    "utf8",
  );
  expect(env).not.toContain("APPCHECK");
  expect(env).not.toContain("recaptcha");
  expect(firebase).not.toContain("app-check");
  expect(firebase).not.toContain("ReCaptcha");
});

test("scheduled maintenance never gates gameplay before its start time", () => {
  const startsAt = Date.UTC(2026, 10, 12, 12);
  const scheduled = {
    kind: "maintenance",
    status: "in_progress",
    componentStatus: "under_maintenance",
    scheduledFor: new Date(startsAt).toISOString(),
  };
  expect(maintenanceActiveFor(scheduled, startsAt - 1)).toBe(false);
  expect(maintenanceActiveFor(scheduled, startsAt)).toBe(true);
  expect(
    maintenanceActiveFor({ ...scheduled, scheduledFor: "invalid" }, startsAt),
  ).toBe(true);
});
