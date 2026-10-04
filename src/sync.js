// Device links: one URL joins two browsers to the same account.
//
// The link carries the room id and its key (`?sync=ROOM.KEY`). The relay is
// the meeting point — and it keeps the room *on the device that runs it*, so
// the link behaves like a small server of your own: either side may be closed
// for days while the other plays, and whoever returns is handed everything
// that happened. That covers every combination — both open, one closed, both
// closed, alternating — with the newest save winning whenever two devices
// played apart.
//
// Two things make that hold together:
//   * the relay writes each winning save to its store before answering, so
//     "sent" really means "kept";
//   * this client keeps a one-frame outbox. A change made while the relay is
//     unreachable stays marked as pending and is flushed the moment the link
//     comes back, stamped with the time the change actually happened so the
//     later writer wins the tie.
//
// Conflicts resolve with one total order both sides share — later `savedAt`
// wins, ties go to the smaller device id. The save itself never leaves the
// players' own browsers except through their own relay or a peer code.
//
// The relay speaks through same-origin relative URLs (/__sync/...), which the
// Vite dev server hosts directly. A static deployment can run `npm run relay`
// and point the game at it with `?relay=https://host:8787`.

import { PROGRESS_KEY, parseProgress } from "./progress.js";

const LINK_KEY = "rng-infinite-sync-v1";
const RELAY_KEY = "rng-infinite-sync-endpoint-v1";
const BROADCAST_DELAY_MS = 120;
const PEER_CODE_PREFIX = "RNGDLE-ACCOUNT-1:";
const PEER_CODE_LINE = 72;

export const SYNC_EVENT = "rng-sync-state";

let status = "off"; // off | connecting | waiting | live | error | offline
let detail = "";
const listeners = new Set();
let source = null; // EventSource
let room = "";
let key = "";
let session = "";
let device = "";
let savedAt = 0;
let helloTimer = 0;
let sendTimer = 0;
let pendingState = "";
let everLive = false;
// The outbox: true while this device holds a change the room has not accepted
// yet. It is persisted with the link, so closing the tab mid-change cannot
// silently lose the fact that the other side is owed a frame.
let pending = false;
let dirtyAt = 0; // When that change actually happened, not when it is sent.
// What the settings screen animates: how many devices are in the room, when
// the last frame crossed the wire, which way it went, and a counter that moves
// on every exchange so the UI can flash exactly once per event.
let peers = 0;
let lastSyncAt = 0;
let lastDirection = ""; // "" | sent | received
let revision = 0;

function emit() {
  for (const listener of listeners) listener(status, detail);
}

function setStatus(next, note = detail) {
  if (status === next && detail === note) return;
  status = next;
  detail = note;
  emit();
}

// A frame really crossed the wire: stamp it so the pill can pulse.
function markSynced(direction) {
  lastSyncAt = Date.now();
  lastDirection = direction;
  revision += 1;
  emit();
}

export function syncStatus() {
  return {
    status,
    detail,
    room,
    linked: status !== "off" && !!room,
    peers,
    lastSyncAt,
    lastDirection,
    revision,
    endpoint: relayBase(),
    device,
    savedAt,
    pending,
    dirtyAt,
    online:
      typeof navigator === "undefined" ? true : navigator.onLine !== false,
  };
}

// What the relay itself reports about its store, for the technical page: a
// durable relay is what makes a closed device catch up later.
export async function fetchRelayHealth() {
  const response = await fetch(syncUrl("health"), { cache: "no-store" });
  if (!response.ok) throw new Error("The relay did not answer.");
  return response.json();
}

export function subscribeSync(listener) {
  listeners.add(listener);
  listener(status, detail);
  return () => listeners.delete(listener);
}

function baseUrl() {
  const base = import.meta.env?.BASE_URL ?? "/";
  return base.endsWith("/") ? base : `${base}/`;
}

// An optional standalone relay: the saved endpoint, a ?relay= override, or
// the same origin the game itself is served from.
function relayBase() {
  try {
    const override = new URLSearchParams(location.search).get("relay");
    if (override) localStorage.setItem(RELAY_KEY, override);
  } catch {}
  let saved = "";
  try {
    saved = localStorage.getItem(RELAY_KEY) ?? "";
  } catch {}
  if (saved) return saved.replace(/\/+$/, "");
  // One trailing slash at most, so `${base}/__sync/...` never doubles up.
  return (location.origin + baseUrl()).replace(/\/+$/, "");
}

function syncUrl(path, params = {}) {
  const url = new URL(`${relayBase()}/__sync/${path}`);
  for (const [name, value] of Object.entries(params))
    if (value) url.searchParams.set(name, value);
  return url;
}

// The relay a page talks to: remembered endpoint, `?relay=` override, or the
// origin the game is served from. Exposed so Settings can show, change and
// reset it — a static build has no relay of its own and needs pointing at one.
export function relayEndpoint() {
  return relayBase();
}

export function setRelayEndpoint(endpoint) {
  const trimmed = String(endpoint ?? "")
    .trim()
    .replace(/\/+$/, "");
  try {
    if (trimmed) localStorage.setItem(RELAY_KEY, trimmed);
    else localStorage.removeItem(RELAY_KEY);
  } catch {}
  // Already in a room: reconnect through the new address immediately.
  if (room) {
    session = "";
    openStream();
  } else emit();
  return trimmed;
}

function persistLink() {
  try {
    if (room)
      localStorage.setItem(
        LINK_KEY,
        JSON.stringify({ room, key, device, savedAt, pending, dirtyAt }),
      );
    else localStorage.removeItem(LINK_KEY);
  } catch {}
}

export function readStoredLink() {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.room || !parsed?.key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function ensureDeviceId(existing) {
  if (existing) return existing;
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return id;
}

// The link a second device opens: room and key in the query string, nothing
// else — no account to create on any server, because there is no server-side
// account. Whoever holds the link holds the save.
export function buildDeviceLink(currentRoom = room, currentKey = key) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.pathname = baseUrl();
  url.searchParams.set("sync", `${currentRoom}.${currentKey}`);
  return url.toString();
}

export async function createDeviceLink() {
  const response = await fetch(syncUrl("create"), { method: "POST" });
  if (!response.ok) throw new Error("The relay did not answer.");
  const created = await response.json();
  room = created.room;
  key = created.key;
  device = ensureDeviceId(readStoredLink()?.device);
  everLive = false;
  persistLink();
  openStream();
  return buildDeviceLink();
}

// A reload must not silently drop the link: the room, key and device id are
// already in this browser, so the stream just reopens.
export function resumeDeviceLink() {
  const stored = readStoredLink();
  if (!stored?.room || !stored?.key) return false;
  // A change made in an earlier session is still owed to the room.
  pending = stored.pending === true;
  dirtyAt = Number(stored.dirtyAt) || 0;
  return joinDeviceLink(`${stored.room}.${stored.key}`);
}

export function joinDeviceLink(token) {
  const [joinedRoom = "", joinedKey = ""] = String(token).split(".");
  if (!joinedRoom || !joinedKey) {
    setStatus("error", "That device link is not valid.");
    return false;
  }
  room = joinedRoom;
  key = joinedKey;
  const stored = readStoredLink();
  // Same link as before: keep the device identity so tie-breaks stay stable.
  device = ensureDeviceId(stored?.room === room ? stored.device : "");
  savedAt = stored?.savedAt && stored.device === device ? stored.savedAt : 0;
  // Joining a link for the first time starts with nothing owed; resuming one
  // keeps whatever the earlier session had not managed to deliver.
  if (stored?.room !== room) {
    pending = false;
    dirtyAt = 0;
  }
  everLive = false;
  persistLink();
  openStream();
  return true;
}

export function unlinkDevices() {
  clearTimeout(helloTimer);
  clearTimeout(sendTimer);
  pending = false;
  dirtyAt = 0;
  source?.close();
  source = null;
  room = "";
  key = "";
  session = "";
  savedAt = 0;
  everLive = false;
  persistLink();
  setStatus("off", "");
}

function openStream() {
  clearTimeout(helloTimer);
  source?.close();
  setStatus("connecting", "Connecting to the relay…");
  session =
    globalThis.crypto?.randomUUID?.() ??
    `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let stream;
  try {
    stream = new EventSource(syncUrl("stream", { room, key, session }));
  } catch {
    setStatus(
      "error",
      "No relay answered. Run `npm run relay`, point this page at it below, or link by hand.",
    );
    return;
  }
  source = stream;
  helloTimer = setTimeout(() => {
    if (status === "connecting") {
      stream.close();
      setStatus(
        "error",
        "No relay answered. Run `npm run relay`, point this page at it below, or link by hand.",
      );
    }
  }, 6000);
  stream.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === "hello") {
      clearTimeout(helloTimer);
      updateCount(message.count);
      if (pending && currentProfile()) {
        // We played while the room was out of reach: hand over that work
        // first — stamped with when it happened — and only adopt if the room
        // turns out to hold something later than it.
        void pushState(currentSave(), dirtyAt);
        return;
      }
      applyLatest(message.latest, () => {
        // The room is empty (or we hold the newest save): offer ours now.
        if (!message.latest && currentProfile()) void pushState(currentSave());
      });
    } else if (message.type === "state") applyLatest(message.payload);
    else if (message.type === "count") updateCount(message.count);
  };
  stream.onerror = () => {
    if (source !== stream) return;
    if (stream.readyState === EventSource.CLOSED)
      setStatus("error", "The connection to the relay was lost.");
    else if (status !== "live" && status !== "waiting")
      setStatus("connecting", "Reconnecting to the relay…");
  };
}

function updateCount(count) {
  if (typeof count === "number") peers = count;
  if (count >= 2) {
    everLive = true;
    setStatus("live", `${count} devices live`);
  } else if (room)
    setStatus(
      "waiting",
      everLive
        ? "Waiting for the other device…"
        : "Waiting for another device to open the link…",
    );
}

// Does the room hold something we do not? Adopt it, or answer with our own
// save when ours is the newer one. `onEmpty` runs only when the room is blank.
function applyLatest(latest, onEmpty) {
  if (!latest) {
    onEmpty?.();
    return;
  }
  if (
    latest.savedAt > savedAt ||
    (latest.savedAt === savedAt && latest.device < device)
  ) {
    receiveRemote(latest);
  } else if (
    latest.savedAt < savedAt ||
    (latest.savedAt === savedAt && latest.device !== device)
  ) {
    // We are ahead of the room (or the tie goes our way): push the truth.
    void pushState(currentSave());
  }
}

function currentSave() {
  try {
    return localStorage.getItem(PROGRESS_KEY) ?? "";
  } catch {
    return "";
  }
}

function currentProfile() {
  try {
    return !!parseProgress(currentSave()).profile;
  } catch {
    return false;
  }
}

function receiveRemote(latest) {
  const raw = latest.state;
  try {
    const parsed = parseProgress(raw);
    if (!parsed.profile) return; // A guest save is never worth adopting.
  } catch {
    return;
  }
  savedAt = latest.savedAt;
  device = latest.device || device;
  persistLink();
  markSynced("received");
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: raw }));
}

// Local save -> the other device. Called from the progress reducer right
// after a successful write; debounced so a burst of changes sends one frame.
export function broadcastSync(progress) {
  if (!room || !progress?.profile) return;
  let raw;
  try {
    raw = JSON.stringify(progress);
  } catch {
    return;
  }
  // The outbox is written down even if the relay is unreachable right now:
  // the frame is owed until the room says it took it.
  pending = true;
  dirtyAt = Date.now();
  persistLink();
  pendingState = raw;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    const state = pendingState;
    pendingState = "";
    if (state) pushState(state);
  }, BROADCAST_DELAY_MS);
}

// "Send now": flush whatever this browser holds straight to the room instead
// of waiting for the debounce, and report whether the relay took it.
export async function pushNow() {
  if (!room) return { ok: false, reason: "offline" };
  const state = pendingState || currentSave();
  const stamp = pending ? dirtyAt : 0;
  pendingState = "";
  clearTimeout(sendTimer);
  if (!state) return { ok: false, reason: "empty" };
  return pushState(state, stamp);
}

async function pushState(state, stamp = 0) {
  if (!room || !state) return { ok: false, reason: "offline" };
  // Stamps only move forward, and a device id never changes mid-link. A
  // flushed change carries the moment it happened, so a device that edited
  // earlier never wins against one that edited later.
  savedAt = Math.max(savedAt + 1, Number(stamp) || 0, Date.now());
  persistLink();
  const body = JSON.stringify({ state, savedAt, device });
  try {
    const response = await fetch(syncUrl("state", { room, key, session }), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (response.status === 403) {
      setStatus("error", "That device link was rejected by the relay.");
      return { ok: false, reason: "rejected" };
    }
    if (!response.ok) return { ok: false, reason: "relay" };
    const result = await response.json().catch(() => ({}));
    // The room held something newer than the state we just offered: take it.
    if (result.conflict) applyLatest(result.conflict);
    if (typeof result.count === "number") updateCount(result.count);
    pending = false;
    dirtyAt = 0;
    persistLink();
    markSynced("sent");
    return { ok: true };
  } catch {
    setStatus("error", "The relay is unreachable; the link is offline.");
    scheduleRetry();
    return { ok: false, reason: "offline" };
  }
}

// A frame that could not be delivered is kept and offered again, so a short
// outage never strands a session's worth of play.
let retryTimer = 0;
function scheduleRetry() {
  if (retryTimer || !pending) return;
  retryTimer = setTimeout(() => {
    retryTimer = 0;
    if (pending && room) void pushState(currentSave(), dirtyAt);
  }, 5000);
  retryTimer.unref?.();
}

// ---- Linking by hand -------------------------------------------------------
// A device link needs a relay in the middle; a *peer code* does not. It packs
// the whole save into one text blob a player can walk across by clipboard or
// chat, so two devices can still meet with no server anywhere at all — the
// same trick the relay performs, done by hand.
function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(code) {
  const binary = atob(code);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildPeerCode() {
  const save = currentSave();
  if (!save) return "";
  const payload = JSON.stringify({
    v: 1,
    at: Math.max(savedAt, Date.now()),
    save,
  });
  const base64 = encodeBase64(payload).replace(
    new RegExp(`(.{${PEER_CODE_LINE}})`, "g"),
    "$1\n",
  );
  return `${PEER_CODE_PREFIX}${base64}`;
}

// Adopt a code another device showed: the same event path a relay frame takes,
// so the reducer, the storage write and the deadline checks are all identical.
export function adoptPeerCode(code) {
  const cleaned = String(code ?? "")
    .replace(new RegExp(`^\\s*${PEER_CODE_PREFIX}\\s*`), "")
    .replace(/\s+/g, "");
  if (!cleaned) return { ok: false, reason: "empty" };
  let payload;
  try {
    payload = JSON.parse(decodeBase64(cleaned));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  let parsed;
  try {
    parsed = parseProgress(payload?.save);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!parsed?.profile) return { ok: false, reason: "guest" };
  savedAt = Math.max(savedAt, Number(payload?.at) || 0);
  pending = false;
  dirtyAt = 0;
  persistLink();
  markSynced("received");
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: payload.save }));
  return { ok: true };
}

// Connectivity changes are part of the link's job: coming back online opens
// the stream again and hands over whatever the outbox still holds.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!room) return;
    if (status === "offline" || status === "error") openStream();
    else if (pending) void pushState(currentSave(), dirtyAt);
  });
  window.addEventListener("offline", () => {
    if (room)
      setStatus(
        "offline",
        "This device is offline. Changes are kept here and sent when the link is back.",
      );
  });
}

// Last chance to flush a change that lands right as the tab closes.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (room && pendingState) {
      const state = pendingState;
      pendingState = "";
      savedAt = Math.max(savedAt + 1, Date.now());
      try {
        navigator.sendBeacon?.(
          syncUrl("state", { room, key, session }),
          new Blob([JSON.stringify({ state, savedAt, device })], {
            type: "application/json",
          }),
        );
      } catch {}
    }
  });
}
