import { STATUS_SUMMARY_URL } from "../../src/status-page.js";

export async function mockOperationalStatus(page) {
  await page.route(STATUS_SUMMARY_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { components: [], incidents: [], scheduled_maintenances: [] },
    }),
  );
}
