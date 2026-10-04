// Device links: one URL joins two browsers to the same account, live.
//
// No database anywhere. The link carries the room id and its key
// (`?sync=ROOM.KEY`); the relay forwards whole-save snapshots and keeps only
// the newest one in memory; the real save lives in each browser's own
// localStorage. Conflicts resolve with one total order both sides share —
// later `savedAt` wins, ties go to the smaller device id — so two devices
// always converge on the same progress.
//
// The relay speaks through same-origin relative URLs (/__sync/...), which the
// Vite dev server hosts directly. A static deployment can run
// `npm run relay` and point the game at it with `?relay=https://host:8787`.

import { PROGRESS_KEY, parseProgress } from "./progress.js";

const LINK_KEY = "rng-infinite-sync-v1";
const RELAY_KEY = "rng-infinite-sync-endpoint-v1";
const BROADCAST_DELAY_MS = 120;
const PEER_CODE_PREFIX = "RNGDLE-ACCOUNT-1:";
const PEER_CODE_LINE = 72;

export const SYNC_EVENT = "rng-sync-state";

let status = "off"; // off | connecting | waiting | live | error
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
  };
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
        JSON.stringify({ room, key, device, savedAt }),
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
  everLive = false;
  persistLink();
  openStream();
  return true;
}

export function unlinkDevices() {
  clearTimeout(helloTimer);
  clearTimeout(sendTimer);
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
      applyLatest(message.latest, () => {
        // The room is empty (or we hold the newest save): offer ours now.
        if (!message.latest && currentProfile()) void pushState(currentSave());
      });
      updateCount(message.count);
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
  pendingState = "";
  clearTimeout(sendTimer);
  if (!state) return { ok: false, reason: "empty" };
  return pushState(state);
}

async function pushState(state) {
  if (!room || !state) return { ok: false, reason: "offline" };
  // Stamps only move forward, and a device id never changes mid-link.
  savedAt = Math.max(savedAt + 1, Date.now());
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
    markSynced("sent");
    return { ok: true };
  } catch {
    setStatus("error", "The relay is unreachable; the link is offline.");
    return { ok: false, reason: "offline" };
  }
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
  markSynced("received");
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: payload.save }));
  return { ok: true };
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
