import { copyFile, readdir, writeFile } from "node:fs/promises";
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

// `emptyOutDir` clears docs/, which also holds the published Cloud security
// notes. They are not part of the Vite output, so they are carried over.
const sourceDocumentation = path.resolve("docs-source");
for (const name of await readdir(sourceDocumentation).catch(() => []))
  if (name.endsWith(".md"))
    await copyFile(
      path.join(sourceDocumentation, name),
      path.join(outputDirectory, name),
    );

await copyFile(
  path.join(outputDirectory, "index.html"),
  path.join(outputDirectory, "404.html"),
);

await writeFile(path.join(outputDirectory, ".nojekyll"), "");

console.log(
  `Built GitHub Pages artifact for ${githubPagesBase} in ${path.relative(process.cwd(), outputDirectory)}/.`,
);
