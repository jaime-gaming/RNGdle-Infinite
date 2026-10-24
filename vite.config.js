import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { createSyncRelay } from "./tools/sync-relay.mjs";
import { sandboxClock } from "./tools/sandbox-clock.mjs";
import { sandboxProgress } from "./tools/sandbox-progress.mjs";

// Real routes (/shop, /badges…) are client-side, and static hosts do not rewrite
// unknown paths. GitHub Pages serves 404.html for them, so ship the app there
// too: a direct link or reload lands on the right page instead of an error.
function spaFallback() {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const outDir = this.environment?.config?.build?.outDir ?? "dist";
      const index = path.resolve(outDir, "index.html");
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.resolve(outDir, "404.html"));
        // A real directory entry gives World a 200 response on GitHub Pages,
        // not just the global 404 SPA fallback. Built asset URLs share the base.
        const worldDir = path.resolve(outDir, "rngween-world");
        fs.mkdirSync(worldDir, { recursive: true });
        fs.copyFileSync(index, path.join(worldDir, "index.html"));
      }
    },
  };
}

// Give each built app a unique identity and publish the same identity in both
// index.html and version.json. The Settings update loop compares these values,
// so it can tell whether a cache-busted reload actually reached the new build.
function appBuildVersion() {
  const { version } = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  );
  const internalVersion = "RNGdle-Infinitev0.5.1fix6";
  const buildId = `${version}-${Date.now().toString(36)}-${process.pid.toString(36)}`;
  const payload = JSON.stringify({ version, buildId, internalVersion });
  let outDir = path.resolve("dist");

  return {
    name: "app-build-version",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      const buildTag = `<meta name="rngdle-build-id" content="${buildId}" />`;
      const internalTag = `<meta name="rngdle-internal-version" content="${internalVersion}" />`;
      return html.replace("</head>", `  ${buildTag}\n  ${internalTag}\n  </head>`);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname = "";
        try {
          pathname = new URL(req.url ?? "/", "http://vite.local").pathname;
        } catch {
          return next();
        }
        if (!pathname.endsWith("/version.json")) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.end(payload);
      });
    },
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.resolve(outDir, "version.json"), `${payload}\n`);
    },
  };
}

// Live device linking rides the dev server itself: /__sync/* is handled by a
// memory-only relay, so two devices (or two browsers) share one account with
// no database and no second process. A dev relay that forgets rooms on restart
// is the right default — it leaves nothing behind on disk, and a durable relay
// is what `npm run relay` stands up for production.
function deviceSync() {
  let relay = null;
  const attach = (server) => {
    relay = createSyncRelay({ storeDir: null });
    server.middlewares.use((req, res, next) => relay.handle(req, res, next));
  };
  return {
    name: "device-sync-relay",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    sandboxClock(
      process.env.RNGDLE_SANDBOX_DATE ??
        (["rngween-preview", "rngween-unlocked"].includes(mode)
          ? "2026-10-26T12:00:00Z"
          : undefined),
    ),
    sandboxProgress(mode === "rngween-unlocked"),
    react(),
    appBuildVersion(),
    spaFallback(),
    deviceSync(),
  ],
  server: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
}));
