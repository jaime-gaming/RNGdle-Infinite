// Build the production app and exercise Cloudflare Pages locally with Wrangler.
// This checks the artifact and routing rules; it does not validate DNS or a live deploy.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "vite";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { LOCAL_PLAY_KEY } from "../src/local-play.js";

const outDir = path.resolve(".cache/cloudflare-pages-smoke");
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
for (const asset of [
  "_headers",
  "_redirects",
  "version.json",
  "sw.js",
  "manifest.webmanifest",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
])
  await fs.access(path.join(outDir, asset));
const bundles = await fs.readdir(path.join(outDir, "assets"));
assert.ok(bundles.some((name) => /^index-.*\.js$/.test(name)));

const portProbe = net.createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const pagesServer = spawn(
  process.execPath,
  [
    path.resolve("node_modules/wrangler/bin/wrangler.js"),
    "pages",
    "dev",
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
pagesServer.stdout.on("data", (data) => (serverLogs += data));
pagesServer.stderr.on("data", (data) => (serverLogs += data));
const serverClosed = new Promise((resolve) =>
  pagesServer.once("close", resolve),
);
const origin = `http://127.0.0.1:${port}`;
const sendSignal = (signal) => {
  try {
    if (process.platform !== "win32" && pagesServer.pid)
      process.kill(-pagesServer.pid, signal);
    else pagesServer.kill(signal);
  } catch {
    // The server may already have exited after a startup failure.
  }
};

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (pagesServer.exitCode !== null)
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

  // These are the direct URLs most likely to be broken by a missing SPA rewrite.
  for (const route of [
    "/shop/auras",
    "/settings/save-recovery",
    "/profile/LuckyOtter41",
  ]) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, `${route} must rewrite to index.html`);
    assert.ok((await response.text()).includes("rngdle-build-id"));
    assert.match(response.headers.get("cache-control") ?? "", /no-cache/);
  }
  const versionResponse = await fetch(`${origin}/version.json`);
  assert.equal(versionResponse.status, 200);
  assert.match(versionResponse.headers.get("cache-control") ?? "", /no-store/);
  const bundle = bundles.find((name) => /^index-.*\.js$/.test(name));
  const bundleResponse = await fetch(`${origin}/assets/${bundle}`);
  const bundleCache = bundleResponse.headers.get("cache-control") ?? "";
  assert.equal(bundleResponse.status, 200);
  assert.match(bundleCache, /immutable/);
  assert.doesNotMatch(bundleCache, /no-cache/);

  browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
        }
      : {},
  );
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    const errors = [];
    const failures = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => failures.push(request.url()));
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
            id: "pages-test",
            username: "PagesTester",
            createdAt: Date.now(),
          },
        },
      },
    );

    const url = `${origin}/`;
    const saved = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        PROGRESS_KEY,
      );
    const visit = async (route) => {
      const response = await page.goto(`${url}${route.replace(/^\/+/, "")}`);
      assert.equal(response?.status(), 200, `Direct route failed: /${route}`);
    };

    await visit("");
    await expect(
      page.getByRole("button", { name: "GENERATE", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".header")).toBeVisible();
    await expect(
      page.locator(".rngween-event-panel, .device-link"),
    ).toHaveCount(0);

    // A committed roll must survive a direct refresh on the Worker assets artifact.
    await page.getByRole("button", { name: "GENERATE", exact: true }).click();
    await expect
      .poll(async () => (await saved())?.pendingRoll?.number)
      .toBeGreaterThanOrEqual(0);
    const committed = (await saved()).pendingRoll.number;
    await page.reload();
    await expect
      .poll(async () => (await saved())?.pendingRoll?.number)
      .toBe(committed);
    assert.equal((await saved()).pendingRoll.number, committed);

    await visit("shop/auras");
    await expect(
      page.getByRole("heading", { name: "Auras", exact: true }),
    ).toBeVisible();

    await visit("profile");
    await expect(page.locator(".cloud-account")).toContainText(
      "Online sign-in isn’t available here.",
    );
    await expect(
      page.getByRole("heading", { name: "Your profile, PagesTester" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Privacy & Rights" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Terms of Service" }),
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
    await expect(
      page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
    ).toHaveCount(0);

    await visit("tos");
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible();
    await expect(
      page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
    ).toHaveCount(0);

    assert.ok(requests.some((request) => /roll\.worker.*\.js$/.test(request)));
    assert.ok(requests.every((request) => request.startsWith("/")));
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    console.log(
      "Cloudflare Pages smoke passed: Wrangler runtime, root assets, SPA routes, roll worker, local save, profile, save recovery and legal pages",
    );
  } finally {
    await context.close();
  }
} finally {
  await browser?.close();
  sendSignal("SIGTERM");
  await Promise.race([serverClosed, delay(3000)]);
  sendSignal("SIGKILL");
  await Promise.race([serverClosed, delay(1500)]);
}
