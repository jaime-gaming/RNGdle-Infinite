import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Give each built app a unique identity and publish the same identity in both
// index.html and version.json. The Settings update loop compares these values,
// so it can tell whether a cache-busted reload actually reached the new build.
function appBuildVersion() {
  const { version } = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  );
  const internalVersion = "RNGdle-Infinitev0.5.2fix4";
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
      return html.replace(
        "</head>",
        `  ${buildTag}\n  ${internalTag}\n  </head>`,
      );
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

export default defineConfig({
  plugins: [react(), appBuildVersion()],
  server: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
});
