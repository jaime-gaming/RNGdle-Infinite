// Build and publish the app to Cloudflare Workers.
//
//   npm run deploy:worker                 # preview/any branch
//   npm run deploy:worker -- --dry-run    # build and validate, upload nothing
//   CF_ALLOW_PRODUCTION=true npm run deploy:worker   # from main
//
// The Worker is assets-only: `wrangler.jsonc` serves `dist/` and claims
// rngdle-infinite.jaime-gaming.com as a custom domain on every deploy.
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
  process.env.CF_WORKERS_BRANCH?.trim() || branchResult.stdout?.trim() || "";
const productionBranch =
  process.env.CF_WORKERS_PRODUCTION_BRANCH?.trim() || "main";
const allowProduction = /^(1|true)$/i.test(
  process.env.CF_ALLOW_PRODUCTION ?? "",
);
const dryRun = process.argv.includes("--dry-run");

if (branchResult.error || !branch) {
  console.error("Could not determine the current branch; refusing to deploy.");
  process.exit(1);
}
if (branch === productionBranch && !allowProduction && !dryRun) {
  console.error(
    `Refusing to deploy the production branch "${productionBranch}" without CF_ALLOW_PRODUCTION=true.`,
  );
  process.exit(1);
}

console.log(
  `Building Cloudflare Worker "rngdle-infinite" from branch "${branch}"${
    dryRun ? " (dry run: nothing is uploaded)" : ""
  }.`,
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
if (run(npm, ["run", "build"]) !== 0) process.exit(1);

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["wrangler", "deploy"];
if (dryRun) args.push("--dry-run", "--outdir", ".cache/worker-deploy");
if (run(executable, args) !== 0) process.exit(1);

if (!dryRun)
  console.log(
    [
      "",
      "Deployed. The custom domain is claimed by the Worker on every deploy.",
      "Check the live host, then confirm in the Cloudflare dashboard that",
      "rngdle-infinite.jaime-gaming.com is attached to the Worker and not to a",
      "Cloudflare Pages project. See DEPLOYMENT.md.",
    ].join("\n"),
  );
