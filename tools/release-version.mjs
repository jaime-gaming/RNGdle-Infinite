// One source for the internal `fixN` label used by the reload-until-updated
// flow. The build metadata, the writer that bumps the label and the release
// tests all read it from here, so a patch cannot ship with the previous
// version's label by accident.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_READ_FROM = new URL("../package.json", import.meta.url);
const APP_UPDATE = new URL("../src/app-update.js", import.meta.url);
const AGENTS = new URL("../AGENTS.md", import.meta.url);
const APP_UPDATE_SPEC = new URL("../tests/app-update.spec.js", import.meta.url);

export function releaseVersion() {
  return JSON.parse(fs.readFileSync(PACKAGE_READ_FROM, "utf8")).version;
}

// The release line drops a `.0` patch: 0.6.0 is the `v0.6` line and 0.5.2 is
// the `v0.5.2` line, matching the labels already stored in player saves.
export function releaseLine(version = releaseVersion()) {
  const [major, minor, patch] = String(version).split(".");
  return patch && patch !== "0"
    ? `v${major}.${minor}.${patch}`
    : `v${major}.${minor}`;
}

// The starting label for a brand-new release line, before any patch ships.
export function internalVersionLabel(version = releaseVersion()) {
  return `${releaseLine(version)}fix0`;
}

// The label this build actually carries. `src/app-update.js` owns it; every
// other reader (build metadata, tests, this tool) resolves it from there so a
// bump cannot leave one copy behind.
export function currentInternalVersion() {
  const match = /export const APP_INTERNAL_VERSION = "([^"]*)";/.exec(
    fs.readFileSync(APP_UPDATE, "utf8"),
  );
  if (!match?.[1])
    throw new Error("src/app-update.js states no APP_INTERNAL_VERSION.");
  return match[1];
}

function nextFixLabel(internal) {
  const match = /^(v\d+\.\d+(?:\.\d+)?)(?:fix(\d+))?$/.exec(internal);
  if (!match)
    throw new Error(
      `The internal version "${internal}" has no fixN suffix to increment.`,
    );
  return `${match[1]}fix${Number(match[2] ?? 0) + 1}`;
}

// Every place that states the current label, with the exact text it holds.
function statements(fixLabel) {
  return [
    {
      file: APP_UPDATE,
      pattern: /export const APP_INTERNAL_VERSION = "([^"]*)";/,
      value: fixLabel,
    },
    {
      file: AGENTS,
      pattern: /The current label is exactly `([^`]*)`/,
      value: fixLabel,
    },
    {
      file: APP_UPDATE_SPEC,
      pattern: /expect\(APP_INTERNAL_VERSION\)\.toBe\("([^"]*)"\);/,
      value: fixLabel,
    },
  ];
}

export function currentLabels() {
  return statements("").map(({ file, pattern }) => {
    const text = fs.readFileSync(file, "utf8");
    const match = pattern.exec(text);
    return {
      file: path.basename(file.pathname),
      value: match?.[1] ?? "",
      found: Boolean(match),
    };
  });
}

// Fails when the stated labels disagree, which is how a patch ships saying it
// is the previous fix.
export function verifyLabels(version = releaseVersion()) {
  const expected = currentInternalVersion();
  const problems = [];
  const line = releaseLine(version);
  if (
    expected !== line &&
    !new RegExp(`^${line.replace(/\./g, "\\.")}fix[0-9]+$`).test(expected)
  )
    problems.push(
      `The label "${expected}" does not belong to the ${line} release line.`,
    );
  for (const { file, value, found } of currentLabels()) {
    if (!found) problems.push(`${file} states no internal version`);
    else if (value !== expected)
      problems.push(`${file} states "${value}" instead of "${expected}"`);
  }
  return { expected, problems };
}

// Bumps every statement of the label by one fix number and returns the new
// label. Refuses to run when they already disagree, so a half-updated patch is
// visible instead of silently normalised.
export function bumpFixLabel(version = releaseVersion()) {
  const line = releaseLine(version);
  const { expected, problems } = verifyLabels(version);
  if (problems.length)
    throw new Error(
      `Refusing to bump an inconsistent label:\n${problems.join("\n")}`,
    );
  if (!expected.startsWith(line))
    throw new Error(
      `The label "${expected}" does not belong to the ${line} release line.`,
    );
  const next = nextFixLabel(expected);
  for (const { file, pattern, value } of statements(next)) {
    const text = fs.readFileSync(file, "utf8");
    fs.writeFileSync(
      file,
      text.replace(pattern, (line) => line.replace(expected, value)),
    );
  }
  return next;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const mode = process.argv[2] ?? "--check";
  try {
    if (mode === "--check") {
      const { expected, problems } = verifyLabels();
      if (problems.length) {
        console.error(
          `Release labels disagree (expected ${expected}):\n${problems.join("\n")}`,
        );
        process.exit(1);
      }
      console.log(
        `Release labels agree on ${expected} for the ${releaseLine()} line.`,
      );
    } else if (mode === "--bump") {
      console.log(`Internal version is now ${bumpFixLabel()}.`);
    } else {
      console.error("Use --check or --bump.");
      process.exit(2);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
