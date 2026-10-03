// The device-link relay — live account sharing with no database.
//
// Two devices open the same link and play the same account at the same time.
// This process only *forwards* state: rooms live in memory, nothing is written
// to disk, and a restart simply empties the relay. The save itself always
// stays in the players' browsers — the relay is a post office, not a vault.
//
// Endpoints (same origin in dev, thanks to the Vite plugin; CORS-open when
// stood up alone so a static site can point at it):
//   POST /__sync/create          -> { room, key }
//   GET  /__sync/stream?room&key&session   (Server-Sent Events, duplex)
//   POST /__sync/state?room&key&session    body: { state, savedAt, device }
//
// Ordering: every broadcast carries the writer's `savedAt` stamp and a stable
// `device` id. Later stamps win; a tie goes to the lexicographically smaller
// device id. The relay keeps only the winning state per room, so both sides
// converge on the same save without ever storing it anywhere.

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

const ROOM_TTL_MS = 5 * 60_000; // Keep an empty room five minutes.
const MAX_STATE_BYTES = 4 * 1024 * 1024; // Generous for any real save.
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

// The same total order both ends of the wire use to resolve a conflict.
export function beats(incoming, stored) {
  if (!stored) return true;
  if (incoming.savedAt !== stored.savedAt)
    return incoming.savedAt > stored.savedAt;
  if (incoming.device === stored.device) return true; // Same writer, newer post.
  return incoming.device < stored.device;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_STATE_BYTES) {
        reject(new Error("State too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    ...headers,
  });
  res.end(payload);
}

export function createSyncRelay({ basePath = "/__sync" } = {}) {
  const rooms = new Map(); // room -> { key, latest, members: Map, sweep }

  function ensureRoom(room, key) {
    let entry = rooms.get(room);
    if (entry) return entry;
    entry = { key, latest: null, members: new Map(), sweep: null };
    rooms.set(room, entry);
    return entry;
  }

  function countMembers(entry) {
    return entry.members.size;
  }

  function broadcast(entry, message, exceptSession = "") {
    const frame = `data: ${JSON.stringify(message)}\n\n`;
    for (const [session, res] of entry.members)
      if (session !== exceptSession) {
        try {
          res.write(frame);
        } catch {
          entry.members.delete(session);
        }
      }
  }

  function countAll(entry) {
    broadcast(entry, { type: "count", count: countMembers(entry) });
  }

  function sweepRoom(room, entry) {
    if (entry.members.size || entry.sweep) return;
    entry.sweep = setTimeout(() => {
      const current = rooms.get(room);
      if (current && !current.members.size) rooms.delete(room);
    }, ROOM_TTL_MS);
    entry.sweep.unref?.();
  }

  function openStream(req, res, url) {
    const room = url.searchParams.get("room") ?? "";
    const key = url.searchParams.get("key") ?? "";
    const session = url.searchParams.get("session") ?? "";
    if (!ID_RE.test(room) || !ID_RE.test(session) || key.length < 8)
      return send(res, 400, { error: "bad-request" });
    const existing = rooms.get(room);
    if (existing && existing.key !== key)
      return send(res, 403, { error: "wrong-key" });
    const entry = ensureRoom(room, key);
    clearTimeout(entry.sweep);
    entry.sweep = null;

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
      "x-accel-buffering": "no",
    });
    res.write(": connected\n\n");

    // A previous tab on this device may still be registered: replace it, and
    // let the room know the headcount changed.
    const replacing = entry.members.has(session);
    entry.members.set(session, res);
    if (!replacing) countAll(entry);

    // The handshake: what the room holds right now, and who is in it. A
    // client with nothing newer answers with its own state; otherwise it
    // adopts what it is given.
    res.write(
      `data: ${JSON.stringify({
        type: "hello",
        latest: entry.latest,
        count: countMembers(entry),
      })}\n\n`,
    );

    const drop = () => {
      if (entry.members.get(session) === res) {
        entry.members.delete(session);
        countAll(entry);
        sweepRoom(room, entry);
      }
    };
    res.on("close", drop);
    res.on("error", drop);
    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepAlive);
        drop();
      }
    }, 25000);
    keepAlive.unref?.();
    res.on("close", () => clearInterval(keepAlive));
  }

  async function acceptState(req, res, url) {
    const room = url.searchParams.get("room") ?? "";
    const key = url.searchParams.get("key") ?? "";
    const session = url.searchParams.get("session") ?? "";
    const entry = rooms.get(room);
    if (!entry || entry.key !== key)
      return send(res, 403, { error: "wrong-key" });
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return send(res, error.message === "State too large" ? 413 : 400, {
        error: error.message,
      });
    }
    const { state, savedAt, device } = body;
    if (
      typeof state !== "string" ||
      !Number.isFinite(savedAt) ||
      typeof device !== "string" ||
      !state
    )
      return send(res, 400, { error: "bad-state" });
    const incoming = { state, savedAt, device };
    if (beats(incoming, entry.latest)) {
      entry.latest = incoming;
      broadcast(entry, { type: "state", payload: incoming }, session);
      return send(res, 200, { ok: true, count: countMembers(entry) });
    }
    // The writer is behind: hand back what actually won so it can catch up.
    return send(res, 200, { ok: false, conflict: entry.latest });
  }

  async function handle(req, res, next) {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (!url.pathname.startsWith(basePath)) return next?.();
    if (req.method === "OPTIONS")
      return send(res, 204, {}, { "access-control-max-age": "86400" });
    if (url.pathname === `${basePath}/create` && req.method === "POST") {
      const room = randomBytes(9).toString("base64url");
      const key = randomBytes(18).toString("base64url");
      ensureRoom(room, key);
      return send(res, 200, { room, key });
    }
    if (url.pathname === `${basePath}/stream`) {
      if (req.method !== "GET") return send(res, 405, { error: "method" });
      return openStream(req, res, url);
    }
    if (url.pathname === `${basePath}/state` && req.method === "POST")
      return acceptState(req, res, url);
    return send(res, 404, { error: "not-found" });
  }

  return { handle, rooms };
}

// Standalone mode: `node tools/sync-relay.mjs` (or `npm run relay`) for a
// deployment where the site is static — still no database, just RAM.
const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { createServer } = await import("node:http");
  const relay = createSyncRelay();
  const port = Number(process.env.SYNC_RELAY_PORT || 8787);
  createServer((req, res) =>
    relay.handle(req, res, () => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("sync relay");
    }),
  ).listen(port, "0.0.0.0", () => {
    console.log(`sync relay listening on :${port} (memory only, no database)`);
  });
}
