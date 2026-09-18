// Publish the production build to the "gh-pages" branch so GitHub Pages can
// serve it with "Deploy from a branch" — no GitHub Actions workflow involved.
//
// Usage:
//   npm run deploy                  # https://<owner>.github.io/<repository>/
//   npm run deploy -- --base=/      # root hosting or a custom domain
//
// The script builds with Vite, stages dist/ on the gh-pages branch through a
// temporary git worktree in ignored .cache/, commits, and pushes. The gh-pages
// branch contains build output only; the source branch never changes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const BRANCH = "gh-pages";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = path.join(repoRoot, "dist");
const worktreeDir = path.join(repoRoot, ".cache", "pages-deploy");

function git(args, { cwd = repoRoot, capture = false } = {}) {
  const result = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  return capture ? result.trim() : "";
}

function gitOk(args, options = {}) {
  try {
    return git(args, options);
  } catch {
    return null;
  }
}

function gitConfig(key, fallback) {
  try {
    return execFileSync("git", ["config", key], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

// Resolve the Pages base path: explicit --base wins; otherwise derive
// /<repository>/ from the origin remote, like project Pages URLs.
const baseArg = process.argv.slice(2).find((arg) => arg.startsWith("--base="));
let base = baseArg?.slice("--base=".length);
if (!base) {
  const origin = git(["remote", "get-url", "origin"], { capture: true });
  const match = origin.match(/[:/]([^/:]+?)(?:\.git)?\/?$/);
  if (!match) {
    console.error(`Cannot derive the repository name from origin: ${origin}`);
    console.error("Pass an explicit path, e.g.: npm run deploy -- --base=/RNGdle-Infinite/");
    process.exit(1);
  }
  base = `/${match[1]}/`;
}

console.log(`Building with base ${base} ...`);
await build({ base, root: repoRoot, build: { outDir: distDir, emptyOutDir: true } });
if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("Build did not produce dist/index.html");
  process.exit(1);
}

// Refresh the temporary worktree on the gh-pages branch.
fs.rmSync(worktreeDir, { recursive: true, force: true });
git(["worktree", "prune"]);
// git fetch origin <branch> fails when the branch does not exist remotely.
// Resolve FETCH_HEAD to a SHA in this worktree: FETCH_HEAD itself is
// per-worktree and unusable from the temporary linked worktree below.
const hasRemoteBranch = gitOk(["fetch", "origin", BRANCH]) !== null;
const remoteSha = hasRemoteBranch
  ? gitOk(["rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"], { capture: true })
  : null;
if (hasRemoteBranch && !remoteSha) {
  console.error(`Fetched ${BRANCH} but could not resolve it to a commit.`);
  process.exit(1);
}
git(["worktree", "add", "--detach", worktreeDir, hasRemoteBranch ? remoteSha : "HEAD"]);

try {
  const sourceSha = git(["rev-parse", "--short", "HEAD"], { capture: true });
  if (hasRemoteBranch) {
    git(["checkout", "-B", BRANCH, remoteSha], { cwd: worktreeDir });
  } else {
    // Drop any stale local branch so the orphan checkout can take the name.
    gitOk(["branch", "-D", BRANCH]);
    git(["switch", "--orphan", BRANCH], { cwd: worktreeDir });
  }
  // Clear previous build output so removed files disappear from the branch.
  // -f is required: an orphan checkout leaves every source file staged.
  gitOk(["rm", "-rfq", "."], { cwd: worktreeDir });
  fs.cpSync(distDir, worktreeDir, { recursive: true });
  // Keep Pages from running Jekyll over the built assets.
  fs.writeFileSync(path.join(worktreeDir, ".nojekyll"), "");

  git(["add", "-A"], { cwd: worktreeDir });
  const status = git(["status", "--porcelain"], { cwd: worktreeDir, capture: true });
  if (status) {
    git(
      [
        "-c", `user.name=${gitConfig("user.name", "RNGdle Infinite Deploy")}`,
        "-c", `user.email=${gitConfig("user.email", "deploy@users.noreply.github.com")}`,
        "commit", "-m", `Deploy ${sourceSha}: built with base ${base}`,
      ],
      { cwd: worktreeDir },
    );
  } else {
    console.log("Build output is unchanged since the last deploy.");
  }
  git(["push", "origin", BRANCH]);
  console.log(`Published ${hasRemoteBranch ? "update to" : "new"} ${BRANCH} from ${sourceSha}.`);
  console.log("GitHub Pages (Deploy from a branch) serves it after the build finishes.");
} finally {
  gitOk(["worktree", "remove", "--force", worktreeDir]);
}
