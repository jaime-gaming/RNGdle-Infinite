// Calendar events use the website's HTTP clock, never a device date, timezone
// or saved preference. This is separate from gameNow: syncing it cannot change
// a reveal, cooldown, score or price. Browser-only saves are still editable;
// this is clock-change resistance, not server-side reward authentication.
const monotonicNow = globalThis.performance?.now?.bind(globalThis.performance);
const parseServerDate = Date.parse.bind(Date);
const MAX_AGE_MS = 10 * 60 * 1000;
let anchor = null;
let pending = null;
let requests = 0;
let revision = 0;
export const SEASON_CLOCK_CHANGED = "rngdle-season-clock-changed";
function notifyClockChange() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SEASON_CLOCK_CHANGED));
}

// A hidden or resumed tab must reverify before applying time-gated powers.
// Invalidate in-flight checks too, so an old response cannot restore a stale clock.
export function invalidateSeasonClock() {
  revision++;
  anchor = null;
  pending = null;
  notifyClockChange();
}

export function seasonNow() {
  if (!anchor || !monotonicNow) return null;
  const elapsed = monotonicNow() - anchor.tick;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= MAX_AGE_MS)
    return null;
  return anchor.at + elapsed;
}

function requestClock(path, method, start) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("season-clock", `${Math.trunc(start)}-${++requests}`);
  return fetch(url, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
}

async function websiteTime(start) {
  // The whole review branch is erased at build time, including its URL.
  if (import.meta.env.DEV) {
    const reviewClock = document.querySelector(
      'meta[name="rngdle-sandbox-clock"]',
    );
    if (reviewClock?.content === "/__rngdle/season-clock") {
      // Only the explicit dev preview injects this marker. A JSON body survives
      // proxies that replace Date or discard custom response headers.
      const response = await requestClock(
        "/__rngdle/season-clock",
        "GET",
        start,
      );
      if (!response.ok) return null;
      return { at: (await response.json()).at, age: 0 };
    }
  }
  // Fresh, same-origin HEAD verification on Vite and static Pages. It downloads
  // no asset body and never falls back to a device date or third-party service.
  const response = await requestClock(
    `${import.meta.env.BASE_URL}favicon.svg`,
    "HEAD",
    start,
  );
  if (!response.ok) return null;
  return {
    at: parseServerDate(response.headers.get("date")),
    age: Number(response.headers.get("age") ?? 0),
  };
}

export function refreshSeasonClock() {
  if (pending) return pending;
  if (!monotonicNow || typeof window === "undefined")
    return Promise.resolve(null);
  const checkRevision = revision;
  const request = (async () => {
    try {
      const start = monotonicNow();
      const sample = await websiteTime(start);
      if (!sample || checkRevision !== revision) return null;
      const { at, age } = sample;
      const tick = monotonicNow();
      if (!Number.isFinite(at) || !Number.isFinite(age) || age < 0) return null;
      const verified = at + age * 1000 + Math.max(0, tick - start) / 2;
      anchor = { at: Math.max(verified, seasonNow() ?? verified), tick };
      notifyClockChange();
      return seasonNow();
    } catch {
      // No device-clock fallback: ordinary play continues, but a calendar
      // reward requires a recently verified website date.
      return null;
    }
  })();
  pending = request;
  request.finally(() => {
    if (pending === request) pending = null;
  });
  return request;
}
