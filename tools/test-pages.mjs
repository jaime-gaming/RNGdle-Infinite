// Test real production output against a strict static server (no SPA fallback).
// Both root/custom-domain and repository-subpath hosting must work, including
// worker fetches, local emoji, fonts, hash navigation and browser-local saves.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "vite";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? {
        executablePath: process.env.CHROMIUM_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
      }
    : {},
);
try {
  for (const base of ["/", "/RNGdle-Infinite/"]) {
    const outDir = path.resolve(".cache/pages-smoke");
    await build({ base, build: { outDir, emptyOutDir: true } });
    const requests = [];
    const server = http.createServer(async (req, res) => {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://test").pathname,
      );
      requests.push(pathname);
      if (!pathname.startsWith(base)) {
        res.writeHead(404).end();
        return;
      }
      const relative = pathname.slice(base.length) || "index.html";
      const filename = path.resolve(outDir, relative);
      if (!filename.startsWith(outDir + path.sep)) {
        res.writeHead(404).end();
        return;
      }
      try {
        const body = await fs.readFile(filename);
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(filename)] ?? "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
    const context = await browser.newContext({ reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const errors = [],
        failures = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400) failures.push(response.url());
      });
      page.on("requestfailed", (request) => failures.push(request.url()));
      await page.addInitScript(
        ({ key, progress }) => {
          if (!localStorage.getItem(key))
            localStorage.setItem(key, JSON.stringify(progress));
        },
        {
          key: PROGRESS_KEY,
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
      const url = `http://127.0.0.1:${server.address().port}${base}`;
      const saved = () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)),
          PROGRESS_KEY,
        );
      await page.goto(url);
      await expect(
        page.getByRole("button", { name: "GENERATE", exact: true }),
      ).toBeEnabled();
      // Vite must rewrite HTML assets as well as the worker and its data URLs.
      const favicon = await page
        .locator('link[rel="icon"]')
        .getAttribute("href");
      assert.equal(favicon, `${base}favicon.svg`);
      assert.equal(
        (await page.request.get(new URL(favicon, url).href)).status(),
        200,
      );
      await page.getByRole("button", { name: "GENERATE", exact: true }).click();
      await expect(page.locator(".roll-experience")).toHaveAttribute(
        "data-settled",
        "true",
      );
      const before = await saved();
      assert.equal(
        before.history.filter((row) => row.type === "roll").length,
        1,
      );
      assert.ok(before.balance >= 0);
      assert.equal(
        before.balance,
        before.history.find((row) => row.type === "roll").ep,
      );
      await expect
        .poll(() => page.locator(".emoji img").count())
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          page
            .locator(".emoji img")
            .evaluateAll((images) =>
              images.every((img) => img.complete && img.naturalWidth > 0),
            ),
        )
        .toBe(true);
      for (const src of await page
        .locator(".emoji img")
        .evaluateAll((images) =>
          images.map((img) => img.getAttribute("src")),
        )) {
        assert.ok(src.startsWith(`${base}emoji/`), src);
      }
      for (const [section, title] of Object.entries({
        shop: "The EP shop",
        badges: "The badge collection",
        history: "Your activity",
      })) {
        // A direct hash link or reload must load without any server rewrites.
        await page.goto(`${url}#${section}`);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        assert.equal(new URL(page.url()).hash, `#${section}`);
        assert.equal((await saved()).balance, before.balance);
      }
      await page.goto(url);
      await expect(page.locator(".generate")).toBeDisabled();
      assert.equal(
        (await saved()).history.filter((row) => row.type === "roll").length,
        1,
      );
      // These are server-side request logs, so worker requests are included.
      for (const pattern of [
        /\/assets\/roll\.worker-.*\.js$/,
        /\/data\/ep-table\..*\.json$/,
        /\/data\/badge-table\..*\.json$/,
        /\/assets\/.*\.woff2$/,
        /\/emoji\/.*\.svg$/,
      ]) {
        assert.ok(
          requests.some((request) => pattern.test(request)),
          `Missing request: ${pattern}`,
        );
      }
      assert.ok(
        requests.every((request) => request.startsWith(base)),
        "Asset escaped the deployment base",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      console.log(
        `Pages smoke passed: ${base} — real RNG, worker/data, emoji/fonts, hash routes and saved reload`,
      );
    } finally {
      await context.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
} finally {
  await browser.close();
}
