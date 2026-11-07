import { STATUS_SUMMARY_URL } from "../../src/status-page.js";

// Hosting and UI checks must not depend on the live incident service. Tests of
// status parsing and maintenance can install their own route after this one.
export async function mockOperationalStatus(page) {
  await page.route(STATUS_SUMMARY_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { components: [], incidents: [], scheduled_maintenances: [] },
    }),
  );
}
