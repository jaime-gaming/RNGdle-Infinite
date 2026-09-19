// Build the game into docs/ so GitHub Pages can deploy straight from the
// main branch ("Deploy from a branch", branch: main, folder: /docs).
// No gh-pages branch and no GitHub Actions workflow are involved: the
// prebuilt site committed to main IS the deployment.
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "vite";

const outDir = path.resolve("docs");
await build({
  base: "/RNGdle-Infinite/",
  build: { outDir, emptyOutDir: true },
});
// Skip Jekyll so the built files (assets/, 404.html, .gz data…) are served
// exactly as they are.
await fs.writeFile(path.join(outDir, ".nojekyll"), "");
console.log(
  `\nBuilt into ${path.relative(process.cwd(), outDir)}/ — commit docs/ to main so Pages picks it up.`,
);
