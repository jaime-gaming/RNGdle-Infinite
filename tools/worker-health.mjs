import fs from "node:fs";

const WORKER_CONFIG = new URL("../wrangler.jsonc", new URL(import.meta.url));

// wrangler.jsonc allows trailing commas, so it is read as JSON with the
// comments-and-trailing-comma rules wrangler itself applies.
export function readWorkerConfig() {
  const text = fs
    .readFileSync(WORKER_CONFIG, "utf8")
    .replace(/\/\/[^\n"]*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text);
}

// The custom domain from wrangler.jsonc is the only host that runs this Worker,
// so it is also the only host that can say whether the deployment is healthy.
export function workerDomain() {
  try {
    const config = readWorkerConfig();
    const pattern = config?.routes?.find?.(
      (route) => route?.custom_domain,
    )?.pattern;
    return typeof pattern === "string" && pattern.includes(".")
      ? `https://${pattern.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : "";
  } catch {
    return "";
  }
}

// A deployed Worker that never received its secret, or lost its Durable Object
// binding, answers 503 here with a support reference and no clue for the
// player. Asking the health endpoint right after the upload turns that into a
// deployment message while the terminal is still open.
export async function checkDeploymentHealth(origin, fetcher = fetch) {
  const url = `${origin}/api/game/status`;
  let response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      healthy: false,
      message: `${url} did not answer: ${error?.message ?? error}`,
      setup: "Check the DNS and HTTPS setup for the custom domain.",
    };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {}
  // Without a sign-in token the endpoint must refuse the request as a sign-in
  // problem. That answer only exists after every binding has been checked, so
  // it proves the deployment can verify Cloud rolls.
  if (response.status === 401 && body?.code === "sign-in-required")
    return {
      healthy: true,
      message: `${url} answers 401 sign-in-required, so the deployment can verify Cloud rolls.`,
      setup: "",
    };
  if (response.status === 503)
    return {
      healthy: false,
      message: `${url} answers 503 ${body?.code ?? "game-security-unavailable"}: this deployment cannot verify Cloud rolls.`,
      setup:
        "Read the Worker log line for the missing binding, then follow docs-source/cloud-game-security.md.",
    };
  return {
    healthy: false,
    message: `${url} answered ${response.status} instead of the expected 401.`,
    setup: "Check the Worker route and the SPA fallback in wrangler.jsonc.",
  };
}
