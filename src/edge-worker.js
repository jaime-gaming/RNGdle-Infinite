const REPORT_PATH = "/api/client-errors";
const INCIDENT_HOST = "api.incident.io";
const INCIDENT_PATH_PREFIX = "/v2/alert_events/http/";
const ALLOWED_ORIGIN = "https://rngdle-infinite.jaime-gaming.com";
const REPORTABLE_GROUPS = new Set(["UI", "SV", "CL", "AC", "NT", "IN"]);
const REPORTABLE_ACCOUNT_CODES = new Set([
  "AC405",
  "AC407",
  "AC408",
  "AC409",
  "AC410",
  "AC411",
  "AC412",
]);
const REPORTABLE_SOURCES = new Set(["render-boundary", "ui-notice"]);
const MAX_BODY_BYTES = 1024;
const IP_WINDOW_MS = 60_000;
const IP_MAX_REPORTS = 8;
const CODE_COOLDOWN_MS = 30_000;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function allowedOriginFor(env) {
  try {
    const candidate = new URL(env.INCIDENT_IO_ALLOWED_ORIGIN ?? ALLOWED_ORIGIN);
    if (
      candidate.protocol === "https:" &&
      candidate.origin === candidate.href.replace(/\/$/, "")
    )
      return candidate.origin;
  } catch {}
  return ALLOWED_ORIGIN;
}

function configuredAlertUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === INCIDENT_HOST &&
      url.pathname.startsWith(INCIDENT_PATH_PREFIX) &&
      url.pathname.length > INCIDENT_PATH_PREFIX.length &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url.href
      : "";
  } catch {
    return "";
  }
}

async function readSmallBody(request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function reportableCode(value) {
  return (
    typeof value === "string" &&
    /^[A-Z]{2}\d{3}$/.test(value) &&
    REPORTABLE_GROUPS.has(value.slice(0, 2)) &&
    (!value.startsWith("AC") || REPORTABLE_ACCOUNT_CODES.has(value))
  );
}

function makeRateGate() {
  const lastByCode = new Map();
  const timestampsByIp = new Map();
  return function rateLimited(ip, code, now) {
    const identity = `${ip}:${code}`;
    const previous = lastByCode.get(identity);
    if (previous !== undefined && now - previous < CODE_COOLDOWN_MS)
      return true;
    const recent = (timestampsByIp.get(ip) ?? []).filter(
      (timestamp) => now - timestamp < IP_WINDOW_MS,
    );
    if (recent.length >= IP_MAX_REPORTS) return true;
    recent.push(now);
    timestampsByIp.set(ip, recent);
    lastByCode.set(identity, now);
    if (timestampsByIp.size > 1000) {
      for (const [key, values] of timestampsByIp) {
        const current = values.filter(
          (timestamp) => now - timestamp < IP_WINDOW_MS,
        );
        if (current.length) timestampsByIp.set(key, current);
        else timestampsByIp.delete(key);
      }
      while (timestampsByIp.size > 1000)
        timestampsByIp.delete(timestampsByIp.keys().next().value);
    }
    if (lastByCode.size > 1000) {
      for (const [key, timestamp] of lastByCode)
        if (now - timestamp > IP_WINDOW_MS) lastByCode.delete(key);
      while (lastByCode.size > 1000)
        lastByCode.delete(lastByCode.keys().next().value);
    }
    return false;
  };
}

export function createIncidentEndpoint({
  fetcher = fetch,
  clock = () => Date.now(),
  rateLimited = makeRateGate(),
} = {}) {
  return async function incidentEndpoint(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname !== REPORT_PATH) return jsonResponse(404, { ok: false });
    if (request.method !== "POST")
      return jsonResponse(405, { ok: false, error: "method-not-allowed" });

    const allowedOrigin = allowedOriginFor(env);
    const origin = request.headers.get("Origin");
    if (origin !== url.origin || origin !== allowedOrigin)
      return jsonResponse(403, { ok: false, error: "origin-not-allowed" });
    const contentType = request.headers
      .get("Content-Type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (
      request.headers.get("Sec-Fetch-Site") === "cross-site" ||
      contentType !== "application/json"
    )
      return jsonResponse(415, { ok: false, error: "unsupported-request" });
    const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
    if (declaredLength > MAX_BODY_BYTES)
      return jsonResponse(413, { ok: false, error: "report-too-large" });

    let input;
    try {
      const body = await readSmallBody(request);
      if (body === null)
        return jsonResponse(413, { ok: false, error: "report-too-large" });
      input = JSON.parse(body);
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid-report" });
    }
    const code = input?.code;
    const source = input?.source;
    if (!reportableCode(code) || !REPORTABLE_SOURCES.has(source))
      return jsonResponse(400, { ok: false, error: "invalid-report" });

    const now = clock();
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (rateLimited(ip, code, now))
      return jsonResponse(202, {
        ok: true,
        accepted: false,
        reason: "throttled",
      });

    const target = configuredAlertUrl(env.INCIDENT_IO_ALERT_EVENTS_URL);
    if (!target)
      return jsonResponse(202, {
        ok: true,
        accepted: false,
        reason: "not-configured",
      });

    const hour = new Date(now).toISOString().slice(0, 13);
    const payload = {
      deduplication_key: `rngdle:${code}:${hour}`,
      description: `A client-side application error was reported. Reference ${code}; source ${source}. No user content or account data is attached.`,
      metadata: {
        application: "RNGdle Infinite",
        reference: code,
        source,
      },
      source_url: `${allowedOrigin}/about`,
      status: "firing",
      title: `RNGdle client error ${code}`,
    };

    try {
      const response = await fetcher(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok)
        return jsonResponse(502, {
          ok: false,
          error: "incident-source-rejected",
        });
      return jsonResponse(202, { ok: true, accepted: true });
    } catch {
      return jsonResponse(502, {
        ok: false,
        error: "incident-source-unavailable",
      });
    }
  };
}

const handleIncidentReport = createIncidentEndpoint();

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === REPORT_PATH)
      return handleIncidentReport(request, env);
    return env.ASSETS.fetch(request);
  },
};
