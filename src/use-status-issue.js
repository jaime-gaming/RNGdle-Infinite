import { useSyncExternalStore } from "react";
import { STATUS_POLL_INTERVAL_MS, fetchServiceIssue } from "./status-page.js";

const DISMISS_KEY = "rng-infinite-status-banner-dismissed-v1";

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDismissed(value) {
  try {
    sessionStorage.setItem(DISMISS_KEY, value);
  } catch {}
}

let state = { issue: null, dismissedId: readDismissed() };
const listeners = new Set();
let started = false;
let timer = null;

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

async function poll() {
  const issue = await fetchServiceIssue();
  setState({ issue });
}

function start() {
  if (started) return;
  started = true;
  poll();
  timer = setInterval(poll, STATUS_POLL_INTERVAL_MS);
  globalThis.addEventListener?.("online", poll);
}

function subscribe(listener) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function useStatusIssue() {
  return useSyncExternalStore(subscribe, () => state);
}

export function getStatusIssue() {
  return state.issue;
}

export function dismissStatusIssue() {
  const id = state.issue?.id ?? "";
  writeDismissed(id);
  setState({ dismissedId: id });
}

export function reopenStatusIssue() {
  writeDismissed("");
  setState({ dismissedId: "" });
}

export function maintenanceActiveFor(issue) {
  if (!issue || issue.kind !== "maintenance") return false;
  const status = String(issue.status ?? "")
    .trim()
    .toLowerCase();
  return (
    status === "in_progress" || issue.componentStatus === "under_maintenance"
  );
}
