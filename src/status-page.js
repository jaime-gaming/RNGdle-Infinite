// Public status page (incident.io) for jaime-gaming services. The summary
// endpoint is public, CORS-enabled and meant for exactly this kind of check.
export const STATUS_PAGE_URL = "https://status.jaime-gaming.com/";
export const STATUS_SUMMARY_URL =
  "https://status.jaime-gaming.com/api/v2/summary.json";
export const STATUS_SERVICE_NAME = "RNGdle Infinite";
export const STATUS_POLL_INTERVAL_MS = 60_000;
export const STATUS_FETCH_TIMEOUT_MS = 8_000;

// incident.io lifecycle statuses that mean "no longer an active problem".
const RESOLVED_INCIDENT_STATUSES = new Set([
  "resolved",
  "completed",
  "cancelled",
  "canceled",
]);
const RESOLVED_MAINTENANCE_STATUSES = new Set([
  "completed",
  "cancelled",
  "canceled",
]);
const OPERATIONAL = "operational";
const UNDER_MAINTENANCE = "under_maintenance";

// Banner severity drives its color: critical (red), major (amber),
// minor/maintenance (neutral).
export const SEVERITY_LABELS = {
  critical: "Outage",
  major: "Issues",
  minor: "Degraded",
  maintenance: "Maintenance",
};

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

// ONLY RNGdle Infinite matters: incidents or maintenances that name another
// service (Wave, Website & Docs, ...) are ignored on purpose.
function matchesService(text) {
  return normalize(text).includes("rngdle");
}

function severityOf({ incident, componentStatus }) {
  const impact = normalize(incident?.impact);
  if (componentStatus === "full_outage" || impact === "critical")
    return "critical";
  if (
    componentStatus === "partial_outage" ||
    impact === "major" ||
    incident // an active incident with unknown impact is at least "major"
  )
    return "major";
  if (componentStatus === "degraded_performance" || impact === "minor")
    return "minor";
  if (componentStatus === UNDER_MAINTENANCE) return "maintenance";
  return incident ? "major" : "minor";
}

// incident.io update bodies are markdown; keep the banner readable.
export function plainSnippet(text, maxLength = 160) {
  const plain = String(text ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/[*_`>#~]/g, "") // emphasis / heading / quote marks
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Turn a summary.json payload into a banner model, or null when the game is
 * healthy (or the payload cannot be trusted). Never throws.
 */
export function serviceIssueFromSummary(summary) {
  try {
    if (!summary || typeof summary !== "object") return null;
    const components = Array.isArray(summary.components)
      ? summary.components
      : [];
    const incidents = Array.isArray(summary.incidents) ? summary.incidents : [];
    const maintenances = Array.isArray(summary.scheduled_maintenances)
      ? summary.scheduled_maintenances
      : [];

    const component = components.find(
      (entry) => normalize(entry?.name) === normalize(STATUS_SERVICE_NAME),
    );
    const componentStatus = normalize(component?.status);
    const componentDown =
      component && componentStatus !== OPERATIONAL && componentStatus !== ""
        ? component
        : null;

    const activeIncident = incidents.find((incident) => {
      if (RESOLVED_INCIDENT_STATUSES.has(normalize(incident?.status)))
        return false;
      return matchesService(incident?.name);
    });

    const activeMaintenance = maintenances.find((maintenance) => {
      if (RESOLVED_MAINTENANCE_STATUSES.has(normalize(maintenance?.status)))
        return false;
      return matchesService(maintenance?.name);
    });

    if (!componentDown && !activeIncident && !activeMaintenance) return null;

    const source = activeIncident ?? activeMaintenance ?? null;
    const isMaintenance =
      !activeIncident &&
      (activeMaintenance || componentStatus === UNDER_MAINTENANCE);
    const latestUpdate = Array.isArray(source?.incident_updates)
      ? [...source.incident_updates].sort((a, b) =>
          String(b?.created_at ?? "").localeCompare(
            String(a?.created_at ?? ""),
          ),
        )[0]
      : null;

    return {
      kind: isMaintenance ? "maintenance" : "incident",
      severity: isMaintenance
        ? "maintenance"
        : severityOf({ incident: activeIncident, componentStatus }),
      id: source?.id ?? `component:${component?.id ?? "unknown"}`,
      componentName: component?.name ?? STATUS_SERVICE_NAME,
      componentStatus: componentDown ? component.status : OPERATIONAL,
      title: source?.name ?? null,
      status: source?.status ?? null,
      impact: source?.impact ?? null,
      description: plainSnippet(latestUpdate?.body ?? ""),
      scheduledFor: source?.scheduled_for ?? null,
      scheduledUntil: source?.scheduled_until ?? null,
      url: source?.id
        ? `https://status.jaime-gaming.com/incidents/${source.id}`
        : STATUS_PAGE_URL,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the public status summary and reduce it to a banner model. Any
 * network, CORS or parse failure resolves to null: a broken status check must
 * never break the game.
 */
export async function fetchServiceIssue({
  summaryUrl = STATUS_SUMMARY_URL,
  timeoutMs = STATUS_FETCH_TIMEOUT_MS,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (!fetchImpl) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(summaryUrl, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!response?.ok) return null;
    const summary = await response.json();
    return serviceIssueFromSummary(summary);
  } catch {
    return null;
  }
}
