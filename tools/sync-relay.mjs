// The device-link relay — live account sharing with no database of its own.
//
// Two devices open the same link and play one account. This process is the
// meeting point: it keeps the newest save of every room and forwards each
// frame to whoever is listening. The save still belongs to the browsers — the
// relay only ever holds the latest copy of it.
//
// Rooms are stored *on the device that runs this relay* (by default under
// .cache/sync-rooms), which is what makes the link survive closed devices:
// while one side is off, the other keeps writing to the store, and the moment
// the other comes back it is handed everything that happened. That works for
// every combination — both open, one closed, both closed, alternating — with
// the newest save winning whenever two devices played apart. Pass
// `store: null` (or run with SYNC_STORE=none) for a memory-only relay that
// forgets a room as soon as nobody is listening.
//
// Endpoints (same origin in dev, thanks to the Vite plugin; CORS-open when
// stood up alone so a static site can point at it):
//   POST /__sync/create          -> { room, key }
//   GET  /__sync/stream?room&key&session   (Server-Sent Events, duplex)
//   POST /__sync/state?room&key&session    body: { state, savedAt, device }
//
// Ordering: every broadcast carries the writer's `savedAt` stamp and a stable
// `device` id. Later stamps win; a tie goes to the lexicographically smaller
// device id, so both sides reach the same answer without a coordinator.

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // A room is kept for a month.
const MEMORY_TTL_MS = 5 * 60_000; // A memory-only room, five minutes.
const DEFAULT_STORE = path.resolve(".cache/sync-rooms");
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

export function createSyncRelay({
  basePath = "/__sync",
  storeDir = process.env.SYNC_STORE === "none" ? null : DEFAULT_STORE,
  ttlMs = storeDir ? ROOM_TTL_MS : MEMORY_TTL_MS,
} = {}) {
  const rooms = new Map(); // room -> { key, latest, members: Map, sweep }
  const loading = new Map(); // room -> Promise, so two requests load one room

  const fileFor = (room) => path.join(storeDir, `${room}.json`);

  async function readStoredRoom(room) {
    if (!storeDir || !ID_RE.test(room)) return null;
    try {
      const raw = await readFile(fileFor(room), "utf8");
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        (parsed.key !== undefined && typeof parsed.key !== "string")
      )
        return null;
      const updatedAt = Number(parsed.updatedAt) || 0;
      if (updatedAt && Date.now() - updatedAt > ttlMs) {
        await unlink(fileFor(room)).catch(() => {});
        return null;
      }
      return {
        key: String(parsed.key ?? ""),
        latest: parsed.latest ?? null,
        updatedAt,
      };
    } catch {
      return null;
    }
  }

  async function persistRoom(room, entry) {
    if (!storeDir || !ID_RE.test(room)) return;
    const payload = JSON.stringify({
      room,
      key: entry.key,
      latest: entry.latest,
      updatedAt: Date.now(),
    });
    const file = fileFor(room);
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      await mkdir(storeDir, { recursive: true });
      await writeFile(temporary, payload, "utf8");
      await rename(temporary, file);
    } catch {
      await unlink(temporary).catch(() => {});
    }
  }

  // A room may exist only on disk: it was created earlier, or written while
  // this process was not running. Load it before answering anybody.
  // The key is the half of the link that proves the sender belongs to this
  // room. It is checked on every open, not only when the room is read back
  // from disk: a room that lives in memory is no less private than one on file.
  function guarded(entry, key) {
    return entry.key && entry.key !== key ? { wrongKey: true } : entry;
  }

  async function openRoom(room, key) {
    let entry = rooms.get(room);
    if (entry) return guarded(entry, key);
    if (!loading.has(room)) {
      loading.set(
        room,
        readStoredRoom(room).finally(() => loading.delete(room)),
      );
    }
    const stored = await loading.get(room);
    entry = rooms.get(room);
    if (entry) return guarded(entry, key);
    if (stored && stored.key && stored.key !== key) return { wrongKey: true };
    entry = {
      key: stored?.key || key,
      latest: stored?.latest ?? null,
      members: new Map(),
      sweep: null,
    };
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
    entry.sweep = setTimeout(
      () => {
        const current = rooms.get(room);
        if (!current || current.members.size) return;
        // A persisted room leaves memory but stays on disk, ready for the next
        // device that opens the link. A memory-only room simply goes away.
        rooms.delete(room);
        if (!storeDir) return;
        const updatedAt = Number(current.updatedAt) || Date.now();
        if (Date.now() - updatedAt > ttlMs)
          unlink(fileFor(room)).catch(() => {});
      },
      storeDir ? 60_000 : MEMORY_TTL_MS,
    );
    entry.sweep.unref?.();
  }

  // Housekeeping on the store itself: drop rooms nobody has touched in a
  // month, so a long-lived relay does not grow without bound.
  async function pruneStore() {
    if (!storeDir) return;
    try {
      const files = await readdir(storeDir);
      const now = Date.now();
      for (const name of files) {
        if (!name.endsWith(".json")) continue;
        const room = name.slice(0, -5);
        if (rooms.has(room)) continue;
        const stored = await readStoredRoom(room);
        if (!stored && ID_RE.test(room))
          await unlink(path.join(storeDir, name)).catch(() => {});
        else if (stored?.updatedAt && now - stored.updatedAt > ttlMs)
          await unlink(path.join(storeDir, name)).catch(() => {});
      }
    } catch {
      // No store yet: nothing to prune.
    }
  }

  async function openStream(req, res, url) {
    const room = url.searchParams.get("room") ?? "";
    const key = url.searchParams.get("key") ?? "";
    const session = url.searchParams.get("session") ?? "";
    if (!ID_RE.test(room) || !ID_RE.test(session) || key.length < 8)
      return send(res, 400, { error: "bad-request" });
    const entry = await openRoom(room, key);
    if (entry.wrongKey) return send(res, 403, { error: "wrong-key" });
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
    if (!ID_RE.test(room) || key.length < 8 || !ID_RE.test(session))
      return send(res, 400, { error: "bad-request" });
    const entry = await openRoom(room, key);
    if (entry.wrongKey) return send(res, 403, { error: "wrong-key" });
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
    const incoming = { state, savedAt, device, at: Date.now() };
    if (beats(incoming, entry.latest)) {
      entry.latest = incoming;
      entry.updatedAt = incoming.at;
      // Write to the store before answering, so "sent" means "kept".
      await persistRoom(room, entry);
      broadcast(entry, { type: "state", payload: incoming }, session);
      return send(res, 200, { ok: true, count: countMembers(entry) });
    }
    // The writer is behind: hand back what actually won so it can catch up.
    return send(res, 200, { ok: false, conflict: entry.latest });
  }

  async function handle(req, res, next) {
    try {
      return await route(req, res, next);
    } catch {
      // A broken frame or a full disk must never take the relay (or the dev
      // server hosting it) down with it.
      if (!res.headersSent) return send(res, 500, { error: "relay-error" });
      try {
        res.end();
      } catch {}
    }
  }

  async function route(req, res, next) {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (!url.pathname.startsWith(basePath)) return next?.();
    if (req.method === "OPTIONS")
      return send(res, 204, {}, { "access-control-max-age": "86400" });
    if (url.pathname === `${basePath}/create` && req.method === "POST") {
      const room = randomBytes(9).toString("base64url");
      const key = randomBytes(18).toString("base64url");
      const entry = {
        key,
        latest: null,
        members: new Map(),
        sweep: null,
      };
      rooms.set(room, entry);
      // The room is on the store before anybody is told its address: a second
      // device can therefore open the link at any later moment.
      await persistRoom(room, entry);
      return send(res, 200, { room, key });
    }
    if (url.pathname === `${basePath}/health`) {
      // What the technical page shows: whether this relay keeps rooms on disk
      // (either device may be closed) or only while somebody is listening.
      return send(res, 200, {
        ok: true,
        store: storeDir ? "disk" : "memory",
        storeDir: storeDir ?? null,
        rooms: rooms.size,
        ttlMs,
      });
    }
    if (url.pathname === `${basePath}/stream`) {
      if (req.method !== "GET") return send(res, 405, { error: "method" });
      return openStream(req, res, url);
    }
    if (url.pathname === `${basePath}/state` && req.method === "POST")
      return acceptState(req, res, url);
    return send(res, 404, { error: "not-found" });
  }

  const ready = pruneStore();

  return { handle, rooms, ready, storeDir };
}

// Standalone mode: `node tools/sync-relay.mjs` (or `npm run relay`) for a
// deployment where the site is static. Rooms are stored on this machine.
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
    console.log(
      relay.storeDir
        ? `sync relay listening on :${port} (rooms stored in ${relay.storeDir})`
        : `sync relay listening on :${port} (memory only)`,
    );
  });
}
