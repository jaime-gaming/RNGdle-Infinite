import { spawnSync } from "node:child_process";

function run(executable, args) {
  const result = spawnSync(executable, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run ${executable}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const branchResult = spawnSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
});
const branch =
  process.env.CF_PAGES_BRANCH?.trim() || branchResult.stdout?.trim() || "";
const project =
  process.env.CLOUDFLARE_PAGES_PROJECT?.trim() || "rngdle-infinite";
const productionBranch =
  process.env.CF_PAGES_PRODUCTION_BRANCH?.trim() || "main";
const allowProduction = /^(1|true)$/i.test(
  process.env.CF_PAGES_ALLOW_PRODUCTION ?? "",
);

if (branchResult.error || !branch) {
  console.error("Could not determine the Pages branch; refusing to deploy.");
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
  console.error(`Invalid Cloudflare Pages project name: ${project}`);
  process.exit(1);
}
if (branch === productionBranch && !allowProduction) {
  console.error(
    `Refusing to deploy production branch "${productionBranch}" without CF_PAGES_ALLOW_PRODUCTION=true.`,
  );
  process.exit(1);
}

console.log(
  `Building Cloudflare Pages project "${project}" for branch "${branch}".`,
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
if (run(npm, ["run", "build"]) !== 0) process.exit(1);

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "wrangler",
  "pages",
  "deploy",
  "dist",
  "--project-name",
  project,
  "--branch",
  branch,
];
process.exit(run(executable, args));
