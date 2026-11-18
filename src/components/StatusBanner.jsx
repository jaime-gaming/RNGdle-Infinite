import React from "react";
import { AlertTriangle, ArrowUpRight, CalendarClock, X } from "lucide-react";
import {
  STATUS_PAGE_URL,
  SEVERITY_LABELS,
  maintenanceNoticeVisible,
} from "../status-page.js";
import { dismissStatusIssue, useStatusIssue } from "../use-status-issue.js";
import "../status-banner.css";

function headingFor(issue) {
  if (issue.kind === "maintenance")
    return issue.status === "in_progress"
      ? "Scheduled maintenance is in progress."
      : "Scheduled maintenance starts soon.";
  if (issue.title) return issue.title;
  switch (issue.severity) {
    case "critical":
      return "RNGdle Infinite is having a major outage.";
    case "major":
      return "We’re having issues with RNGdle Infinite.";
    case "minor":
      return "RNGdle Infinite is running degraded.";
    default:
      return "We’re having issues with RNGdle Infinite.";
  }
}

function bodyFor(issue) {
  if (issue.kind === "maintenance") {
    const description =
      issue.description || "RNGdle Infinite will be temporarily unavailable.";
    const timing = issue.scheduledFor
      ? `Starts ${new Date(issue.scheduledFor).toLocaleString()}${issue.scheduledUntil ? ` · expected to end ${new Date(issue.scheduledUntil).toLocaleString()}` : ""}.`
      : "";
    return [description, timing].filter(Boolean).join(" · ");
  }
  return (
    issue.description ||
    "Some features, like online backup, may not work right now. Your progress on this device is safe."
  );
}

export default function StatusBanner() {
  const { issues = [], issue, dismissedIds = [] } = useStatusIssue();
  const candidates = issues.length ? issues : issue ? [issue] : [];
  const visible = candidates.filter(
    (entry) =>
      !dismissedIds.includes(entry.id) &&
      (entry.kind !== "maintenance" || maintenanceNoticeVisible(entry)),
  );
  if (!visible.length) return null;

  return (
    <div
      className="status-banner-stack"
      data-testid="status-banner"
      aria-label={`${visible.length} service notice${visible.length === 1 ? "" : "s"}`}
    >
      {visible.map((entry) => {
        const severity = entry.severity ?? "major";
        const maintenance = entry.kind === "maintenance";
        const Icon = maintenance ? CalendarClock : AlertTriangle;
        return (
          <article
            className={`status-banner is-${severity}`}
            role={
              severity === "critical" || severity === "major"
                ? "alert"
                : "status"
            }
            key={entry.id}
            aria-label="RNGdle Infinite service notice"
            data-kind={entry.kind}
            data-severity={severity}
          >
            <Icon size={17} aria-hidden="true" className="status-banner-icon" />
            <span className="status-banner-copy">
              <strong>
                {headingFor(entry)}
                <em className="status-banner-tag">
                  {SEVERITY_LABELS[severity] ?? severity}
                  {entry.status
                    ? ` · ${entry.status.replaceAll("_", " ")}`
                    : ""}
                </em>
              </strong>
              <span>{bodyFor(entry)}</span>
            </span>
            <a
              className="status-banner-link"
              aria-label={`Open status details for ${headingFor(entry)}`}
              href={entry.url ?? STATUS_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Details <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="status-banner-close"
              aria-label={`Dismiss notice: ${headingFor(entry)}`}
              onClick={() => dismissStatusIssue(entry.id)}
            >
              <X size={14} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
