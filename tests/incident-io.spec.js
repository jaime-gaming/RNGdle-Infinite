import { expect, test } from "./helpers/clock.js";
import { createIncidentEndpoint } from "../src/edge-worker.js";
import { shouldReportIncident } from "../src/incident-report.js";

const origin = "https://rngdle-infinite.jaime-gaming.com";
const sourceUrl = "https://api.incident.io/v2/alert_events/http/test-source-id";

function reportRequest(
  payload = { code: "CL301", source: "ui-notice" },
  host = origin,
) {
  return new Request(`${origin}/api/client-errors`, {
    method: "POST",
    headers: {
      Origin: host,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: JSON.stringify(payload),
  });
}

test("incident forwarding is dormant until its server-only alert-source URL is configured", async () => {
  let forwarded = false;
  const handler = createIncidentEndpoint({
    fetcher: async () => {
      forwarded = true;
      return new Response(null, { status: 202 });
    },
    clock: () => Date.UTC(2026, 10, 27),
  });
  const response = await handler(reportRequest(), {});
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    accepted: false,
    reason: "not-configured",
  });
  expect(forwarded).toBe(false);
});

test("incident reports are normalized, deduplicated, and omit user data", async () => {
  const sent = [];
  const handler = createIncidentEndpoint({
    fetcher: async (url, options) => {
      sent.push({ url, options, payload: JSON.parse(options.body) });
      return new Response(null, { status: 202 });
    },
    clock: () => Date.UTC(2026, 10, 27, 13, 42),
  });
  const env = { INCIDENT_IO_ALERT_EVENTS_URL: sourceUrl };
  const request = reportRequest({
    code: "CL301",
    source: "ui-notice",
    username: "must-not-forward",
    stack: "must-not-forward",
  });
  const first = await handler(request, env);
  expect(first.status).toBe(202);
  expect(await first.json()).toMatchObject({ accepted: true });
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(sourceUrl);
  expect(sent[0].payload).toMatchObject({
    status: "firing",
    title: "RNGdle client error CL301",
    deduplication_key: "rngdle:CL301:2026-11-27T13",
    metadata: { application: "RNGdle Infinite", reference: "CL301" },
  });
  expect(JSON.stringify(sent[0].payload)).not.toContain("must-not-forward");
  expect(sent[0].options.headers.Authorization).toBeUndefined();

  const repeated = await handler(reportRequest(), env);
  expect(repeated.status).toBe(202);
  expect(await repeated.json()).toMatchObject({
    accepted: false,
    reason: "throttled",
  });
  expect(sent).toHaveLength(1);
});

test("incident endpoint rejects cross-origin and non-operational game messages", async () => {
  const handler = createIncidentEndpoint({
    fetcher: async () => new Response(null, { status: 202 }),
  });
  const env = { INCIDENT_IO_ALERT_EVENTS_URL: sourceUrl };
  expect(
    (await handler(reportRequest(undefined, "https://evil.example"), env))
      .status,
  ).toBe(403);
  expect(
    (await handler(reportRequest({ code: "GM510", source: "ui-notice" }), env))
      .status,
  ).toBe(400);
  expect(
    (await handler(reportRequest({ code: "AC401", source: "ui-notice" }), env))
      .status,
  ).toBe(400);
});

test("only operational, account, and UI references are sent for triage", () => {
  expect(shouldReportIncident("UI101")).toBe(true);
  expect(shouldReportIncident("CL301")).toBe(true);
  expect(shouldReportIncident("AC411")).toBe(true);
  expect(shouldReportIncident("AC401")).toBe(false);
  expect(shouldReportIncident("GM510")).toBe(false);
  expect(shouldReportIncident("unknown")).toBe(false);
});
