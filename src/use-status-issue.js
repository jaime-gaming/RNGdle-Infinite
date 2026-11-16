import { useSyncExternalStore } from "react";
import { STATUS_POLL_INTERVAL_MS, fetchServiceIssues } from "./status-page.js";

const DISMISS_KEY = "rng-infinite-status-banner-dismissed-v1";

function readDismissed() {
  try {
    const saved = sessionStorage.getItem(DISMISS_KEY) ?? "";
    if (!saved) return [];
    try {
      const value = JSON.parse(saved);
      return Array.isArray(value)
        ? value.filter((id) => typeof id === "string")
        : [saved];
    } catch {
      return [saved];
    }
  } catch {
    return [];
  }
}

function writeDismissed(value) {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(value));
  } catch {}
}

let state = { issue: null, issues: [], dismissedIds: readDismissed() };
const listeners = new Set();
let started = false;
let timer = null;
let inFlight = false;

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

async function poll() {
  if (inFlight) return;
  inFlight = true;
  try {
    const issues = await fetchServiceIssues();
    setState({ issues, issue: issues[0] ?? null });
  } finally {
    inFlight = false;
  }
}

function onVisibility() {
  if (globalThis.document?.visibilityState === "visible") void poll();
}

function start() {
  if (started) return;
  started = true;
  void poll();
  timer = setInterval(() => void poll(), STATUS_POLL_INTERVAL_MS);
  globalThis.addEventListener?.("online", poll);
  globalThis.addEventListener?.("focus", poll);
  globalThis.document?.addEventListener?.("visibilitychange", onVisibility);
}

function stop() {
  if (!started) return;
  started = false;
  if (timer) clearInterval(timer);
  timer = null;
  globalThis.removeEventListener?.("online", poll);
  globalThis.removeEventListener?.("focus", poll);
  globalThis.document?.removeEventListener?.("visibilitychange", onVisibility);
}

function subscribe(listener) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop();
  };
}

export function useStatusIssue() {
  return useSyncExternalStore(subscribe, () => state);
}

export function getStatusIssue() {
  return state.issues.length ? state.issues : state.issue;
}

export function dismissStatusIssue(id = state.issue?.id) {
  if (!id) return;
  const dismissedIds = [...new Set([...state.dismissedIds, id])];
  writeDismissed(dismissedIds);
  setState({ dismissedIds });
}

export function reopenStatusIssue() {
  writeDismissed([]);
  setState({ dismissedIds: [] });
}

export { maintenanceActiveFor } from "./status-page.js";
