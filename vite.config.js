import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

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
export default defineConfig({
  plugins: [react(), spaFallback()],
  server: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
});
