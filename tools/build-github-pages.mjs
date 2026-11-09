import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";

const githubPagesBase = "/RNGdle-Infinite/";
const outputDirectory = path.resolve("docs");

await build({
  mode: "production",
  base: githubPagesBase,
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
  },
});

await copyFile(
  path.join(outputDirectory, "index.html"),
  path.join(outputDirectory, "404.html"),
);

await writeFile(path.join(outputDirectory, ".nojekyll"), "");

console.log(
  `Built GitHub Pages artifact for ${githubPagesBase} in ${path.relative(process.cwd(), outputDirectory)}/.`,
);
