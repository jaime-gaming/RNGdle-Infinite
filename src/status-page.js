import { gameNow } from "./game-clock.js";

export const STATUS_PAGE_URL = "https://status.jaime-gaming.com/";
export const STATUS_SUMMARY_URL =
  "https://status.jaime-gaming.com/api/v2/summary.json";
export const STATUS_SERVICE_NAME = "RNGdle Infinite";
export const STATUS_POLL_INTERVAL_MS = 60_000;
export const STATUS_FETCH_TIMEOUT_MS = 8_000;
export const MAINTENANCE_NOTICE_LEAD_MS = 24 * 60 * 60 * 1000;

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

export function maintenanceNoticeVisible(issue, at = gameNow()) {
  if (!issue || issue.kind !== "maintenance" || !Number.isFinite(at))
    return false;
  const start = Date.parse(issue.scheduledFor ?? "");
  const end = Date.parse(issue.scheduledUntil ?? "");
  const status = normalize(issue.status);
  const componentStatus = normalize(issue.componentStatus);
  const active =
    status === "in_progress" || componentStatus === UNDER_MAINTENANCE;

  if (Number.isFinite(start)) {
    if (at < start) return start - at < MAINTENANCE_NOTICE_LEAD_MS;
    // Inside the scheduled window the maintenance is live even if the
    // provider has not flipped its status flag yet.
    if (Number.isFinite(end)) return at < end;
    return active;
  }
  return active;
}

// Long-range schedules stay discreetly in Settings; the final 24 hours and
// active maintenance are promoted to the same live notice stack as incidents.
export function maintenanceSettingsVisible(issue, at = gameNow()) {
  if (!issue || issue.kind !== "maintenance" || !Number.isFinite(at))
    return false;
  const start = Date.parse(issue.scheduledFor ?? "");
  if (!Number.isFinite(start) || start <= at) return false;
  return start - at >= MAINTENANCE_NOTICE_LEAD_MS;
}

export function maintenanceActiveFor(issueOrIssues, at = gameNow()) {
  const issues = Array.isArray(issueOrIssues) ? issueOrIssues : [issueOrIssues];
  return issues.some((issue) => {
    if (!issue || issue.kind !== "maintenance") return false;
    const start = Date.parse(issue.scheduledFor ?? "");
    const end = Date.parse(issue.scheduledUntil ?? "");
    // Status providers can publish an in-progress flag ahead of the window;
    // never gate gameplay before its explicitly scheduled start.
    if (Number.isFinite(start) && Number.isFinite(at) && at < start)
      return false;
    // The scheduled window itself is authoritative: a maintenance whose
    // window has started is live even if its status flag still says
    // "scheduled" and the component has not flipped yet.
    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      Number.isFinite(at) &&
      at >= start &&
      at < end
    )
      return true;
    const status = normalize(issue.status);
    return (
      status === "in_progress" ||
      normalize(issue.componentStatus) === UNDER_MAINTENANCE
    );
  });
}

function matchesService(text) {
  return normalize(text).includes("rngdle");
}

function findServiceComponent(components) {
  const list = Array.isArray(components) ? components : [];
  return (
    list.find(
      (entry) => normalize(entry?.name) === normalize(STATUS_SERVICE_NAME),
    ) ??
    list.find((entry) => matchesService(entry?.name)) ??
    // A dedicated status page with a single component is this game, whatever
    // that component is called in the provider.
    (list.length === 1 ? list[0] : null)
  );
}

function linkedComponents(record) {
  return [
    ...(Array.isArray(record?.components) ? record.components : []),
    ...(Array.isArray(record?.component_ids) ? record.component_ids : []),
    ...(record?.component_id ? [record.component_id] : []),
  ];
}

function linkedToService(record, serviceComponent) {
  const linked = linkedComponents(record);
  if (!linked.length) return false;
  if (!serviceComponent)
    return linked.some((entry) => {
      const name =
        typeof entry === "object"
          ? entry?.name
          : typeof entry === "string"
            ? entry
            : "";
      return matchesService(name);
    });
  return linked.some((entry) => {
    const id = typeof entry === "object" ? entry?.id : entry;
    const name =
      typeof entry === "object"
        ? entry?.name
        : typeof entry === "string"
          ? entry
          : "";
    return (
      (serviceComponent.id != null &&
        String(id ?? "") === String(serviceComponent.id)) ||
      normalize(name) === normalize(serviceComponent.name) ||
      matchesService(name)
    );
  });
}

function matchesServiceRecord(record, serviceComponent, componentCount) {
  if (matchesService(record?.name)) return true;
  const linked = linkedComponents(record);
  if (linked.length) return linkedToService(record, serviceComponent);
  // Unlinked records are page-level. This status page is dedicated to
  // RNGdle Infinite, so a page-level maintenance or incident belongs to
  // this game unless it explicitly names another service.
  if (serviceComponent) {
    const name = normalize(record?.name);
    if (name.includes("other service")) return false;
    return true;
  }
  // No identifiable service component: only trust explicit mentions, plus
  // the classic generic maintenance titles on a single-component page.
  const genericName = [
    "maintenance",
    "scheduled maintenance",
    "upcoming maintenance",
  ].includes(normalize(record?.name));
  return linked.length === 0 && componentCount === 1 && genericName;
}

function severityOf({ incident, componentStatus }) {
  const impact = normalize(incident?.impact);
  if (componentStatus === "full_outage" || impact === "critical")
    return "critical";
  if (componentStatus === "partial_outage" || impact === "major" || incident)
    return "major";
  if (componentStatus === "degraded_performance" || impact === "minor")
    return "minor";
  if (componentStatus === UNDER_MAINTENANCE) return "maintenance";
  return incident ? "major" : "minor";
}

export function plainSnippet(text, maxLength = 160) {
  const plain = String(text ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

function latestUpdate(source) {
  return Array.isArray(source?.incident_updates)
    ? [...source.incident_updates].sort((a, b) =>
        String(b?.created_at ?? "").localeCompare(String(a?.created_at ?? "")),
      )[0]
    : null;
}

function issueRecord(source, { kind, component, componentStatus }) {
  const update = latestUpdate(source);
  const maintenance = kind === "maintenance";
  return {
    kind,
    severity: maintenance
      ? "maintenance"
      : severityOf({ incident: source, componentStatus }),
    id: source?.id ?? `component:${component?.id ?? "unknown"}`,
    componentName: component?.name ?? STATUS_SERVICE_NAME,
    componentStatus: componentStatus ?? OPERATIONAL,
    title: source?.name ?? null,
    status: source?.status ?? null,
    impact: source?.impact ?? null,
    description: plainSnippet(update?.body ?? source?.description ?? ""),
    scheduledFor: source?.scheduled_for ?? null,
    scheduledUntil: source?.scheduled_until ?? null,
    url: source?.id
      ? maintenance
        ? STATUS_PAGE_URL
        : `https://status.jaime-gaming.com/incidents/${source.id}`
      : STATUS_PAGE_URL,
  };
}

export function serviceIssuesFromSummary(summary, at = gameNow()) {
  try {
    if (!summary || typeof summary !== "object") return [];
    const components = Array.isArray(summary.components)
      ? summary.components
      : [];
    const incidents = Array.isArray(summary.incidents) ? summary.incidents : [];
    const maintenances = Array.isArray(summary.scheduled_maintenances)
      ? summary.scheduled_maintenances
      : [];
    const component = findServiceComponent(components);
    const componentStatus = normalize(component?.status);
    const componentDown =
      component && componentStatus !== OPERATIONAL && componentStatus !== ""
        ? component
        : null;

    const activeIncidents = incidents.filter(
      (incident) =>
        !RESOLVED_INCIDENT_STATUSES.has(normalize(incident?.status)) &&
        matchesService(incident?.name),
    );
    const activeMaintenances = maintenances.filter((maintenance) => {
      if (
        RESOLVED_MAINTENANCE_STATUSES.has(normalize(maintenance?.status)) ||
        !matchesServiceRecord(maintenance, component, components.length)
      )
        return false;
      const end = Date.parse(maintenance?.scheduled_until ?? "");
      const isActive = normalize(maintenance?.status) === "in_progress";
      return isActive || !Number.isFinite(end) || end > at;
    });

    const issues = activeIncidents.map((incident) =>
      issueRecord(incident, { kind: "incident", component, componentStatus }),
    );
    // A component-level degradation is useful only when the incident feed did
    // not already explain it, avoiding duplicate notices for the same outage.
    if (
      componentDown &&
      !activeIncidents.length &&
      !(componentStatus === UNDER_MAINTENANCE && activeMaintenances.length)
    )
      issues.push(
        issueRecord(null, {
          kind:
            componentStatus === UNDER_MAINTENANCE ? "maintenance" : "incident",
          component,
          componentStatus,
        }),
      );
    issues.push(
      ...activeMaintenances.map((maintenance) =>
        issueRecord(maintenance, {
          kind: "maintenance",
          component,
          componentStatus,
        }),
      ),
    );
    return issues;
  } catch {
    return [];
  }
}

// Backwards-compatible first-issue helper for consumers that need one status.
export function serviceIssueFromSummary(summary, at = gameNow()) {
  return serviceIssuesFromSummary(summary, at)[0] ?? null;
}

export async function fetchServiceIssues({
  summaryUrl = STATUS_SUMMARY_URL,
  timeoutMs = STATUS_FETCH_TIMEOUT_MS,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (!fetchImpl) return [];
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetchImpl(summaryUrl, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response?.ok) return [];
    return serviceIssuesFromSummary(await response.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchServiceIssue(options) {
  return (await fetchServiceIssues(options))[0] ?? null;
}
