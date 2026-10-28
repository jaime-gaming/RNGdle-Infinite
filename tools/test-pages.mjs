// Exercise production builds against a strict static server with no SPA rewrite.
// GitHub Pages' 404.html fallback must still boot deep links under both the
// domain root and repository base; local play and legal pages must work without
// cloud sign-in.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "vite";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
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
    // The production config in .env.production is for deploys; smoke this build
    // without Firebase so it also verifies the offline-only fallback.
    await build({ mode: "test", base, build: { outDir, emptyOutDir: true } });
    const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
    assert.ok(html.includes("rngdle-build-id"), "Missing app build identity");
    await fs.access(path.join(outDir, "404.html"));
    const assets = await fs.readdir(path.join(outDir, "assets"));
    assert.ok(assets.some((name) => /^index-.*\.js$/.test(name)));

    const requests = [];
    const fallbacks = new Set();
    const failures = [];
    const server = http.createServer(async (req, res) => {
      const pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://test").pathname,
      );
      requests.push(pathname);
      if (!pathname.startsWith(base)) {
        res.writeHead(404).end();
        return;
      }
      let relative = pathname.slice(base.length) || "index.html";
      if (relative.endsWith("/")) relative += "index.html";
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
        // GitHub Pages serves the SPA from 404.html for real client routes.
        try {
          const body = await fs.readFile(path.join(outDir, "404.html"));
          fallbacks.add(pathname);
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(body);
        } catch {
          res.writeHead(404).end();
        }
      }
    });
    await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));

    const context = await browser.newContext({ reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("requestfailed", (request) => failures.push(request.url()));
      page.on("response", (response) => {
        if (response.status() < 400) return;
        const { pathname } = new URL(response.url());
        if (!fallbacks.has(pathname)) failures.push(response.url());
      });
      await page.addInitScript(
        ({ key, progress }) => {
          if (localStorage.getItem(key) === null)
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
      await expect(page.locator(".header")).toBeVisible();
      await expect(
        page.locator(".rngween-event-panel, .device-link"),
      ).toHaveCount(0);

      // The real roll worker commits a result before the reveal begins. Reload
      // must keep that exact pending number rather than creating another one.
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

      // A direct shelf URL is served through the static 404 fallback, and the
      // local profile route remains useful without Firebase build variables.
      await page.goto(`${url}shop/auras`);
      await expect(
        page.getByRole("heading", { name: "Auras", exact: true }),
      ).toBeVisible();
      assert.ok(fallbacks.has(`${base}shop/auras`));
      await page.goto(`${url}profile`);
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
      assert.ok(fallbacks.has(`${base}profile`));

      await page.goto(`${url}privacy`);
      await expect(
        page.getByRole("heading", { name: "Privacy & Rights" }),
      ).toBeVisible();
      await expect(
        page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
      ).toHaveCount(0);
      assert.ok(fallbacks.has(`${base}privacy`));

      await page.goto(`${url}tos`);
      await expect(
        page.getByRole("heading", { name: "Terms of Service" }),
      ).toBeVisible();
      await expect(
        page.locator("footer").getByRole("link", { name: /privacy|terms/i }),
      ).toHaveCount(0);
      assert.ok(fallbacks.has(`${base}tos`));

      assert.ok(requests.every((request) => request.startsWith(base)));
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      console.log(
        `Pages smoke passed: ${base} — static route fallback, roll worker, local save, profile and no retired UI`,
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
