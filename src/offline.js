// Browser-local accounting, not a background server. Timestamp tampering cannot
// be made authoritative without a backend. A visible tab keeps the account online.
export const OFFLINE_INTERVAL = 600000;
export const OFFLINE_CAP = 144;
export const OFFLINE_INTERVALS = [600000, 450000, 300000];
export const PRESENCE_PREFIX = "rng-infinite-presence-v1:";
const amount = (n) => Number.isSafeInteger(n) && n >= 0;
const timestamp = (n) => amount(n) && n <= 8640000000000000;
export function parseOffline(value, owned) {
  if (!owned.includes("offline-roller") || value == null) return null;
  if (!timestamp(value.lastSeenAt))
    throw new Error("Invalid offline timestamp");
  let batch = null,
    report = null;
  if (value.batch) {
    const b = value.batch;
    const intervalMS = b.intervalMS ?? OFFLINE_INTERVAL;
    if (
      typeof b.id !== "string" ||
      !b.id ||
      b.id.length > 100 ||
      !timestamp(b.since) ||
      !Array.isArray(b.numbers) ||
      !b.numbers.length ||
      b.numbers.length > OFFLINE_CAP ||
      !OFFLINE_INTERVALS.includes(intervalMS) ||
      !timestamp(b.since + b.numbers.length * intervalMS) ||
      b.numbers.some((n) => !amount(n) || n > 1000000) ||
      !amount(b.index) ||
      b.index >= b.numbers.length ||
      !amount(b.ep) ||
      !amount(b.newBadges)
    )
      throw new Error("Invalid offline commitment");
    batch = {
      id: b.id,
      since: b.since,
      ...(b.intervalMS != null ? { intervalMS } : {}),
      numbers: b.numbers,
      index: b.index,
      ep: b.ep,
      newBadges: b.newBadges,
    };
  }
  if (value.report) {
    const r = value.report;
    if (
      typeof r.id !== "string" ||
      r.id.length > 100 ||
      !amount(r.rolls) ||
      !amount(r.ep) ||
      !amount(r.newBadges) ||
      !timestamp(r.at)
    )
      throw new Error("Invalid offline report");
    report = {
      id: r.id,
      rolls: r.rolls,
      ep: r.ep,
      newBadges: r.newBadges,
      at: r.at,
    };
  }
  return { lastSeenAt: value.lastSeenAt, batch, report };
}
export function offlinePlan(
  offline,
  now,
  presences,
  tabId,
  visible,
  intervalMS = OFFLINE_INTERVAL,
) {
  if (!OFFLINE_INTERVALS.includes(intervalMS))
    throw new Error("Invalid offline interval");
  const since = Math.max(
    offline?.lastSeenAt ?? now,
    ...presences.map((p) => p.at),
  );
  const online = presences.some(
    (p) => p.id !== tabId && p.visible && now - p.at < 45000,
  );
  return {
    since,
    count:
      visible && !online
        ? Math.min(
            OFFLINE_CAP,
            Math.max(0, Math.floor((now - since) / intervalMS)),
          )
        : 0,
  };
}
export function readPresence(profileId) {
  const prefix = PRESENCE_PREFIX + profileId + ":",
    rows = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const p = JSON.parse(localStorage.getItem(key));
      if (amount(p.at))
        rows.push({
          id: key.slice(prefix.length),
          at: p.at,
          visible: p.visible === true,
        });
    } catch {}
  }
  return rows;
}
export function writePresence(profileId, tabId, at, visible) {
  const prefix = PRESENCE_PREFIX + profileId + ":";
  for (const p of readPresence(profileId))
    if (p.id !== tabId && at - p.at > 45000)
      localStorage.removeItem(prefix + p.id);
  localStorage.setItem(prefix + tabId, JSON.stringify({ at, visible }));
}
export function clearPresence(profileId) {
  for (const p of readPresence(profileId))
    localStorage.removeItem(PRESENCE_PREFIX + profileId + ":" + p.id);
}
