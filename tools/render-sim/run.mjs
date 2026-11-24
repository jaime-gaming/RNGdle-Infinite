// Render-level checks that need no browser download: npm run test:render
import { installDom } from "./boot.mjs";
import { buildAndRun } from "./build.mjs";

installDom();
const suites = [
  new URL("./app-shell.mjs", import.meta.url).pathname,
  new URL("./offline-overlay.mjs", import.meta.url).pathname,
  new URL("./profile-privacy.mjs", import.meta.url).pathname,
  new URL("./cloud-unavailable.mjs", import.meta.url).pathname,
];

let failed = false;
for (const suite of suites) {
  console.log(`\n### ${suite.split("/").pop()}`);
  if (buildAndRun(suite) !== 0) failed = true;
}
if (failed) process.exit(1);
console.log("\nRender checks passed.");
