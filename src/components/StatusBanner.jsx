import React from "react";
import { AlertTriangle, ArrowUpRight, Wrench, X } from "lucide-react";
import { STATUS_PAGE_URL, SEVERITY_LABELS } from "../status-page.js";
import { dismissStatusIssue, useStatusIssue } from "../use-status-issue.js";
import "../status-banner.css";

function headlineFor(issue) {
  switch (issue.severity) {
    case "critical":
      return "RNGdle Infinite is having a major outage.";
    case "major":
      return "We’re having issues with RNGdle Infinite.";
    case "minor":
      return "RNGdle Infinite is running degraded.";
    case "maintenance":
      return "Scheduled maintenance for RNGdle Infinite.";
    default:
      return "We’re having issues with RNGdle Infinite.";
  }
}

function bodyFor(issue) {
  if (issue.kind === "maintenance") {
    return issue.scheduledFor
      ? `Maintenance window starting ${new Date(issue.scheduledFor).toLocaleString()}. Online features may be unavailable meanwhile; progress on this device is safe.`
      : "Online features may be unavailable during the maintenance window. Your progress on this device is safe.";
  }
  return (
    issue.description ||
    "Some features, like online backup, may not work right now. Your progress on this device is safe."
  );
}

// Full-width notice under the header, on every page. Color and text follow the
// incident severity and the latest status update is summarized when available.
// Dismissal is per incident (kept in the shared status store), so the header
// indicator can bring the banner back and a new incident shows it again.
export default function StatusBanner() {
  const { issue, dismissedId } = useStatusIssue();
  if (!issue || dismissedId === issue.id) return null;

  const severity = issue.severity ?? "major";
  const maintenance = issue.kind === "maintenance";
  const Icon = maintenance ? Wrench : AlertTriangle;

  return (
    <div
      className={`status-banner is-${severity}`}
      role={
        severity === "critical" || severity === "major" ? "alert" : "status"
      }
      aria-label="RNGdle Infinite service notice"
      data-testid="status-banner"
      data-kind={issue.kind}
      data-severity={severity}
    >
      <Icon size={15} aria-hidden="true" className="status-banner-icon" />
      <span className="status-banner-copy">
        <strong>
          {headlineFor(issue)}
          <em className="status-banner-tag">
            {SEVERITY_LABELS[severity] ?? severity}
            {issue.status ? ` · ${issue.status}` : ""}
          </em>
        </strong>
        <span>{bodyFor(issue)}</span>
      </span>
      <a
        className="status-banner-link"
        href={issue.url ?? STATUS_PAGE_URL}
        target="_blank"
        rel="noreferrer"
      >
        More info <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      <button
        type="button"
        className="status-banner-close"
        aria-label="Dismiss status banner"
        onClick={dismissStatusIssue}
      >
        <X size={13} />
      </button>
    </div>
  );
}
