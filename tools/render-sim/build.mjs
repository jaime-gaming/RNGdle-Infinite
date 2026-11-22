// Bundles a JSX render check, then runs it over the happy-dom surface.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function buildAndRun(entry, { cwd = process.cwd() } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "rngdle-render-"));
  const outfile = path.join(dir, "bundle.cjs");
  const esbuild = path.join(cwd, "node_modules", ".bin", "esbuild");
  const built = spawnSync(
    esbuild,
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--jsx=automatic",
      "--loader:.css=empty",
      "--loader:.mjs=jsx",
      "--loader:.js=jsx",
      "--log-level=error",
      `--outfile=${outfile}`,
    ],
    { cwd, stdio: "inherit" },
  );
  if (built.status !== 0) throw new Error(`Could not bundle ${entry}`);
  const boot = path.join(dir, "boot.mjs");
  writeFileSync(
    boot,
    `import { installDom } from ${JSON.stringify(
      new URL("./boot.mjs", import.meta.url).href,
    )};\ninstallDom();\nconst { run } = await import(${JSON.stringify(
      `file://${outfile}`,
    )});\nawait run();\nprocess.exit(0);\n`,
  );
  const run = spawnSync(process.execPath, [boot], { cwd, stdio: "inherit" });
  rmSync(dir, { recursive: true, force: true });
  return run.status ?? 1;
}
