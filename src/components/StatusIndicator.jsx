import React from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { maintenanceNoticeVisible } from "../status-page.js";
import { reopenStatusIssue, useStatusIssue } from "../use-status-issue.js";
import "../status-banner.css";

export default function StatusIndicator() {
  const { issues = [], issue, dismissedIds = [] } = useStatusIssue();
  const all = issues.length ? issues : issue ? [issue] : [];
  const active = all.filter(
    (entry) =>
      !dismissedIds.includes(entry.id) &&
      (entry.kind !== "maintenance" || maintenanceNoticeVisible(entry)),
  );
  if (!active.length) return null;

  const severity = active.some((entry) => entry.severity === "critical")
    ? "critical"
    : active.some((entry) => entry.severity === "major")
      ? "major"
      : active.some((entry) => entry.kind === "maintenance")
        ? "maintenance"
        : "minor";
  const Icon = active.some((entry) => entry.kind === "maintenance")
    ? CalendarClock
    : AlertTriangle;

  return (
    <button
      type="button"
      className={`status-indicator is-${severity}`}
      aria-label={`${active.length} service notice${active.length === 1 ? "" : "s"}. Show details`}
      title={`${active.length} service notice${active.length === 1 ? "" : "s"} — tap to show details`}
      data-testid="status-indicator"
      onClick={reopenStatusIssue}
    >
      <Icon size={16} aria-hidden="true" />
      <i className="status-indicator-dot" aria-hidden="true" />
    </button>
  );
}
