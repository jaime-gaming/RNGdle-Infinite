import { mockOperationalStatus } from "../tests/helpers/status.js";
// Build the production app and exercise the Cloudflare Workers deployment
// locally with Wrangler. This checks the artifact, the static-asset routing and
// the SPA fallback that the custom domain will serve; it does not validate DNS,
// Cloudflare account settings, Firebase authorized domains or a live deploy.
//
//   npm run test:worker
//
// The browser half needs a Chromium binary (Playwright). When none is
// installed the HTTP checks still run and the browser half is reported as
// skipped, so the routing artifact can be verified anywhere.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "vite";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { unpackVaultSave } from "../src/save-codec.js";
import { LOCAL_PLAY_KEY } from "../src/local-play.js";

const outDir = path.resolve(".cache/cloudflare-worker-smoke");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await build({ mode: "test", build: { outDir, emptyOutDir: true } });
const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
const headers = await fs.readFile(path.join(outDir, "_headers"), "utf8");
assert.ok(html.includes("rngdle-build-id"), "Missing app build identity");
assert.ok(
  html.includes("https://rngdle-infinite.jaime-gaming.com/"),
  "The production page metadata does not use the custom domain",
);
// The Worker serves SPA fallback via assets.not_found_handling, so a
// _redirects rewrite would loop (/index.html matches /* again) and is banned.
await assert.rejects(fs.access(path.join(outDir, "_redirects")), {
  code: "ENOENT",
});
assert.match(headers, /\n\/\s*\n\s*Cache-Control: no-cache/);
assert.match(headers, /\/shop\*\s*\n\s*Cache-Control: no-cache/);
assert.match(headers, /\/profile\*\s*\n\s*Cache-Control: no-cache/);
assert.match(headers, /\/version\.json\s*\n\s*Cache-Control: no-store/);
assert.match(
  headers,
  /\/assets\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/,
);
assert.match(headers, /\/index\.html\s*\n\s*Cache-Control: no-cache/);
await assert.rejects(fs.access(path.join(outDir, "404.html")), {
  code: "ENOENT",
});
// Only files that actually ship as public assets: Wrangler consumes _headers
// and _redirects itself, so they are not listed here.
for (const asset of [
  "version.json",
  "sw.js",
  "manifest.webmanifest",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "robots.txt",
])
  await fs.access(path.join(outDir, asset));
const bundles = await fs.readdir(path.join(outDir, "assets"));
assert.ok(bundles.some((name) => /^index-.*\.js$/.test(name)));

const portProbe = net.createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const workerServer = spawn(
  process.execPath,
  [
    path.resolve("node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--assets",
    outDir,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--log-level",
    "error",
    "--show-interactive-dev-session",
    "false",
  ],
  {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverLogs = "";
workerServer.stdout.on("data", (data) => (serverLogs += data));
workerServer.stderr.on("data", (data) => (serverLogs += data));
const serverClosed = new Promise((resolve) =>
  workerServer.once("close", resolve),
);
const origin = `http://127.0.0.1:${port}`;
const sendSignal = (signal) => {
  try {
    if (process.platform !== "win32" && workerServer.pid)
      process.kill(-workerServer.pid, signal);
    else workerServer.kill(signal);
  } catch {
    // The server may already have exited after a startup failure.
  }
};

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (workerServer.exitCode !== null)
      throw new Error(`Wrangler dev failed to start:\n${serverLogs}`);
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The local Worker runtime is still binding its port.
    }
    await delay(250);
  }
  assert.ok(ready, `Wrangler dev did not become ready:\n${serverLogs}`);

  const rootResponse = await fetch(`${origin}/`);
  const rootHtml = await rootResponse.text();
  assert.equal(rootResponse.status, 200);
  assert.ok(rootHtml.includes("rngdle-build-id"));
  assert.match(rootResponse.headers.get("cache-control") ?? "", /no-cache/);
  assert.equal(rootResponse.headers.get("x-content-type-options"), "nosniff");

  // These are the direct URLs most likely to be broken by a missing SPA
  // fallback: they must all answer with the app shell, never a 404.
  for (const route of [
    "/shop/auras",
    "/settings/save-recovery",
    "/profile/LuckyOtter41",
  ]) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, `${route} must fall back to index.html`);
    assert.ok((await response.text()).includes("rngdle-build-id"));
    assert.match(response.headers.get("cache-control") ?? "", /no-cache/);
  }
  const versionResponse = await fetch(`${origin}/version.json`);
  assert.equal(versionResponse.status, 200);
  assert.match(versionResponse.headers.get("cache-control") ?? "", /no-store/);
  const version = await versionResponse.json();
  assert.ok(version.buildId, "version.json has no build identifier");
  assert.ok(version.internalVersion, "version.json has no internal version");
  const bundle = bundles.find((name) => /^index-.*\.js$/.test(name));
  const bundleResponse = await fetch(`${origin}/assets/${bundle}`);
  const bundleCache = bundleResponse.headers.get("cache-control") ?? "";
  assert.equal(bundleResponse.status, 200);
  assert.match(bundleCache, /immutable/);
  assert.doesNotMatch(bundleCache, /no-cache/);
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type") ?? "", /manifest/);

  try {
    browser = await chromium.launch(
      process.env.CHROMIUM_PATH
        ? {
            executablePath: process.env.CHROMIUM_PATH,
            args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
          }
        : {},
    );
  } catch (error) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(String(error)))
      throw error;
    console.warn(
      "Worker smoke: no Chromium available, skipping the browser checks.\n" +
        "Install it with `npx playwright install chromium` to run them.",
    );
  }

  if (browser) {
    const context = await browser.newContext({
      reducedMotion: "no-preference",
    });
    try {
      const page = await context.newPage();
      await mockOperationalStatus(page);
      const errors = [];
      const failures = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("requestfailed", (request) => {
        // Direct SPA navigation tears down the previous document's worker and
        // status fetch. Only navigation cancellations are expected here;
        // real network failures and HTTP errors still fail the smoke test.
        if (request.failure()?.errorText !== "net::ERR_ABORTED")
          failures.push(`${request.failure()?.errorText}: ${request.url()}`);
      });
      page.on("request", (request) => {
        const requested = new URL(request.url());
        if (requested.origin === origin) requests.push(requested.pathname);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) failures.push(response.url());
      });
      await page.addInitScript(
        ({ key, localPlayKey, progress }) => {
          localStorage.setItem(localPlayKey, "1");
          if (localStorage.getItem(key) === null)
            localStorage.setItem(key, JSON.stringify(progress));
        },
        {
          key: PROGRESS_KEY,
          localPlayKey: LOCAL_PLAY_KEY,
          progress: {
            ...emptyProgress(),
            profile: {
              id: "worker-test",
              username: "WorkerTester",
              createdAt: Date.now(),
            },
          },
        },
      );

      const url = `${origin}/`;
      const saved = async () => {
        const stored = await page.evaluate(
          (key) => localStorage.getItem(key),
          PROGRESS_KEY,
        );
        return JSON.parse(unpackVaultSave(stored));
      };
      const visit = async (route) => {
        const response = await page.goto(`${url}${route.replace(/^\/+/, "")}`);
        assert.equal(response?.status(), 200, `Direct route failed: /${route}`);
      };

      await visit("");
      await expect(
        page.getByRole("button", { name: "GENERATE", exact: true }),
      ).toBeEnabled();
      await expect(page.locator(".header")).toBeVisible();

      // A committed roll must survive a direct refresh on the Worker artifact.
      await page.getByRole("button", { name: "GENERATE", exact: true }).click();
      await expect
        .poll(async () => (await saved())?.pendingRoll?.number)
        .toBeGreaterThanOrEqual(0);
      const committed = (await saved()).pendingRoll.number;
      await page.reload();
      await expect
        .poll(async () => (await saved())?.pendingRoll?.number)
        .toBe(committed);

      await visit("shop/auras");
      await expect(
        page.getByRole("heading", { name: "Auras", exact: true }),
      ).toBeVisible();

      await visit("settings/cloud-account");
      await expect(page.locator(".cloud-account")).toContainText(
        "Online sign-in isn’t available here.",
      );
      await visit("profile");
      await expect(page.locator(".cloud-account")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Your profile, WorkerTester" }),
      ).toBeVisible();

      await visit("settings/save-recovery");
      await expect(
        page.getByRole("heading", { name: "Restore save" }),
      ).toBeVisible();
      await expect(page.getByTestId("settings-recovery")).toBeVisible();

      await visit("privacy");
      await expect(
        page.getByRole("heading", { name: "Privacy & Rights" }),
      ).toBeVisible();

      await visit("tos");
      await expect(
        page.getByRole("heading", { name: "Terms of Service" }),
      ).toBeVisible();

      assert.ok(
        requests.some((request) => /roll\.worker.*\.js$/.test(request)),
      );
      assert.ok(requests.every((request) => request.startsWith("/")));
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      console.log(
        "Cloudflare Worker browser smoke passed: SPA routes, roll worker, local save, profile, save recovery and legal pages",
      );
    } finally {
      await context.close();
    }
  }

  console.log(
    "Cloudflare Worker smoke passed: assets, headers, SPA fallback, version manifest",
  );
} finally {
  await browser?.close();
  sendSignal("SIGTERM");
  await Promise.race([serverClosed, delay(3000)]);
  sendSignal("SIGKILL");
  await Promise.race([serverClosed, delay(1500)]);
}
