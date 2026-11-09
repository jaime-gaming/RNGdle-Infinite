const PAUSE_KEY = "rng-infinite-cloud-quota-pause-v1";

export const CLOUD_QUOTA_PAUSE_MS = 15 * 60 * 1000;

function storageOrDefault(storage) {
  return storage ?? globalThis.localStorage;
}

export function isCloudQuotaError(error) {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  return (
    code.includes("resource-exhausted") ||
    code.includes("quota") ||
    code.includes("rate-limit") ||
    /resource_exhausted|resource exhausted|quota|rate.?limit|too many requests|429/.test(
      message,
    )
  );
}

export function cloudQuotaPauseRemaining({ storage, now = Date.now() } = {}) {
  try {
    const raw = storageOrDefault(storage)?.getItem(PAUSE_KEY);
    if (!raw) return 0;
    const until = Number(JSON.parse(raw)?.until ?? 0);
    return Number.isFinite(until) && until > now ? until - now : 0;
  } catch {
    return 0;
  }
}

export function pauseCloudForQuota(
  error,
  { storage, now = Date.now(), pauseMs = CLOUD_QUOTA_PAUSE_MS } = {},
) {
  if (!isCloudQuotaError(error) || pauseMs <= 0) return 0;
  try {
    storageOrDefault(storage)?.setItem(
      PAUSE_KEY,
      JSON.stringify({ until: now + pauseMs, at: now }),
    );
  } catch {}
  return pauseMs;
}

export function clearCloudQuotaPause({ storage } = {}) {
  try {
    storageOrDefault(storage)?.removeItem(PAUSE_KEY);
  } catch {}
}

export function isCloudQuotaNotice(notice) {
  return (
    typeof notice === "string" &&
    notice.startsWith("Online backup is paused")
  );
}

export function cloudQuotaNotice(remainingMs) {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const unit = minutes === 1 ? "minute" : "minutes";
  return `Online backup is paused to protect the free daily quota. Progress stays on this device; retry in ${minutes} ${unit}.`;
}
