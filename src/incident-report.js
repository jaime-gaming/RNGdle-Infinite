import { isErrorReference } from "./error-codes.js";

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
const REPORT_PATH = "/api/client-errors";
const REPORT_COOLDOWN_MS = 5 * 60_000;
const lastSentByCode = new Map();

export function shouldReportIncident(reference) {
  if (!isErrorReference(reference)) return false;
  if (reference.startsWith("AC"))
    return REPORTABLE_ACCOUNT_CODES.has(reference);
  return REPORTABLE_GROUPS.has(reference.slice(0, 2));
}

export function reportIncident({ code, source = "ui-notice" } = {}) {
  if (
    !shouldReportIncident(code) ||
    !["render-boundary", "ui-notice"].includes(source) ||
    import.meta.env?.PROD !== true ||
    typeof window === "undefined"
  )
    return false;

  const now = Date.now();
  if (now - (lastSentByCode.get(code) ?? 0) < REPORT_COOLDOWN_MS) return false;
  lastSentByCode.set(code, now);

  try {
    void fetch(REPORT_PATH, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      mode: "same-origin",
      referrerPolicy: "no-referrer",
      // Never send the stack, message text, account ID, save, roll, or page URL.
      body: JSON.stringify({ code, source }),
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
