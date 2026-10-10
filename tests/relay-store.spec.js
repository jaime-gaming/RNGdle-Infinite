import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSyncRelay, beats } from "../tools/sync-relay.mjs";

// The relay is what makes a device link survive a closed device. These are the
// guarantees behind "either side may be off": a room is written before the
// sender is told it worked, it survives the relay being restarted, a lost race
// is answered with the save that won, and the store does not grow forever.

async function startRelay(options) {
  const relay = createSyncRelay(options);
  await relay.ready;
  const server = createServer((req, res) =>
    relay.handle(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    relay,
    base: `http://127.0.0.1:${port}/__sync`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const headers = { "content-type": "application/json" };

async function create(base) {
  const response = await fetch(`${base}/create`, { method: "POST" });
  expect(response.ok).toBe(true);
  return response.json();
}

async function push(
  base,
  { room, key },
  body,
  { device = "device-a", session = "session-writer" } = {},
) {
  const response = await fetch(
    `${base}/state?room=${room}&key=${key}&session=${session}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ device, ...body }),
    },
  );
  return { status: response.status, body: await response.json() };
}

// One SSE frame read by hand: the opening `hello` states what the room holds.
async function hello(base, { room, key }) {
  const controller = new AbortController();
  const response = await fetch(
    `${base}/stream?room=${room}&key=${key}&session=session-${Date.now()}`,
    { signal: controller.signal },
  );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Frames are separated by a blank line; the room sends a headcount
      // before the handshake, so read every frame rather than the first one.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((row) => row.startsWith("data: "));
        if (!line) continue;
        const message = JSON.parse(line.slice(6));
        if (message.type === "hello") return message;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    controller.abort();
  }
  throw new Error("The relay never said hello.");
}

test("a disk store is announced by name, never by absolute path", async () => {
  const store = await mkdtemp(path.join(tmpdir(), "rngdle-relay-"));
  try {
    const host = await startRelay({ storeDir: store });
    const health = await (await fetch(`${host.base}/health`)).json();
    expect(health.ok).toBe(true);
    expect(health.store).toBe("disk");
    // The label is the store's own name, and nothing in the payload hints at
    // where the machine keeps its files.
    expect(health.storeLabel).toBe(path.basename(store));
    expect(JSON.stringify(health)).not.toContain(store);
    expect(JSON.stringify(health)).not.toMatch(/\/(home|Users|var|tmp|root)\//);
    await host.close();
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});

test("a room outlives the relay: a device that returns later is caught up", async () => {
  const store = await mkdtemp(path.join(tmpdir(), "rngdle-relay-"));
  try {
    // One device creates the link and plays alone.
    let host = await startRelay({ storeDir: store });
    const room = await create(host.base);
    const first = await push(host.base, room, {
      state: JSON.stringify({ who: "A", owned: ["archive-lens"] }),
      savedAt: 1_000_000,
    });
    expect(first.body.ok).toBe(true);
    // The room is on disk before the sender is told anything, so losing the
    // relay right now cannot lose the save.
    const onDisk = JSON.parse(
      await readFile(path.join(store, `${room.room}.json`), "utf8"),
    );
    expect(onDisk.key).toBe(room.key);
    expect(onDisk.latest.savedAt).toBe(1_000_000);
    await host.close();

    // A brand-new relay process, same store: the room is still there, and the
    // device that was never open in between finds everything waiting.
    host = await startRelay({ storeDir: store });
    const late = await hello(host.base, room);
    expect(JSON.parse(late.latest.state).owned).toEqual(["archive-lens"]);
    expect(late.count).toBe(1);

    // It plays on alone — the other device is still closed — and pushes.
    const second = await push(host.base, room, {
      state: JSON.stringify({ who: "B", owned: ["archive-lens", "auto-roll"] }),
      savedAt: 2_000_000,
    });
    expect(second.body.ok).toBe(true);

    // The first device comes back and is handed the newer save, not its own.
    const back = await hello(host.base, room);
    expect(JSON.parse(back.latest.state).owned).toEqual([
      "archive-lens",
      "auto-roll",
    ]);

    // The same stamp from two devices is settled by device id — the smaller
    // one wins — so both ends pick the same winner instead of flip-flopping.
    expect(
      beats({ savedAt: 3, device: "a" }, { savedAt: 3, device: "b" }),
    ).toBe(true);
    expect(
      beats({ savedAt: 3, device: "b" }, { savedAt: 3, device: "a" }),
    ).toBe(false);

    // A frame that lost the race is refused with the winner, so the slow
    // writer catches up instead of flattening the other device's work.
    const stale = await push(host.base, room, {
      state: JSON.stringify({ who: "A", owned: ["archive-lens"] }),
      savedAt: 500_000,
    });
    expect(stale.body.ok).toBe(false);
    expect(JSON.parse(stale.body.conflict.state).owned).toEqual([
      "archive-lens",
      "auto-roll",
    ]);
    await host.close();
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});

test("a failed room write is reported and leaves the last durable save in place", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rngdle-relay-"));
  const store = path.join(root, "rooms");
  const moved = path.join(root, "rooms-preserved");
  let host;
  try {
    host = await startRelay({ storeDir: store });
    const room = await create(host.base);
    const first = await push(host.base, room, {
      state: JSON.stringify({ version: "durable" }),
      savedAt: 100,
    });
    expect(first.body.ok).toBe(true);

    // Replace the directory with a regular file to force the next atomic store
    // write to fail, including on environments where chmod is ineffective.
    await rename(store, moved);
    await writeFile(store, "not a directory", "utf8");
    const failed = await push(host.base, room, {
      state: JSON.stringify({ version: "not-durable" }),
      savedAt: 200,
    });
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: "relay-error" });
    expect(host.relay.rooms.get(room.room).latest.savedAt).toBe(100);

    await unlink(store);
    await rename(moved, store);
    await host.close();
    host = null;

    const fresh = await startRelay({ storeDir: store });
    try {
      expect(JSON.parse((await hello(fresh.base, room)).latest.state)).toEqual({
        version: "durable",
      });
    } finally {
      await fresh.close();
    }
  } finally {
    await host?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a room is not announced or retained in memory when its first write fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rngdle-relay-"));
  const blockedStore = path.join(root, "not-a-directory");
  await writeFile(blockedStore, "blocker", "utf8");
  try {
    const host = await startRelay({ storeDir: blockedStore });
    try {
      const response = await fetch(`${host.base}/create`, { method: "POST" });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "relay-error" });
      expect(host.relay.rooms.size).toBe(0);
    } finally {
      await host.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel writes to one room persist the highest accepted stamp", async () => {
  const store = await mkdtemp(path.join(tmpdir(), "rngdle-relay-"));
  let host;
  try {
    host = await startRelay({ storeDir: store });
    const room = await create(host.base);
    const updates = await Promise.all(
      Array.from({ length: 12 }, (_, sequence) =>
        push(host.base, room, {
          state: JSON.stringify({ sequence, padding: "x".repeat(120_000) }),
          savedAt: sequence + 1,
        }),
      ),
    );
    expect(updates.every((update) => update.status === 200)).toBe(true);
    const saved = JSON.parse(
      await readFile(path.join(store, `${room.room}.json`), "utf8"),
    );
    expect(saved.latest.savedAt).toBe(12);
    expect(JSON.parse(saved.latest.state).sequence).toBe(11);
  } finally {
    await host?.close();
    await rm(store, { recursive: true, force: true });
  }
});

test("a wrong key is refused and an abandoned room is swept away", async () => {
  const store = await mkdtemp(path.join(tmpdir(), "rngdle-relay-"));
  try {
    const host = await startRelay({ storeDir: store });
    const room = await create(host.base);
    const wrongKey = "not-the-right-key";
    expect(
      (
        await push(
          host.base,
          { room: room.room, key: wrongKey },
          { state: "{}", savedAt: 1 },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(
          `${host.base}/stream?room=${room.room}&key=${wrongKey}&session=session-wrong`,
        )
      ).status,
    ).toBe(403);
    await push(host.base, room, {
      state: JSON.stringify({ n: 1 }),
      savedAt: 1_000_000,
    });
    await host.close();

    // Room files are not kept forever: a relay that starts long after the last
    // save drops the room instead of resurrecting it.
    const file = path.join(store, `${room.room}.json`);
    const stored = JSON.parse(await readFile(file, "utf8"));
    // A key is checked just as strictly when the room is read back from disk
    // on a fresh relay as when it lives in memory.
    const fresh = await startRelay({ storeDir: store });
    expect(
      (
        await push(
          fresh.base,
          { room: room.room, key: wrongKey },
          { state: "{}", savedAt: 2_000_000 },
        )
      ).status,
    ).toBe(403);
    await fresh.close();

    await writeFile(file, JSON.stringify({ ...stored, updatedAt: 1 }), "utf8");
    const after = await startRelay({ storeDir: store, ttlMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await readdir(store)).not.toContain(`${room.room}.json`);
    await after.close();
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});

test("with no store the relay is a memory-only room, and health says so", async () => {
  const host = await startRelay({ storeDir: null });
  try {
    expect(host.relay.storeDir).toBe(null);
    const health = await (await fetch(`${host.base}/health`)).json();
    expect(health).toMatchObject({
      ok: true,
      store: "memory",
      storeLabel: null,
    });
    // Health is answered to any browser that opens the game, so it must never
    // describe the machine's directory layout: no absolute path anywhere.
    expect(Object.keys(health)).not.toContain("storeDir");
    expect(JSON.stringify(health)).not.toMatch(/\/(home|Users|var|tmp|root)\//);
    const room = await create(host.base);
    const pushed = await push(host.base, room, {
      state: JSON.stringify({ n: 1 }),
      savedAt: 1_000_000,
    });
    expect(pushed.body.ok).toBe(true);
    const late = await hello(host.base, room);
    expect(JSON.parse(late.latest.state)).toEqual({ n: 1 });
  } finally {
    await host.close();
  }
});

test("a memory-only room outlives the device that wrote it, and only goes after a month untouched", async () => {
  const host = await startRelay({ storeDir: null });
  try {
    const room = await create(host.base);
    const pushed = await push(host.base, room, {
      state: JSON.stringify({ n: 2 }),
      savedAt: 2_000_000,
    });
    expect(pushed.body.ok).toBe(true);
    // A device listens for a moment and leaves. Nothing is swept on a timer, so
    // the room is still there for the other device to catch up from.
    await hello(host.base, room);
    expect(host.relay.rooms.has(room.room)).toBe(true);
    const late = await hello(host.base, room);
    expect(JSON.parse(late.latest.state)).toEqual({ n: 2 });
    // Opening the room counts as using it; a day later it is still kept.
    host.relay.reap(Date.now() + 24 * 60 * 60_000);
    expect(host.relay.rooms.has(room.room)).toBe(true);
    // A month without anybody touching it is the only thing that forgets it.
    // The listener's departure is seen by the relay a moment after it leaves.
    await expect
      .poll(() => host.relay.rooms.get(room.room)?.members.size)
      .toBe(0);
    host.relay.reap(Date.now() + 31 * 24 * 60 * 60_000);
    expect(host.relay.rooms.has(room.room)).toBe(false);
  } finally {
    await host.close();
  }
});
