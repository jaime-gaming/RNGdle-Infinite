import React from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import { reopenStatusIssue, useStatusIssue } from "../use-status-issue.js";
import "../status-banner.css";

export default function StatusIndicator() {
  const { issue } = useStatusIssue();
  if (!issue) return null;

  const maintenance = issue.kind === "maintenance";
  const Icon = maintenance ? Wrench : AlertTriangle;
  const severity = issue.severity ?? "major";

  return (
    <button
      type="button"
      className={`status-indicator is-${severity}`}
      aria-label={`RNGdle Infinite service notice (${severity}). Show details`}
      title="Service notice — tap to show details"
      data-testid="status-indicator"
      onClick={reopenStatusIssue}
    >
      <Icon size={16} aria-hidden="true" />
      <i className="status-indicator-dot" aria-hidden="true" />
    </button>
  );
}
