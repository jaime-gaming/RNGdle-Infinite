// Boots the whole app shell in a DOM. main.jsx mounts itself on #root, so this
// runs exactly what production runs: an undefined identifier inside a hook (the
// `tabActive` crash) fails here even though the bundle itself compiles.
import assert from "node:assert/strict";

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
}

export async function run() {
  // main.jsx mounts itself, so this run is not driven by act().
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  const host = document.createElement("div");
  host.id = "root";
  document.body.append(host);

  const failures = [];
  const originalError = console.error;
  console.error = (...args) => {
    failures.push(args.map(String).join(" "));
    originalError(...args);
  };

  let thrown = null;
  try {
    await import("../../src/main.jsx");
    await new Promise((resolve) => setTimeout(resolve, 120));
  } catch (error) {
    thrown = error;
  }
  console.error = originalError;

  const html = host.innerHTML;
  const crash = failures.find((line) =>
    /is not defined|Cannot read|is not a function|Element type is invalid/.test(
      line,
    ),
  );
  const boundary = host.querySelector(
    ".error-boundary, [data-error-boundary], .error-screen",
  );

  check(
    !thrown,
    `the app mounts without throwing${thrown ? `: ${thrown.message}` : ""}`,
  );
  check(
    !crash,
    `no reference or runtime error while rendering${crash ? `: ${crash.split("\n")[0].slice(0, 200)}` : ""}`,
  );
  check(!boundary, "the error boundary did not replace the page");
  check(html.length > 0, "the shell produced markup");
  check(Boolean(host.querySelector(".header")), "the header is present");

  const failed = results.filter((entry) => !entry.ok);
  assert.equal(failed.length, 0, `${failed.length} shell check(s) failed`);
}
