import { spawnSync } from "node:child_process";

const branch = process.env.WORKERS_CI_BRANCH?.trim() || undefined;
const isWorkersBuild = /^(1|true)$/i.test(process.env.WORKERS_CI ?? "");
const productionBranch =
  process.env.WORKERS_CI_PRODUCTION_BRANCH?.trim() || "main";

if (isWorkersBuild && !branch) {
  console.error(
    "WORKERS_CI_BRANCH is missing; refusing to deploy an unknown Workers Build branch.",
  );
  process.exit(1);
}

// Production publishes the active Worker. Every other Workers Build gets an
// isolated Preview, avoiding the broken CI match-tag check on non-production branches.
const command = branch && branch !== productionBranch ? "preview" : "deploy";
const args = ["wrangler", command, "--config", "./wrangler.jsonc"];
if (command === "deploy") args.push("--no-autoconfig");

console.log(
  `Running Wrangler ${command}${branch ? ` for branch "${branch}"` : ""}.`,
);

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, args, { stdio: "inherit" });
if (result.error) {
  console.error(`Could not run ${executable}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
