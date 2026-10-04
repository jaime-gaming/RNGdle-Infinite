import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { createSyncRelay } from "./tools/sync-relay.mjs";

// Real routes (/shop, /badges…) are client-side, and static hosts do not rewrite
// unknown paths. GitHub Pages serves 404.html for them, so ship the app there
// too: a direct link or reload lands on the right page instead of an error.
function spaFallback() {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const outDir = this.environment?.config?.build?.outDir ?? "dist";
      const index = path.resolve(outDir, "index.html");
      if (fs.existsSync(index))
        fs.copyFileSync(index, path.resolve(outDir, "404.html"));
    },
  };
}

// Live device linking rides the dev server itself: /__sync/* is handled by the
// memory-only relay, so two devices (or two browsers) share one account with
// no database and no second process. Production can run the same relay from
// `npm run relay` and point at it with ?relay=<origin>.
function deviceSync() {
  let relay = null;
  const attach = (server) => {
    relay = createSyncRelay();
    server.middlewares.use((req, res, next) => relay.handle(req, res, next));
  };
  return {
    name: "device-sync-relay",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  plugins: [react(), spaFallback(), deviceSync()],
  server: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
});
