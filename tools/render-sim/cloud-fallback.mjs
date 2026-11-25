// The Cloud-outage fallback, driven through the real progress hook: while the
// Worker cannot verify a roll the game keeps playing locally, and when the
// Worker answers again the pause lifts without the player changing anything.
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { emptyProgress } from "../../src/progress.js";
import { clearCloudOutage, readCloudOutage } from "../../src/cloud-fallback.js";
import { allowsLocalFallback } from "../../src/error-codes.js";

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
}

const UID = "uid-fallback";

function installFetch({ fail }) {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), "https://game.example/");
    calls.push(`${options.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/api/game/status")
      return Response.json({
        ok: true,
        security: { status: "clear", warningStage: 0, message: "" },
      });
    if (url.pathname === "/api/game/roll") {
      if (fail.roll)
        return Response.json(
          {
            ok: false,
            code: "game-security-unavailable",
            hint: "deployment",
            message:
              "Cloud rolls cannot be verified right now. Your saved progress is safe; try again later or continue locally.",
          },
          { status: 503 },
        );
      return Response.json({
        ok: true,
        rollId: "roll-1",
        profileId: "profile-fallback",
        drawCount: 1,
        numbers: [123456],
        timing: { rollMS: 45000, cooldownMS: 60000 },
        armedSkills: [],
        firedSkills: [],
        flywheel: null,
        security: { status: "clear", warningStage: 0, message: "" },
        serverTime: Date.now(),
        nextAllowedAt: Date.now() + 105000,
      });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  return calls;
}

// A draw resolves the roll worker through import.meta.url, which this bundle
// format does not carry, and scores it in a worker. Both are replaced with the
// page origin and an immediate answer so the test stays about the fallback.
function installBrowserShims() {
  const RealURL = globalThis.URL;
  globalThis.URL = class extends RealURL {
    constructor(input, base) {
      super(input, base ?? "http://localhost/");
    }
  };
  globalThis.location = new URL("http://localhost/");
  globalThis.Worker = class {
    constructor() {
      this.onmessage = null;
    }
    postMessage({ id, type, number }) {
      const result = {
        number: Number.isSafeInteger(number) ? number : 123456,
        totalEP: 10,
        tier: "common",
        badges: [],
        groups: [],
      };
      const payload =
        type === "init"
          ? { id, result: true }
          : type === "roll-many"
            ? { id, result: [result.number] }
            : type === "restore-many"
              ? { id, result: [result] }
              : { id, result };
      setTimeout(() => this.onmessage?.({ data: payload }), 0);
    }
    terminate() {}
  };
  // The game guards a draw with the Web Locks API so two tabs cannot roll at
  // once; happy-dom has no lock manager.
  Object.defineProperty(globalThis.navigator, "locks", {
    value: { request: (_name, callback) => Promise.resolve(callback()) },
    configurable: true,
  });
  globalThis.crypto ??= {
    randomUUID: () => "00000000-0000-4000-8000-000000000000",
  };
}

export async function run() {
  installBrowserShims();
  localStorage.removeItem("rng-infinite-local-play-v1");
  clearCloudOutage();
  const { setGameTokenSource } =
    await import("../../src/game-authority-client.js");
  // Tests run without Firebase configured, so the signed-in user is supplied
  // through the same seam a configured build uses.
  setGameTokenSource(async () => ({
    uid: UID,
    getIdToken: async () => "firebase-id-token",
  }));

  // A signed-in account whose local copy this device already owns: the
  // situation the fallback exists for.
  const { PROGRESS_KEY } = await import("../../src/progress.js");
  const { packVaultSave } = await import("../../src/save-codec.js");
  const { CLOUD_OWNER_KEY } = await import("../../src/save-owner.js");
  const owned = {
    ...emptyProgress(),
    profile: {
      id: "profile-fallback",
      username: "FallbackPlayer",
      createdAt: 1,
    },
  };
  localStorage.setItem(PROGRESS_KEY, packVaultSave(JSON.stringify(owned)));
  localStorage.setItem(CLOUD_OWNER_KEY, UID);

  const { useProgress } = await import("../../src/use-progress.js");
  let session = null;
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
  const originalError = console.error;
  console.error = (...args) => {
    if (/not wrapped in act/.test(String(args[0]))) return;
    originalError(...args);
  };
  const originalWarn = console.warn;
  console.warn = () => {};

  const settle = async (ms = 40) => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  };

  try {
    // A Cloud outage while rolling: the Worker answers but cannot verify, so
    // the roll is issued here instead of failing the player.
    installFetch({ fail: { roll: true } });
    await act(async () => {
      root.render(React.createElement(Probe));
    });
    await settle(160);
    const drawing = await act(async () => session.dispatch({ type: "draw" }));
    check(drawing?.ok === true, "a Cloud outage still issues the roll locally");

    const notice = session?.gameSecurity ?? {};
    check(
      notice.status === "warning" &&
        /keeping score on its own/.test(notice.message ?? ""),
      "the player is told the game switched to local play by itself",
    );
    const mark = readCloudOutage();
    check(Boolean(mark), "the outage leaves a mark for this account");
    check(mark?.userId === UID, "the mark records which account hit it");
    check(
      allowsLocalFallback({ code: "game-security-unavailable", status: 503 }) &&
        !allowsLocalFallback({ code: "cloud-restricted", status: 403 }),
      "an outage falls back; a restriction does not",
    );

    // Cloud returns: the same account's status probe clears the pause. The
    // first probe is three seconds away, so the loop just waits it out.
    const calls = installFetch({ fail: {} });
    const probesBefore = calls.length;
    let cleared = false;
    for (let attempt = 0; attempt < 30 && !cleared; attempt++) {
      await settle(200);
      cleared = readCloudOutage() === null;
    }
    check(cleared, "the probe lifts the fallback when Cloud answers again");
    check(
      calls.length > probesBefore,
      "lifting the fallback came from asking the Worker, not from the clock",
    );
    check(
      session?.cloudOutageActive === false,
      "the hook returns to Cloud verification without a manual switch",
    );
    check(
      session?.gameSecurity?.status === "warning" &&
        /Cloud is answering again/.test(session?.gameSecurity?.message ?? ""),
      "the player is told, in text, that Cloud and sync are back",
    );
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    await act(async () => root.unmount());
    host.remove();
    clearCloudOutage();
  }

  const failed = results.filter((entry) => !entry.ok).length;
  assert.equal(failed, 0, `${failed} Cloud fallback check(s) failed`);
}
