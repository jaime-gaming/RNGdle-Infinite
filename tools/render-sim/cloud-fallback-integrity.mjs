import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { installBrowserShims, installFetch } from "./cloud-fallback.mjs";
import { emptyProgress, PROGRESS_KEY } from "../../src/progress.js";
import { packVaultSave } from "../../src/save-codec.js";
import { CLOUD_OWNER_KEY } from "../../src/save-owner.js";
import {
  readCloudOutage,
  rememberCloudOutage,
} from "../../src/cloud-fallback.js";
import { setGameTokenSource } from "../../src/game-authority-client.js";
import {
  useStatusIssue,
  getStatusIssue,
  maintenanceActiveFor,
} from "../../src/use-status-issue.js";
import { STATUS_SUMMARY_URL } from "../../src/status-page.js";
import { useProgress } from "../../src/use-progress.js";

const UID = "uid-integrity";
const PROFILE = "profile-integrity";
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

function StatusMonitor() {
  useStatusIssue();
  return null;
}

async function mount({ status = false } = {}) {
  const progress = {
    ...emptyProgress(),
    profile: { id: PROFILE, username: "IntegrityPlayer", createdAt: 1 },
  };
  localStorage.setItem(PROGRESS_KEY, packVaultSave(JSON.stringify(progress)));
  localStorage.setItem(CLOUD_OWNER_KEY, UID);
  let session;
  function Probe() {
    session = useProgress({
      userId: UID,
      authReady: true,
      cloudEnabled: true,
      requireCloudAccount: true,
      localPlay: false,
      online: true,
      tabActive: false,
    });
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        {status && <StatusMonitor />}
        <Probe />
      </>,
    ),
  );
  await settle();
  return {
    get session() {
      return session;
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

export async function run() {
  installBrowserShims();
  setGameTokenSource(async (userId) => ({
    uid: userId,
    getIdToken: async () => "firebase-id-token",
  }));
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = (...args) => {
    if (!/not wrapped in act/.test(String(args[0]))) originalError(...args);
  };
  try {
    localStorage.clear();
    sessionStorage.clear();
    const maintenanceCalls = installFetch({ fail: { roll: true } });
    const normalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) =>
      String(input) === STATUS_SUMMARY_URL
        ? Response.json({
            components: [],
            incidents: [],
            scheduled_maintenances: [
              {
                id: "maintenance-regression",
                name: "RNGdle Infinite maintenance",
                status: "in_progress",
              },
            ],
          })
        : normalFetch(input, options);
    const maintenanceFixture = await mount({ status: true });
    try {
      assert.equal(maintenanceActiveFor(getStatusIssue()), true);
      const response = await act(async () =>
        maintenanceFixture.session.dispatch({ type: "draw" }),
      );
      assert.equal(response.ok, true);
      assert.ok(maintenanceFixture.session.progress.pendingRoll);
      assert.equal(
        maintenanceCalls.some((call) => call.includes("/api/game/roll")),
        false,
      );
      assert.equal(readCloudOutage(), null);
      console.log(
        "   PASS scheduled maintenance commits local rolls without waiting for Cloud or creating an outage mark",
      );
    } finally {
      await maintenanceFixture.unmount();
    }
    installFetch({ fail: {} });
    const clearStatus = await mount({ status: true });
    await clearStatus.unmount();
    assert.equal(maintenanceActiveFor(getStatusIssue()), false);

    localStorage.clear();
    sessionStorage.clear();
    installFetch({ fail: { roll: true } });
    let fixture = await mount();
    const storage = globalThis.localStorage;
    globalThis.localStorage = new Proxy(storage, {
      get(target, key) {
        if (key === "setItem")
          return (name, value) => {
            if (name === PROGRESS_KEY) throw new Error("QuotaExceededError");
            return target.setItem(name, value);
          };
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const result = await act(async () =>
        fixture.session.dispatch({ type: "draw" }),
      );
      assert.equal(
        result.ok,
        false,
        "a failed commit cannot expose the fallback roll",
      );
      assert.equal(
        readCloudOutage(),
        null,
        "a failed commit cannot activate the fallback mark",
      );
      assert.equal(fixture.session.progress.pendingRoll, null);
      console.log(
        "   PASS storage failure leaves no fallback mark or pending roll",
      );
    } finally {
      globalThis.localStorage = storage;
      await fixture.unmount();
    }

    localStorage.clear();
    sessionStorage.clear();
    rememberCloudOutage({
      userId: UID,
      sessionId: "outage-restricted",
      profileId: PROFILE,
    });
    globalThis.fetch = async () =>
      Response.json(
        {
          ok: false,
          code: "cloud-restricted",
          security: { status: "restricted", message: "Cloud access paused." },
        },
        { status: 403 },
      );
    fixture = await mount();
    try {
      assert.equal(fixture.session.gameSecurity.status, "restricted");
      const result = await act(async () =>
        fixture.session.dispatch({ type: "draw" }),
      );
      assert.equal(
        result.ok,
        false,
        "an outage mark cannot override a server restriction",
      );
      assert.equal(fixture.session.progress.pendingRoll, null);
      console.log(
        "   PASS a real restriction never silently becomes automatic local play",
      );
    } finally {
      await fixture.unmount();
    }

    localStorage.clear();
    sessionStorage.clear();
    rememberCloudOutage({
      userId: UID,
      sessionId: "outage-budget-recovered",
      profileId: PROFILE,
      attempts: 40,
    });
    installFetch({ fail: {} });
    fixture = await mount();
    try {
      assert.equal(
        readCloudOutage(),
        null,
        "a fresh healthy status check heals even an exhausted retry budget",
      );
      assert.equal(fixture.session.cloudOutageActive, false);
      console.log(
        "   PASS a recovered Worker is detected after reloading an exhausted retry session",
      );
    } finally {
      await fixture.unmount();
    }

    localStorage.clear();
    sessionStorage.clear();
    rememberCloudOutage({
      userId: UID,
      sessionId: "outage-budget",
      profileId: PROFILE,
      attempts: 39,
    });
    globalThis.fetch = async () =>
      Response.json(
        { ok: false, code: "game-security-unavailable" },
        { status: 503 },
      );
    const timeout = globalThis.setTimeout;
    const clear = globalThis.clearTimeout;
    let timerId = -100;
    const probes = [];
    globalThis.setTimeout = (callback, ms, ...args) => {
      if (ms === 60000) {
        callback.timerId = --timerId;
        probes.push(callback);
        return callback.timerId;
      }
      return timeout(callback, ms, ...args);
    };
    globalThis.clearTimeout = (id) => {
      const index = probes.findIndex((callback) => callback.timerId === id);
      if (index >= 0) probes.splice(index, 1);
      else clear(id);
    };
    try {
      fixture = await mount();
      assert.equal(probes.length, 1, "attempt 39 schedules one final probe");
      const probe = probes.shift();
      await act(async () => {
        await probe();
      });
      await settle();
      assert.equal(readCloudOutage().attempts, 40);
      assert.equal(
        probes.length,
        0,
        "attempt 40 does not schedule another timer",
      );
      console.log(
        "   PASS the actual recovery hook stops scheduling after its retry budget",
      );
    } finally {
      globalThis.setTimeout = timeout;
      globalThis.clearTimeout = clear;
      await fixture.unmount();
    }
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    setGameTokenSource(null);
  }
}
