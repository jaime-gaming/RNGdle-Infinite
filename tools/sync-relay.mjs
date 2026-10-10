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
// `store: null` (or run with SYNC_STORE=none) for a memory-only relay: it keeps
// every room for as long as it runs, so a closed device is still caught up, and
// it only forgets a room after a month untouched, or when the process restarts.
//
// Endpoints (same origin in dev, thanks to the Vite plugin; CORS-open when
// stood up alone so a static site can point at it):
//   POST /__sync/create          -> { room, key }
//   GET  /__sync/stream?room&key&session&device (Server-Sent Events, duplex)
//   POST /__sync/state?room&key&session        body: { state, savedAt, device }
//   POST /__sync/message?room&key&session     body: { message }
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
// A memory-only room is the only copy the other device can reach while the
// first one is closed, so it is kept as long as a disk room would be.
const MEMORY_TTL_MS = ROOM_TTL_MS;
const REAP_MS = 60 * 60_000; // How often a memory-only relay looks for idle rooms.
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
  const rooms = new Map(); // room -> { key, latest, members: Map, sweep, touchedAt }
  const loading = new Map(); // room -> Promise, so two requests load one room
  const stateWrites = new Map(); // room -> Promise, serialize state commits

  // Health is answered to any browser that opens the game, so it names the
  // store without handing out the machine's directory layout: a path inside
  // the working directory is kept relative, anything else is reduced to its
  // final segment. The absolute path stays on the returned object, where only
  // the process that created the relay can read it.
  const storeLabel = storeDir
    ? (() => {
        const relative = path.relative(process.cwd(), storeDir);
        return relative &&
          !relative.startsWith("..") &&
          !path.isAbsolute(relative)
          ? relative.split(path.sep).join("/")
          : path.basename(storeDir);
      })()
    : null;

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

  function serializeState(room, operation) {
    const previous = stateWrites.get(room) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    stateWrites.set(room, current);
    return current.finally(() => {
      if (stateWrites.get(room) === current) stateWrites.delete(room);
    });
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
    // A unique temporary file avoids colliding with another room commit in the
    // same process. The per-room queue below still decides which complete
    // snapshot reaches the destination last.
    const temporary = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      await mkdir(storeDir, { recursive: true });
      await writeFile(temporary, payload, "utf8");
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      // A caller must never be told that a room was saved when the disk write
      // failed. Let the request fail so its client can retain and retry it.
      throw error;
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
    if (entry) {
      entry.touchedAt = Date.now();
      return guarded(entry, key);
    }
    if (!loading.has(room)) {
      loading.set(
        room,
        readStoredRoom(room).finally(() => loading.delete(room)),
      );
    }
    const stored = await loading.get(room);
    entry = rooms.get(room);
    if (entry) {
      entry.touchedAt = Date.now();
      return guarded(entry, key);
    }
    if (stored && stored.key && stored.key !== key) return { wrongKey: true };
    entry = {
      key: stored?.key || key,
      latest: stored?.latest ?? null,
      members: new Map(),
      sweep: null,
      touchedAt: Date.now(),
    };
    rooms.set(room, entry);
    return entry;
  }

  function countMembers(entry) {
    return entry.members.size;
  }

  function memberDevices(entry) {
    return [
      ...new Set(
        [...entry.members.values()]
          .map((member) => member.device)
          .filter(Boolean),
      ),
    ].sort();
  }

  function broadcast(entry, message, exceptSession = "") {
    const frame = `data: ${JSON.stringify(message)}\n\n`;
    for (const [session, member] of entry.members)
      if (session !== exceptSession) {
        try {
          member.response.write(frame);
        } catch {
          entry.members.delete(session);
        }
      }
  }

  function countAll(entry) {
    broadcast(entry, {
      type: "count",
      count: countMembers(entry),
      devices: memberDevices(entry),
    });
  }

  function sweepRoom(room, entry) {
    // A memory-only room is never swept on its own: nobody else can reach it
    // except through this process, so it stays until reapIdle decides it is
    // stale.
    if (!storeDir || entry.members.size || entry.sweep) return;
    entry.sweep = setTimeout(() => {
      const current = rooms.get(room);
      if (!current || current.members.size) return;
      // A persisted room leaves memory but stays on disk, ready for the next
      // device that opens the link.
      rooms.delete(room);
      const updatedAt = Number(current.updatedAt) || Date.now();
      if (Date.now() - updatedAt > ttlMs) unlink(fileFor(room)).catch(() => {});
    }, 60_000);
    entry.sweep.unref?.();
  }

  // Memory-only housekeeping: a room nobody has opened or written for the whole
  // TTL is forgotten. Rooms with someone listening are never touched.
  function reapIdle(now = Date.now()) {
    for (const [room, entry] of rooms)
      if (!entry.members.size && now - (entry.touchedAt ?? 0) > ttlMs)
        rooms.delete(room);
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
    const device = url.searchParams.get("device") ?? "";
    if (
      !ID_RE.test(room) ||
      !ID_RE.test(session) ||
      key.length < 8 ||
      (device && !ID_RE.test(device))
    )
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
    const previous = entry.members.get(session);
    const replacing = !!previous;
    entry.members.set(session, { response: res, device });
    if (previous && previous.response !== res) {
      try {
        previous.response.end();
      } catch {}
    }
    if (!replacing) countAll(entry);

    // The handshake: what the room holds right now, and who is in it. A
    // client with nothing newer answers with its own state; otherwise it
    // adopts what it is given.
    res.write(
      `data: ${JSON.stringify({
        type: "hello",
        latest: entry.latest,
        count: countMembers(entry),
        devices: memberDevices(entry),
      })}\n\n`,
    );

    const drop = () => {
      if (entry.members.get(session)?.response === res) {
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
    return serializeState(room, async () => {
      if (!beats(incoming, entry.latest)) {
        // The writer is behind: hand back what actually won so it can catch up.
        return send(res, 200, { ok: false, conflict: entry.latest });
      }
      const candidate = { ...entry, latest: incoming, updatedAt: incoming.at };
      // Keep the visible room head unchanged until the candidate is durable.
      // A stream joining during the write gets the last committed state, then
      // the broadcast below advances it only after persistence succeeds.
      await persistRoom(room, candidate);
      entry.latest = incoming;
      entry.updatedAt = incoming.at;
      broadcast(entry, { type: "state", payload: incoming }, session);
      return send(res, 200, { ok: true, count: countMembers(entry) });
    });
  }

  async function forwardMessage(req, res, url) {
    const room = url.searchParams.get("room") ?? "";
    const key = url.searchParams.get("key") ?? "";
    const session = url.searchParams.get("session") ?? "";
    if (!ID_RE.test(room) || key.length < 8 || !ID_RE.test(session))
      return send(res, 400, { error: "bad-request" });
    const entry = await openRoom(room, key);
    if (entry.wrongKey) return send(res, 403, { error: "wrong-key" });
    if (!entry.members.has(session))
      return send(res, 409, { error: "session-not-connected" });
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return send(res, error.message === "State too large" ? 413 : 400, {
        error: error.message,
      });
    }
    const message = body?.message;
    if (
      !message ||
      typeof message !== "object" ||
      !["action", "action-result", "state-ack"].includes(message.type)
    )
      return send(res, 400, { error: "bad-message" });
    broadcast(entry, { type: "message", message, session }, session);
    return send(res, 200, { ok: true });
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
        touchedAt: Date.now(),
      };
      rooms.set(room, entry);
      // The room is on the store before anybody is told its address: a second
      // device can therefore open the link at any later moment.
      try {
        await persistRoom(room, entry);
      } catch (error) {
        if (rooms.get(room) === entry) rooms.delete(room);
        throw error;
      }
      return send(res, 200, { room, key });
    }
    if (url.pathname === `${basePath}/health`) {
      // What the technical page shows: whether this relay keeps rooms on disk
      // (either device may be closed) or only while somebody is listening.
      return send(res, 200, {
        ok: true,
        store: storeDir ? "disk" : "memory",
        storeLabel,
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
    if (url.pathname === `${basePath}/message` && req.method === "POST")
      return forwardMessage(req, res, url);
    return send(res, 404, { error: "not-found" });
  }

  const ready = pruneStore();
  // Only a memory-only relay needs the reaper: a disk room is always on file.
  if (!storeDir) {
    const reaper = setInterval(() => reapIdle(), REAP_MS);
    reaper.unref?.();
  }

  return { handle, rooms, ready, storeDir, reap: reapIdle };
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
