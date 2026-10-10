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
import {
  chooseSyncOwner,
  isSyncWriter,
  pendingStamp,
  syncDecision,
} from "./sync-policy.js";

const LINK_KEY = "rng-infinite-sync-v1";
const RELAY_KEY = "rng-infinite-sync-endpoint-v1";
const PEER_CODE_PREFIX = "RNGDLE-ACCOUNT-1:";
const PEER_CODE_LINE = 72;
const PEER_ID_PREFIX = "rngdle";
const HEARTBEAT_MS = 3000;
const PONG_TIMEOUT_MS = 12000;
const RECONNECT_MS = 2500;
const ACTION_TIMEOUT_MS = 20000;
const ACTION_CACHE_LIMIT = 128;

export const SYNC_EVENT = "rng-sync-state";

let status = "off"; // off | connecting | waiting | live | error | offline
let detail = "";
const listeners = new Set();
let room = "";
let key = "";
let device = "";
let ownerDevice = "";
let remoteDevice = "";
let savedAt = 0;
let pending = false;
let dirtyAt = 0;
let peers = 0;
let lastSyncAt = 0;
let lastDirection = "";
let revision = 0;
let pingSequence = 0;
let lastPingNonce = "";
let lastPongAt = 0;
let connectingSince = 0;
let reconnectAttempt = 0;
const pendingActions = new Map();
const actionListeners = new Set();
const queuedActions = [];
const actionReplies = new Map();
const inFlightActions = new Set();

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
    ownerDevice,
    isWriter: !room || isSyncWriter(device, ownerDevice),
    peers,
    connected: hasOpenTransport(),
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

export function subscribeSyncActions(listener) {
  actionListeners.add(listener);
  while (queuedActions.length) listener(queuedActions.shift());
  return () => actionListeners.delete(listener);
}

export function replySyncAction({ id, from }, result) {
  if (!id || !from) return false;
  const cacheKey = `${from}:${id}`;
  actionReplies.set(cacheKey, result);
  while (actionReplies.size > ACTION_CACHE_LIMIT)
    actionReplies.delete(actionReplies.keys().next().value);
  inFlightActions.delete(cacheKey);
  void sendLinkMessage({
    type: "action-result",
    id,
    from: device,
    to: from,
    result,
  });
  return true;
}

export function requestSyncAction(action) {
  if (!room || !ownerDevice || ownerDevice === device)
    return Promise.resolve({
      ok: false,
      message: "This device is not connected to the account writer yet.",
    });
  if (status !== "live" || !hasOpenTransport())
    return Promise.resolve({
      ok: false,
      message:
        "The account’s main device is not connected. Reconnect before changing progress.",
    });
  const id = randomId(12);
  const request = {
    type: "action",
    id,
    from: device,
    to: ownerDevice,
    action: { ...action, eventId: action?.eventId || id },
  };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingActions.delete(id);
      resolve({
        ok: false,
        message:
          "The main device did not answer in time. No second action was started; reconnect and try again.",
      });
    }, ACTION_TIMEOUT_MS);
    pendingActions.set(id, { resolve, timeout });
    Promise.resolve(sendLinkMessage(request)).then((sent) => {
      if (sent) return;
      const pendingRequest = pendingActions.get(id);
      if (!pendingRequest) return;
      clearTimeout(pendingRequest.timeout);
      pendingActions.delete(id);
      resolve({
        ok: false,
        message:
          "The link is reconnecting. Your change was not sent; try again when both devices are online.",
      });
    });
  });
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
        JSON.stringify({
          room,
          key,
          device,
          ownerDevice,
          savedAt,
          pending,
          dirtyAt,
        }),
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
  const authority =
    currentRoom === room && currentKey === key ? ownerDevice : "";
  url.searchParams.set(
    "sync",
    [currentRoom, currentKey, authority].filter(Boolean).join("."),
  );
  return url.toString();
}

function updateSyncOwner(devices = [], declaredOwners = []) {
  const next = chooseSyncOwner(
    [device, ...devices],
    [ownerDevice, ...declaredOwners],
  );
  if (next && next !== ownerDevice) {
    ownerDevice = next;
    persistLink();
    emit();
  }
  return ownerDevice;
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
  const stored = readStoredLink();
  const newRoom = randomId(12);
  const newKey = randomId(24);
  room = newRoom;
  key = newKey;
  device = ensureDeviceId(stored?.device);
  ownerDevice = device;
  remoteDevice = "";
  savedAt = 0;
  pending = false;
  dirtyAt = 0;
  stampedFor = 0;
  peers = 0;
  lastSyncAt = 0;
  lastDirection = "";
  everLive = false;
  persistLink();
  emit();
  // Start connecting but do not wait: the link is valid the moment it is
  // created, and the UI shows "Connecting…" while the transport settles.
  void openLink();
  return buildDeviceLink();
}

export function resumeDeviceLink() {
  const stored = readStoredLink();
  if (!stored?.room || !stored?.key) return false;
  return joinDeviceLink(
    [stored.room, stored.key, stored.ownerDevice].filter(Boolean).join("."),
  );
}

export function joinDeviceLink(token) {
  const [joinedRoom = "", joinedKey = "", linkedOwner = ""] =
    String(token).split(".");
  if (!joinedRoom || !joinedKey) {
    setStatus("error", "That device link is not valid.");
    return false;
  }
  const stored = readStoredLink();
  const sameLink = stored?.room === joinedRoom && stored?.key === joinedKey;
  room = joinedRoom;
  key = joinedKey;
  device = ensureDeviceId(sameLink ? stored.device : "");
  ownerDevice =
    linkedOwner || (sameLink ? String(stored?.ownerDevice ?? "") : "");
  savedAt =
    sameLink && stored.device === device ? Number(stored.savedAt) || 0 : 0;
  pending = sameLink && stored.pending === true;
  dirtyAt = pending ? Number(stored.dirtyAt) || 0 : 0;
  stampedFor = 0;
  remoteDevice = "";
  peers = 0;
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
  device = "";
  ownerDevice = "";
  remoteDevice = "";
  peerSlot = "";
  savedAt = 0;
  everLive = false;
  peers = 0;
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

function failPendingActions(message) {
  for (const [id, request] of pendingActions) {
    clearTimeout(request.timeout);
    request.resolve({ ok: false, message });
    pendingActions.delete(id);
  }
}

function teardown() {
  linkEpoch += 1;
  failPendingActions(
    "The device link changed before the other device answered. Please try again.",
  );
  clearInterval(heartbeatTimer);
  heartbeatTimer = 0;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  lastPongAt = 0;
  lastPingNonce = "";
  pingSequence = 0;
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
  // One role always dials and one always listens. The account's main device
  // is "a" (it dials); the other device is "b" (it listens). A link without a
  // known main device falls back to claiming "a" and flipping on a clash.
  const role = ownerDevice && ownerDevice !== device ? "b" : "a";
  openPeerSlot(role);
}

function waitingCopy() {
  return everLive
    ? "Waiting for the other device…"
    : "Waiting for another device to open the link…";
}

function schedulePeerReconnect(epoch = linkEpoch) {
  if (!room || !key || reconnectTimer) return;
  const delay = Math.min(
    RECONNECT_MS * 2 ** Math.min(reconnectAttempt, 4),
    30000,
  );
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    if (
      epoch !== linkEpoch ||
      !room ||
      !key ||
      (typeof navigator !== "undefined" && navigator.onLine === false)
    )
      return;
    if (!peer || peer.destroyed) {
      openPeer();
      return;
    }
    if (peer.disconnected) {
      try {
        peer.reconnect();
      } catch {}
    }
    if (peerSlot === "a") connectToPeer();
  }, delay);
}

function openPeerSlot(slot) {
  peerSlot = slot;
  const id = peerIdFor(slot);
  const epoch = linkEpoch;
  let candidate;
  try {
    candidate = new Peer(id, { debug: 0 });
    peer = candidate;
  } catch {
    setStatus(
      "error",
      "WebRTC is not available in this browser. Try a modern Chrome, Firefox or Safari.",
    );
    return;
  }
  candidate.on("open", () => {
    if (peer !== candidate || epoch !== linkEpoch) return;
    reconnectAttempt = 0;
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    peers = 1;
    setStatus("waiting", waitingCopy());
    startHeartbeat(epoch);
    if (slot === "a") connectToPeer();
  });
  candidate.on("connection", (connection) => {
    if (peer !== candidate || epoch !== linkEpoch) {
      try {
        connection.close();
      } catch {}
      return;
    }
    attachConnection(connection, epoch);
  });
  candidate.on("error", (err) => {
    if (peer !== candidate || candidate.destroyed || epoch !== linkEpoch)
      return;
    const type = err?.type ?? "";
    if (type === "unavailable-id") {
      // A registration with this ID still exists (an old tab, or a clash on a
      // link with no known main device). Release it and try again shortly; the
      // roll is decided by the main device, so the role never flips silently.
      try {
        candidate.destroy();
      } catch {}
      peer = null;
      setTimeout(() => {
        if (epoch !== linkEpoch || !room || !key) return;
        if (ownerDevice) openPeerSlot(slot);
        else openPeerSlot(slot === "a" ? "b" : "a");
      }, 1500);
      return;
    }
    if (type === "peer-unavailable") {
      setStatus("waiting", waitingCopy());
      return;
    }
    if (
      type === "network" ||
      type === "server-error" ||
      type === "socket-error" ||
      type === "socket-closed" ||
      type === "disconnected"
    ) {
      setStatus(
        "connecting",
        "Connection interrupted. Retrying automatically…",
      );
      if (candidate.disconnected) {
        try {
          candidate.reconnect();
        } catch {}
      }
      schedulePeerReconnect(epoch);
      return;
    }
    setStatus(
      "error",
      err?.message || "Peer connection error. Retrying automatically…",
    );
    schedulePeerReconnect(epoch);
  });
  candidate.on("disconnected", () => {
    if (peer !== candidate || candidate.destroyed || epoch !== linkEpoch)
      return;
    setStatus("connecting", "Connection interrupted. Reconnecting…");
    try {
      candidate.reconnect();
    } catch {}
    schedulePeerReconnect(epoch);
  });
}

function connectToPeer() {
  if (!peer || peer.destroyed || peer.disconnected || peerSlot !== "a" || conn)
    return;
  try {
    attachConnection(
      peer.connect(peerIdFor("b"), { reliable: true }),
      linkEpoch,
    );
  } catch {
    schedulePeerReconnect(linkEpoch);
  }
}

function attachConnection(connection, epoch = linkEpoch) {
  if (!connection) return;
  // Keep the first attempt, even while it is opening. That way simultaneous
  // open/close events can never replace the channel carrying the live save.
  if (conn && conn !== connection) {
    try {
      connection.close();
    } catch {}
    return;
  }
  conn = connection;
  connectingSince = Date.now();
  connection.on("open", () => {
    if (conn !== connection || epoch !== linkEpoch) {
      try {
        connection.close();
      } catch {}
      return;
    }
    everLive = true;
    peers = 2;
    lastPongAt = Date.now();
    reconnectAttempt = 0;
    setStatus("live", "2 devices live");
    sendPeerMessage({ type: "hello", from: device, ownerDevice });
    sendPeerState();
  });
  connection.on("data", (data) => {
    if (conn === connection && epoch === linkEpoch)
      handlePeerMessage(data, "peer");
  });
  connection.on("close", () => {
    if (conn !== connection || epoch !== linkEpoch) return;
    conn = null;
    lastPongAt = 0;
    peers = peer && !peer.destroyed ? 1 : 0;
    setStatus("waiting", waitingCopy());
    schedulePeerReconnect(epoch);
  });
  connection.on("error", () => {
    if (conn !== connection || epoch !== linkEpoch) return;
    conn = null;
    lastPongAt = 0;
    peers = peer && !peer.destroyed ? 1 : 0;
    setStatus("connecting", "Connection interrupted. Retrying automatically…");
    schedulePeerReconnect(epoch);
    try {
      connection.close();
    } catch {}
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

// True only when the other device is actually reachable: a live data channel,
// or a relay stream that currently lists a second device in the room.
function hasOpenTransport() {
  if (conn?.open) return true;
  return !!relaySource && relaySource.readyState === 1 && peers >= 2;
}

function sendLinkMessage(message) {
  if (conn?.open) return Promise.resolve(sendPeerMessage(message));
  if (!relaySource || relaySource.readyState !== 1)
    return Promise.resolve(false);
  return fetch(syncUrl("message", { room, key, session: relaySession }), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  })
    .then((response) => response.ok)
    .catch(() => false);
}

function stateMessageId(stamp) {
  return `${device}:${stamp}`;
}

function sendPeerState() {
  const state = currentSave();
  if (!state) return false;
  const stamp = queuedStamp();
  return sendPeerMessage({
    type: "state",
    id: stateMessageId(stamp),
    state,
    savedAt: stamp,
    device,
    ownerDevice,
  });
}

function acceptRemoteIdentity(remoteDeviceId, remoteOwner = "", devices = []) {
  if (typeof remoteDeviceId === "string" && remoteDeviceId)
    remoteDevice = remoteDeviceId;
  updateSyncOwner([remoteDevice, ...devices], [ownerDevice, remoteOwner]);
}

function handlePeerMessage(message, transport = "peer") {
  if (!message || typeof message !== "object") return;
  if (message.type === "hello") {
    const beforeRemote = remoteDevice;
    const beforeOwner = ownerDevice;
    acceptRemoteIdentity(message.from ?? message.device, message.ownerDevice);
    if (
      transport === "peer" &&
      (beforeRemote !== remoteDevice || beforeOwner !== ownerDevice)
    )
      sendPeerMessage({ type: "hello", from: device, ownerDevice });
    return;
  }
  if (message.type === "ping") {
    if (transport === "peer")
      sendPeerMessage({
        type: "pong",
        nonce: message.nonce,
        from: device,
        to: message.from,
      });
    return;
  }
  if (message.type === "pong") {
    if (!message.nonce || message.nonce === lastPingNonce)
      lastPongAt = Date.now();
    if (message.state) handleRemoteState(message, transport);
    return;
  }
  if (message.type === "state") {
    handleRemoteState(message, transport);
    return;
  }
  if (message.type === "state-ack") {
    if (
      (!message.to || message.to === device) &&
      message.id === stateMessageId(savedAt) &&
      pending
    ) {
      pending = false;
      dirtyAt = 0;
      stampedFor = 0;
      persistLink();
      markSynced("sent");
    }
    return;
  }
  if (message.type === "action") {
    handleActionRequest(message, transport);
    return;
  }
  if (message.type === "action-result") {
    if (message.to && message.to !== device) return;
    if (message.from && ownerDevice && message.from !== ownerDevice) return;
    const request = pendingActions.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pendingActions.delete(message.id);
    request.resolve(
      message.result && typeof message.result === "object"
        ? message.result
        : {
            ok: false,
            message: "The main device returned an unreadable reply.",
          },
    );
  }
}

function handleActionRequest(message, transport) {
  if (!message.id || !message.from || !message.action?.type) return;
  if (message.to && message.to !== device) return;
  if (transport === "peer" && remoteDevice && message.from !== remoteDevice)
    return;
  const request = {
    id: message.id,
    from: message.from,
    action: message.action,
  };
  const cacheKey = `${request.from}:${request.id}`;
  if (actionReplies.has(cacheKey)) {
    void sendLinkMessage({
      type: "action-result",
      id: request.id,
      from: device,
      to: request.from,
      result: actionReplies.get(cacheKey),
    });
    return;
  }
  if (inFlightActions.has(cacheKey)) return;
  if (Number.isFinite(message.expiresAt) && message.expiresAt < Date.now()) {
    replySyncAction(request, {
      ok: false,
      message:
        "That action expired while the devices were reconnecting. Try again.",
    });
    return;
  }
  if (!isSyncWriter(device, ownerDevice)) {
    replySyncAction(request, {
      ok: false,
      message:
        "This device is not the account writer. Reconnect to the main device.",
    });
    return;
  }
  inFlightActions.add(cacheKey);
  if (actionListeners.size)
    for (const listener of actionListeners) listener(request);
  else queuedActions.push(request);
}

function handleRemoteState(remote, transport = "peer") {
  if (remote?.device) acceptRemoteIdentity(remote.device, remote.ownerDevice);
  reconcile(remote);
  if (remote?.id)
    void sendLinkMessage({
      type: "state-ack",
      id: remote.id,
      from: device,
      to: remote.device,
    });
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
    sendCurrentState();
  }
}

function sendCurrentState() {
  if (conn?.open) return sendPeerState();
  const state = currentSave();
  if (relaySource?.readyState === 1 && state) {
    void relayPushState(state);
    return true;
  }
  return false;
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
  stampedFor = 0;
  persistLink();
  markSynced("received");
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: raw }));
}

// A quiet liveness check keeps stale WebRTC channels from looking connected;
// state frames are retransmitted only while they remain unacknowledged.
function startHeartbeat(epoch = linkEpoch) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (epoch !== linkEpoch || !peer || peer.destroyed) return;
    if (peer.disconnected) {
      setStatus("connecting", "Connection interrupted. Reconnecting…");
      try {
        peer.reconnect();
      } catch {}
      schedulePeerReconnect(epoch);
      return;
    }
    if (!conn?.open) {
      // A channel that never opened is dropped, so the dialer can try again
      // instead of waiting on a dead attempt forever.
      if (conn && Date.now() - connectingSince > PONG_TIMEOUT_MS) {
        const stalled = conn;
        conn = null;
        try {
          stalled.close();
        } catch {}
      }
      if (!conn && peerSlot === "a") connectToPeer();
      return;
    }
    if (lastPongAt && Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
      const stale = conn;
      conn = null;
      peers = 1;
      setStatus("connecting", "The connection went quiet. Reconnecting…");
      try {
        stale.close();
      } catch {}
      schedulePeerReconnect(epoch);
      return;
    }
    lastPingNonce = `${device}:${++pingSequence}:${Date.now()}`;
    sendPeerMessage({ type: "ping", nonce: lastPingNonce, from: device });
    if (pending && currentProfile()) sendPeerState();
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
      syncUrl("stream", { room, key, session: relaySession, device }),
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
  stream.onopen = () => {
    if (relaySource === stream && everLive)
      setStatus("connecting", "Reconnecting to the relay…");
  };
  stream.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === "hello") {
      clearTimeout(relayHelloTimer);
      updateRelayCount(message.count, message.devices, message.latest?.device);
      if (pending && currentProfile()) {
        void relayPushState(currentSave(), dirtyAt);
        return;
      }
      relayApplyLatest(message.latest, () => {
        if (!message.latest && currentProfile())
          void relayPushState(currentSave());
      });
    } else if (message.type === "state") {
      updateRelayCount(peers, [], message.payload?.device);
      relayApplyLatest(message.payload);
    } else if (message.type === "count")
      updateRelayCount(message.count, message.devices);
    else if (message.type === "message")
      handlePeerMessage(message.message, "relay");
  };
  stream.onerror = () => {
    if (relaySource !== stream) return;
    if (stream.readyState === EventSource.CLOSED) {
      // Relay died — try PeerJS instead of permanently dropping the link.
      relaySource = null;
      setStatus(
        "connecting",
        "Relay unavailable. Switching to browser-to-browser…",
      );
      openPeer();
    } else
      setStatus(
        "connecting",
        "The relay connection dropped. Retrying automatically…",
      );
  };
}

function updateRelayCount(count, devices = [], latestDevice = "") {
  if (typeof count === "number") peers = count;
  const knownDevices = [
    ...(Array.isArray(devices) ? devices : []),
    latestDevice,
  ].filter((candidate) => typeof candidate === "string" && candidate);
  remoteDevice =
    knownDevices.find((candidate) => candidate !== device) ?? remoteDevice;
  updateSyncOwner(knownDevices, []);
  if (typeof count === "number" && count >= 2) {
    everLive = true;
    setStatus("live", `${count} devices live`);
  } else if (room) setStatus("waiting", waitingCopy());
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
  // Keep one acknowledged outbox for both transports. A successful local
  // send is not proof the remote device received it; the pending mark clears
  // only after the peer/relay confirms the state.
  pending = true;
  dirtyAt = Math.max(Date.now(), dirtyAt + 1);
  persistLink();
  emit();
  if (conn?.open) {
    sendPeerState();
    return;
  }
  if (relaySource) {
    relayPendingState = raw;
    if (relaySource.readyState === 1) {
      clearTimeout(relaySendTimer);
      relaySendTimer = setTimeout(() => {
        const state = relayPendingState;
        relayPendingState = "";
        if (state) void relayPushState(state, dirtyAt);
      }, 120);
    }
  }
  // Offline peer saves stay in the durable outbox and are retried on reconnect.
}

function waitForPendingDelivery(timeoutMS = 6000) {
  if (!pending) return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (!pending) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - startedAt >= timeoutMS) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

export async function pushNow() {
  if (!room) return { ok: false, reason: "offline" };
  if (conn?.open) {
    if (!currentSave()) return { ok: false, reason: "empty" };
    pending = true;
    dirtyAt = Math.max(Date.now(), dirtyAt + 1);
    persistLink();
    emit();
    if (!sendPeerState()) return { ok: false, reason: "offline" };
    return (await waitForPendingDelivery())
      ? { ok: true }
      : { ok: false, reason: "offline" };
  }
  const state = relayPendingState || currentSave();
  const stamp = pending ? dirtyAt : 0;
  relayPendingState = "";
  clearTimeout(relaySendTimer);
  if (!state) return { ok: false, reason: "empty" };
  if (!relaySource || relaySource.readyState !== 1)
    return { ok: false, reason: "offline" };
  return relayPushState(state, stamp);
}

async function relayPushState(state, stamp = 0) {
  if (!room || !state) return { ok: false, reason: "offline" };
  savedAt = pending
    ? queuedStamp()
    : Math.max(savedAt + 1, Number(stamp) || Date.now());
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
