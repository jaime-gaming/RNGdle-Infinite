import { mockOperationalStatus } from "../tests/helpers/status.js";
import assert from "node:assert/strict";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "vite";
import { LOCAL_PLAY_KEY } from "../src/local-play.js";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";

const base = "/RNGdle-Infinite/";
const outputDirectory = path.resolve(".cache/github-pages-smoke");
await build({
  mode: "test",
  base,
  build: { outDir: outputDirectory, emptyOutDir: true },
});
await copyFile(
  path.join(outputDirectory, "index.html"),
  path.join(outputDirectory, "404.html"),
);
await writeFile(path.join(outputDirectory, ".nojekyll"), "");

const html = await readFile(path.join(outputDirectory, "index.html"), "utf8");
assert.ok(html.includes('name="rngdle-build-id"'));
assert.match(html, /<html lang="en">/);
assert.match(html, /(?:src|href)="\/RNGdle-Infinite\/assets\//);
assert.equal(
  await readFile(path.join(outputDirectory, "404.html"), "utf8"),
  html,
);
await stat(path.join(outputDirectory, ".nojekyll"));
for (const name of [
  "version.json",
  "sw.js",
  "manifest.webmanifest",
  "favicon.svg",
  "apple-touch-icon.png",
])
  await stat(path.join(outputDirectory, name));

const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);
const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://github-pages.local").pathname,
    );
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname === base.slice(0, -1)) {
    response.writeHead(301, { Location: base }).end();
    return;
  }
  if (!pathname.startsWith(base)) {
    response.writeHead(404).end();
    return;
  }

  const relative = pathname.slice(base.length) || "index.html";
  let file = path.resolve(outputDirectory, relative);
  if (
    file !== outputDirectory &&
    !file.startsWith(`${outputDirectory}${path.sep}`)
  ) {
    response.writeHead(400).end();
    return;
  }

  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type":
        mime.get(path.extname(file)) ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(await readFile(path.join(outputDirectory, "404.html")));
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
        }
      : {},
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-11-22T12:00:00Z") });
  await mockOperationalStatus(page);
  const pageErrors = [];
  const failedRequests = [];
  const appAssetRequests = [];
  const fallbackPath = `${base}settings/save-recovery`;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === origin &&
      /\.(?:js|css|svg|woff2?|json)$/.test(url.pathname)
    )
      appAssetRequests.push(url.pathname);
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      new URL(response.url()).pathname !== fallbackPath
    )
      failedRequests.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(
    ({ progressKey, localPlayKey, progress }) => {
      localStorage.setItem(localPlayKey, "1");
      if (localStorage.getItem(progressKey) === null)
        localStorage.setItem(progressKey, JSON.stringify(progress));
    },
    {
      progressKey: PROGRESS_KEY,
      localPlayKey: LOCAL_PLAY_KEY,
      progress: {
        ...emptyProgress(),
        profile: {
          id: "github-pages-smoke",
          username: "PagesTester",
          createdAt: Date.now(),
        },
      },
    },
  );

  const homeResponse = await page.goto(`${origin}${base}`);
  assert.equal(homeResponse?.status(), 200);
  await expect(page.locator(".header")).toBeVisible();

  await expect(page.locator(".mirror-notice")).toBeVisible();
  await expect(page.locator(".mirror-notice a").first()).toHaveAttribute(
    "href",
    "https://rngdle-infinite.jaime-gaming.com/",
  );
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();

  const directRoute = await page.goto(`${origin}${fallbackPath}`);
  assert.equal(directRoute?.status(), 404);
  await expect(
    page.getByRole("region", { name: "Restore save" }),
  ).toBeVisible();
  assert.ok(
    appAssetRequests.some((pathname) => pathname.startsWith(`${base}assets/`)),
    "App JS/CSS must load beneath the repository base path",
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  await page
    .getByRole("button", { name: "Shutdown & moving your save" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("00:00 Madrid");
  await page
    .getByRole("button", { name: "Close shutdown information" })
    .click();
  await page.clock.setSystemTime(new Date("2026-11-30T23:00:00Z"));
  await expect(
    page.getByText("This version is now closed", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("This version is now closed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".header")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download local backup", exact: true }),
  ).toBeVisible();
  const storedBackup = await page.evaluate(
    (key) => localStorage.getItem(key),
    PROGRESS_KEY,
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download local backup", exact: true })
    .click();
  const backupDownload = await downloadPromise;
  assert.equal(
    await readFile(await backupDownload.path(), "utf8"),
    storedBackup,
  );
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(
  "GitHub Pages smoke passed: base-path assets and direct SPA routes",
);
