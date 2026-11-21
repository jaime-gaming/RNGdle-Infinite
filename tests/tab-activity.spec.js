import { test, expect } from "@playwright/test";
import { AWAY_GRACE_MS, watchTabActivity } from "../src/tab-activity.js";
import {
  PRESENCE_STALE_MS,
  markPresenceHidden,
  offlinePlan,
} from "../src/offline.js";

function installFakeDocument(visibility = "visible") {
  const listeners = new Map();
  const add = (event, handler) =>
    listeners.set(event, [...(listeners.get(event) ?? []), handler]);
  const remove = (event, handler) =>
    listeners.set(
      event,
      (listeners.get(event) ?? []).filter((entry) => entry !== handler),
    );
  const document = {
    visibilityState: visibility,
    addEventListener: add,
    removeEventListener: remove,
  };
  const previous = {
    document: globalThis.document,
    add: globalThis.addEventListener,
    remove: globalThis.removeEventListener,
  };
  globalThis.document = document;
  globalThis.addEventListener = (event, handler) =>
    add(`window:${event}`, handler);
  globalThis.removeEventListener = (event, handler) =>
    remove(`window:${event}`, handler);
  return {
    document,
    dispatch: (event) => {
      for (const handler of listeners.get(event) ?? []) handler();
    },
    documentEvent: (event) => {
      for (const handler of listeners.get(event) ?? []) handler();
    },
    restore: () => {
      globalThis.document = previous.document;
      globalThis.addEventListener = previous.add;
      globalThis.removeEventListener = previous.remove;
    },
  };
}

test("leaving the tab is reported inactive and returning brings it back", async () => {
  const fake = installFakeDocument();
  try {
    const seen = [];
    const stop = watchTabActivity((active) => seen.push(active), {
      graceMs: 0,
    });
    expect(seen.at(-1)).toBe(true);

    fake.dispatch("window:blur");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen.at(-1)).toBe(false);

    fake.dispatch("window:focus");
    expect(seen.at(-1)).toBe(true);

    fake.document.visibilityState = "hidden";
    fake.documentEvent("visibilitychange");
    expect(seen.at(-1)).toBe(false);

    fake.document.visibilityState = "visible";
    fake.documentEvent("visibilitychange");
    expect(seen.at(-1)).toBe(true);

    stop();
    const length = seen.length;
    fake.dispatch("window:blur");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toHaveLength(length);
  } finally {
    fake.restore();
  }
  expect(AWAY_GRACE_MS).toBeGreaterThan(0);
});

test("a stale visible presence no longer suppresses offline rolls", () => {
  const now = 100_000_000;
  const stale = [{ id: "other", at: now - 3_000_000, visible: true }];
  const fresh = [{ id: "other", at: now - 1000, visible: true }];
  const plan = (presence) =>
    offlinePlan({ lastSeenAt: now - 3_600_000 }, now, presence, "mine", true)
      .count;
  expect(plan(fresh)).toBe(0);
  expect(plan(stale)).toBe(5);
  expect(now - stale[0].at).toBeGreaterThan(PRESENCE_STALE_MS);
});

test("hiding a tab writes a visible:false presence without losing the profile", () => {
  const entries = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
  try {
    markPresenceHidden("profile-a", "tab-1", 5000);
    const saved = JSON.parse(
      globalThis.localStorage.getItem(
        "rng-infinite-presence-v1:profile-a:tab-1",
      ),
    );
    expect(saved).toEqual({ at: 5000, visible: false });
    markPresenceHidden(null, "tab-1", 6000);
    expect(entries.size).toBe(1);
  } finally {
    globalThis.localStorage = previous;
  }
});
