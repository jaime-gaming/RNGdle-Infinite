// Device links: one URL joins two browsers to the same account.
//
// Two transports, one behaviour:
//   * **PeerJS (WebRTC)** — the default on GitHub Pages and any static host.
//     A free public broker (0.peerjs.com) handles signaling; once the peers
//     meet, every byte goes browser-to-browser with no server in the middle.
//   * **HTTP relay** — used in development (`npm run relay`) or when the user
//     points the page at one. Same guarantees, a different wire.
//
// Either side may be closed for as long as it likes. Each browser keeps its
// own save in localStorage; the newer one wins whenever they meet. A heartbeat
// fires every second so the pill updates and a peer that just came back is
// caught up within a beat.
//
// A valid account wins over a guest save; otherwise conflicts resolve with
// one total order both sides share — later `savedAt` wins, ties to the smaller
// device id. The save itself never leaves the players' own browsers except
// through the link.

import Peer from "peerjs";
import { PROGRESS_KEY, parseProgress } from "./progress.js";
import { pendingStamp, syncDecision } from "./sync-policy.js";

const LINK_KEY = "rng-infinite-sync-v1";
const RELAY_KEY = "rng-infinite-sync-endpoint-v1";
const PEER_CODE_PREFIX = "RNGDLE-ACCOUNT-1:";
const PEER_CODE_LINE = 72;
const PEER_ID_PREFIX = "rngdle";
const HEARTBEAT_MS = 1000;
const RECONNECT_MS = 2500;

export const SYNC_EVENT = "rng-sync-state";

let status = "off"; // off | connecting | waiting | live | error | offline
let detail = "";
const listeners = new Set();
let room = "";
let key = "";
let device = "";
let savedAt = 0;
let pending = false;
let dirtyAt = 0;
let peers = 0;
let lastSyncAt = 0;
let lastDirection = "";
let revision = 0;

// PeerJS state
let peer = null;
let conn = null;
let peerSlot = ""; // "a" | "b"
let heartbeatTimer = 0;
let reconnectTimer = 0;
let everLive = false;

// Relay fallback state (dev only)
let relaySource = null;
let relaySession = "";
let relaySendTimer = 0;
let relayPendingState = "";
let relayHelloTimer = 0;

function emit() {
  for (const listener of listeners) listener(status, detail);
}

function setStatus(next, note = detail) {
  if (status === next && detail === note) return;
  status = next;
  detail = note;
  emit();
}

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
  return (location.origin + baseUrl()).replace(/\/+$/, "");
}

function syncUrl(path, params = {}) {
  const url = new URL(`${relayBase()}/__sync/${path}`);
  for (const [name, value] of Object.entries(params))
    if (value) url.searchParams.set(name, value);
  return url;
}

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
  if (room) {
    teardown();
    openLink();
  } else emit();
  return trimmed;
}

// A change that has not reached the room yet is stamped with the moment it was
// made, never with the stamp of the last save the room accepted. Otherwise an
// older save from the other device could beat a change that is actually newer.
// The stamp is taken once per change, so every message that goes out while it
// waits carries the same number.
let stampedFor = 0;
function queuedStamp() {
  if (pending && stampedFor !== dirtyAt) {
    savedAt = pendingStamp(savedAt, dirtyAt);
    stampedFor = dirtyAt;
    persistLink();
  }
  return savedAt;
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
  return (
    globalThis.crypto?.randomUUID?.() ??
    `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function buildDeviceLink(currentRoom = room, currentKey = key) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.pathname = baseUrl();
  url.searchParams.set("sync", `${currentRoom}.${currentKey}`);
  return url.toString();
}

// ---- Transport selection ---------------------------------------------------
// A static host has no relay: PeerJS is the only path between browsers.
// In development, the Vite plugin serves a relay on the same origin, and it
// is preferred because it is faster and survives NAT. The check is one fetch;
// if it fails or the relay refuses, PeerJS takes over seamlessly.
async function relayAvailable() {
  try {
    const response = await fetch(syncUrl("health"), {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---- The public entry points ----------------------------------------------
export async function createDeviceLink() {
  const newRoom = randomId(12);
  const newKey = randomId(24);
  room = newRoom;
  key = newKey;
  device = ensureDeviceId(readStoredLink()?.device);
  everLive = false;
  persistLink();
  // Start connecting but do not wait: the link is valid the moment it is
  // created, and the UI shows "Connecting…" while the transport settles.
  void openLink();
  return buildDeviceLink();
}

export function resumeDeviceLink() {
  const stored = readStoredLink();
  if (!stored?.room || !stored?.key) return false;
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
  device = ensureDeviceId(stored?.room === room ? stored.device : "");
  savedAt = stored?.savedAt && stored.device === device ? stored.savedAt : 0;
  if (stored?.room !== room) {
    pending = false;
    dirtyAt = 0;
  }
  everLive = false;
  persistLink();
  void openLink();
  return true;
}

export function unlinkDevices() {
  teardown();
  pending = false;
  dirtyAt = 0;
  room = "";
  key = "";
  peerSlot = "";
  savedAt = 0;
  everLive = false;
  persistLink();
  setStatus("off", "");
}

// ---- Transport orchestration ----------------------------------------------
// Choosing a transport starts with one await (the relay health check), so a
// link created, replaced or unlinked while that check is in flight must not
// leave the old choice behind: every transport is opened for the epoch it was
// started in, and a newer teardown makes that epoch stale.
let linkEpoch = 0;

async function openLink() {
  teardown();
  const epoch = linkEpoch;
  if (!room || !key) return;
  setStatus("connecting", "Connecting…");
  const hasRelay = await relayAvailable();
  if (epoch !== linkEpoch || !room || !key) return;
  if (hasRelay) openRelay();
  else openPeer();
}

function teardown() {
  linkEpoch += 1;
  clearInterval(heartbeatTimer);
  heartbeatTimer = 0;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  clearTimeout(relaySendTimer);
  relaySendTimer = 0;
  clearTimeout(relayHelloTimer);
  relayHelloTimer = 0;
  relayPendingState = "";
  try {
    conn?.close();
  } catch {}
  conn = null;
  try {
    peer?.destroy();
  } catch {}
  peer = null;
  peerSlot = "";
  try {
    relaySource?.close();
  } catch {}
  relaySource = null;
  relaySession = "";
}

// ---- PeerJS transport (default: works on GitHub Pages) --------------------
function peerIdFor(slot) {
  return `${PEER_ID_PREFIX}-${room}-${slot}`;
}

function otherSlot() {
  return peerSlot === "a" ? "b" : "a";
}

function openPeer() {
  // The creator prefers slot "a", the opener prefers "b". If the preferred
  // slot is taken (the other device got there first), flip — both sides still
  // end up on different ids and can find each other.
  openPeerSlot("a");
}

function openPeerSlot(slot) {
  peerSlot = slot;
  const id = peerIdFor(slot);
  try {
    peer = new Peer(id, { debug: 0 });
  } catch {
    setStatus(
      "error",
      "WebRTC is not available in this browser. Try a modern Chrome, Firefox or Safari.",
    );
    return;
  }
  peer.on("open", () => {
    setStatus(
      "waiting",
      everLive
        ? "Waiting for the other device…"
        : "Waiting for another device to open the link…",
    );
    startHeartbeat();
    // We just came online: try reaching the other side right away.
    connectToPeer();
  });
  peer.on("connection", (connection) => {
    // The other device connected to us.
    attachConnection(connection);
  });
  peer.on("error", (err) => {
    if (!peer || peer.destroyed) return;
    const type = err?.type ?? "";
    if (type === "unavailable-id") {
      // Our preferred slot is taken — take the other one.
      try {
        peer.destroy();
      } catch {}
      peer = null;
      openPeerSlot(slot === "a" ? "b" : "a");
      return;
    }
    if (type === "peer-unavailable") {
      // The other side is offline — the heartbeat will retry.
      if (status === "connecting")
        setStatus(
          "waiting",
          everLive
            ? "Waiting for the other device…"
            : "Waiting for another device to open the link…",
        );
      return;
    }
    if (
      type === "network" ||
      type === "server-error" ||
      type === "socket-closed"
    ) {
      // The public signaling broker could not be reached. Retrying happens on
      // its own (the heartbeat reconnects), and the hand-link code below needs
      // no broker at all — so say what to do instead of only what failed.
      setStatus(
        "error",
        "The public peer broker is unreachable. Retrying… you can transfer the account by hand now.",
      );
      return;
    }
    // Browser-incompatible or fatal: surface it.
    setStatus("error", err?.message || "Peer connection error.");
  });
  peer.on("disconnected", () => {
    if (!peer || peer.destroyed) return;
    try {
      peer.reconnect();
    } catch {}
  });
}

function connectToPeer() {
  if (!peer || peer.destroyed || conn?.open) return;
  const target = peerIdFor(otherSlot());
  try {
    const next = peer.connect(target, { reliable: true });
    attachConnection(next);
  } catch {}
}

function attachConnection(connection) {
  if (!connection) return;
  // If we already have a live connection, keep it — a second one from the
  // other side racing against ours is redundant and would only waste a slot.
  if (conn?.open) {
    try {
      connection.close();
    } catch {}
    return;
  }
  conn = connection;
  connection.on("open", () => {
    everLive = true;
    peers = 2;
    setStatus("live", "2 devices live");
    // Hand over whatever we hold; the other side will adopt it if newer.
    sendPeerMessage({
      type: "state",
      state: currentSave(),
      savedAt: queuedStamp(),
      device,
    });
  });
  connection.on("data", (data) => {
    handlePeerMessage(data);
  });
  connection.on("close", () => {
    if (conn === connection) conn = null;
    peers = peer && !peer.destroyed ? 1 : 0;
    setStatus(
      "waiting",
      everLive
        ? "Waiting for the other device…"
        : "Waiting for another device to open the link…",
    );
  });
  connection.on("error", () => {
    if (conn === connection) conn = null;
  });
}

function sendPeerMessage(message) {
  if (!conn?.open) return false;
  try {
    conn.send(message);
    return true;
  } catch {
    return false;
  }
}

function handlePeerMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "ping") {
    // Answer with a pong that carries our save if theirs might be stale.
    sendPeerMessage({
      type: "pong",
      at: Date.now(),
      state: currentSave(),
      savedAt: queuedStamp(),
      device,
    });
    return;
  }
  if (message.type === "pong") {
    reconcile(message);
    return;
  }
  if (message.type === "state") {
    reconcile(message);
    return;
  }
}

// Apply the shared profile-first, then timestamp/device reconciliation policy.
function reconcile(remote) {
  if (!remote || !Number.isFinite(remote.savedAt) || !remote.state) return;
  const decision = syncDecision(
    { state: currentSave(), savedAt: queuedStamp(), device },
    remote,
  );
  if (decision.direction === "receive") {
    receiveRemote(remote);
  } else if (decision.direction === "send") {
    // A profile always outranks a guest save. Give that correction a newer
    // stamp so the guest accepts it even if its local clock ran ahead.
    if (decision.savedAt !== savedAt) {
      savedAt = decision.savedAt;
      persistLink();
    }
    sendPeerMessage({
      type: "state",
      state: currentSave(),
      savedAt,
      device,
    });
  }
}

function receiveRemote(remote) {
  const raw = remote.state;
  try {
    const parsed = parseProgress(raw);
    if (!parsed.profile) return;
  } catch {
    return;
  }
  savedAt = remote.savedAt;
  pending = false;
  dirtyAt = 0;
  persistLink();
  markSynced("received");
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: raw }));
}

// The heartbeat: one ping every second. A live connection exchanges saves on
// every beat so a device that just came back is caught up within a second.
// A missing connection is retried on the same beat, so reconnect is instant.
function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (!peer || peer.destroyed) return;
    // The peer must be registered with the broker before it can connect.
    if (peer.disconnected) {
      try {
        peer.reconnect();
      } catch {}
      return;
    }
    if (!conn?.open) {
      connectToPeer();
      return;
    }
    sendPeerMessage({ type: "ping", at: Date.now() });
    // A pending change that the data channel has not yet carried: flush it.
    if (pending && currentProfile()) {
      sendPeerMessage({
        type: "state",
        state: currentSave(),
        savedAt: Math.max(savedAt + 1, dirtyAt || Date.now()),
        device,
      });
    }
  }, HEARTBEAT_MS);
}

// ---- Relay fallback (dev, or when the user points at one) ------------------
function openRelay() {
  relaySession =
    globalThis.crypto?.randomUUID?.() ??
    `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let stream;
  try {
    stream = new EventSource(
      syncUrl("stream", { room, key, session: relaySession }),
    );
  } catch {
    // Relay failed to open — fall back to PeerJS.
    openPeer();
    return;
  }
  relaySource = stream;
  relayHelloTimer = setTimeout(() => {
    if (status === "connecting") {
      stream.close();
      relaySource = null;
      openPeer();
    }
  }, 4000);
  stream.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === "hello") {
      clearTimeout(relayHelloTimer);
      updateRelayCount(message.count);
      if (pending && currentProfile()) {
        void relayPushState(currentSave(), dirtyAt);
        return;
      }
      relayApplyLatest(message.latest, () => {
        if (!message.latest && currentProfile())
          void relayPushState(currentSave());
      });
    } else if (message.type === "state") relayApplyLatest(message.payload);
    else if (message.type === "count") updateRelayCount(message.count);
  };
  stream.onerror = () => {
    if (relaySource !== stream) return;
    if (stream.readyState === EventSource.CLOSED) {
      // Relay died — try PeerJS instead.
      relaySource = null;
      openPeer();
    } else if (status !== "live" && status !== "waiting")
      setStatus("connecting", "Reconnecting…");
  };
}

function updateRelayCount(count) {
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

function relayApplyLatest(latest, onEmpty) {
  if (!latest) {
    onEmpty?.();
    return;
  }
  const local = queuedStamp();
  if (
    latest.savedAt > local ||
    (latest.savedAt === local && latest.device < device)
  ) {
    receiveRemote(latest);
  } else if (
    latest.savedAt < local ||
    (latest.savedAt === local && latest.device !== device)
  ) {
    void relayPushState(currentSave());
  }
}

export function broadcastSync(progress) {
  if (!room || !progress?.profile) return;
  let raw;
  try {
    raw = JSON.stringify(progress);
  } catch {
    return;
  }
  // PeerJS path: send immediately over the data channel.
  if (conn?.open) {
    savedAt = Math.max(savedAt + 1, Date.now());
    persistLink();
    sendPeerMessage({ type: "state", state: raw, savedAt, device });
    pending = false;
    dirtyAt = 0;
    persistLink();
    markSynced("sent");
    return;
  }
  // Relay path (or offline): queue and debounce.
  pending = true;
  dirtyAt = Date.now();
  persistLink();
  if (relaySource) {
    relayPendingState = raw;
    clearTimeout(relaySendTimer);
    relaySendTimer = setTimeout(() => {
      const state = relayPendingState;
      relayPendingState = "";
      if (state) relayPushState(state);
    }, 120);
  }
  // PeerJS offline: the heartbeat will flush on the next beat.
}

export async function pushNow() {
  if (!room) return { ok: false, reason: "offline" };
  if (conn?.open) {
    const state = currentSave();
    if (!state) return { ok: false, reason: "empty" };
    savedAt = Math.max(savedAt + 1, dirtyAt || Date.now());
    persistLink();
    const sent = sendPeerMessage({ type: "state", state, savedAt, device });
    if (sent) {
      pending = false;
      dirtyAt = 0;
      persistLink();
      markSynced("sent");
      return { ok: true };
    }
  }
  const state = relayPendingState || currentSave();
  const stamp = pending ? dirtyAt : 0;
  relayPendingState = "";
  clearTimeout(relaySendTimer);
  if (!state) return { ok: false, reason: "empty" };
  return relayPushState(state, stamp);
}

async function relayPushState(state, stamp = 0) {
  if (!room || !state) return { ok: false, reason: "offline" };
  savedAt = Math.max(savedAt + 1, Number(stamp) || Date.now());
  persistLink();
  const body = JSON.stringify({ state, savedAt, device });
  try {
    const response = await fetch(
      syncUrl("state", { room, key, session: relaySession }),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
    );
    if (response.status === 403) {
      setStatus("error", "That device link was rejected by the relay.");
      return { ok: false, reason: "rejected" };
    }
    if (!response.ok) return { ok: false, reason: "relay" };
    const result = await response.json().catch(() => ({}));
    if (result.conflict) relayApplyLatest(result.conflict);
    if (typeof result.count === "number") updateRelayCount(result.count);
    pending = false;
    dirtyAt = 0;
    persistLink();
    markSynced("sent");
    return { ok: true };
  } catch {
    setStatus("error", "The relay is unreachable; the link is offline.");
    return { ok: false, reason: "offline" };
  }
}

// ---- Helpers ---------------------------------------------------------------
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

function randomId(bytes) {
  // A crypto-random slug safe for URLs, PeerJS ids and the relay's regex.
  // Uses base64url characters (minus the padding) so the output is dense
  // and always the same length for a given byte count.
  try {
    const buf = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(buf);
    let out = "";
    for (const b of buf) out += b.toString(16).padStart(2, "0");
    return out;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

// ---- Linking by hand -------------------------------------------------------
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

// ---- Connectivity ----------------------------------------------------------
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!room) return;
    if (status === "offline" || status === "error") openLink();
    else if (conn?.open && pending) {
      sendPeerMessage({
        type: "state",
        state: currentSave(),
        savedAt: Math.max(savedAt + 1, dirtyAt || Date.now()),
        device,
      });
    }
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
    if (room && pending && relaySource) {
      const state = currentSave();
      if (state) {
        savedAt = Math.max(savedAt + 1, Date.now());
        persistLink();
        try {
          navigator.sendBeacon?.(
            syncUrl("state", { room, key, session: relaySession }),
            new Blob([JSON.stringify({ state, savedAt, device })], {
              type: "application/json",
            }),
          );
        } catch {}
      }
    }
  });
}
