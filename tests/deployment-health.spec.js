import { expect, test } from "@playwright/test";
import {
  checkDeploymentHealth,
  workerDomain,
} from "../tools/worker-health.mjs";

function respond(status, body) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

test("a deploy check reads the custom domain from the Worker config", () => {
  expect(workerDomain()).toBe("https://rngdle-infinite.jaime-gaming.com");
});

test("a deployment that can verify Cloud rolls passes its own health check", async () => {
  const health = await checkDeploymentHealth(
    "https://game.example",
    respond(401, { ok: false, code: "sign-in-required" }),
  );
  expect(health.healthy).toBe(true);
  expect(health.message).toContain("401");
});

test("a deployment missing a binding fails the check and names the setup step", async () => {
  const health = await checkDeploymentHealth(
    "https://game.example",
    respond(503, { ok: false, code: "game-security-unavailable" }),
  );
  expect(health.healthy).toBe(false);
  expect(health.message).toContain("game-security-unavailable");
  expect(health.setup).toContain("cloud-game-security.md");
});

test("an unreachable or unexpected answer is a failed deploy check, not a pass", async () => {
  const offline = await checkDeploymentHealth(
    "https://game.example",
    async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    },
  );
  expect(offline.healthy).toBe(false);
  expect(offline.setup).toContain("DNS");

  const wrong = await checkDeploymentHealth(
    "https://game.example",
    respond(200, { ok: true }),
  );
  expect(wrong.healthy).toBe(false);
  expect(wrong.message).toContain("200");
});
