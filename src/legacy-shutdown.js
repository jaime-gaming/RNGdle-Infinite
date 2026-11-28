export const LEGACY_SHUTDOWN_AT = Date.UTC(2026, 10, 30, 23);
export const LEGACY_SHUTDOWN_LABEL = "December 1, 2026 · 00:00 Madrid (CET)";

export function legacyShutdownState(at = Date.now()) {
  const remaining = Math.max(0, LEGACY_SHUTDOWN_AT - at);
  return {
    closed: at >= LEGACY_SHUTDOWN_AT,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
  };
}

export function legacyNow() {
  const preview = Number(import.meta.env?.VITE_LEGACY_PREVIEW_AT);
  return import.meta.env?.DEV && Number.isFinite(preview) && preview > 0
    ? preview
    : Date.now();
}
