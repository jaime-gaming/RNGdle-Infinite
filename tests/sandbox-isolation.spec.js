import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startSandbox(port, date, processes) {
  const child = spawn(
    process.execPath,
    [
      path.resolve("node_modules/vite/bin/vite.js"),
      "--mode",
      "rngween-preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      env: { ...process.env, RNGDLE_SANDBOX_DATE: date },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  processes.push(child);
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`Vite did not start: ${output}`)),
      20000,
    );
    const ready = (chunk) => {
      output += chunk;
      if (stripVTControlCharacters(output).includes("Local:")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", ready);
    child.stderr.on("data", ready);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited (${code}): ${output}`));
    });
  });
  return `http://127.0.0.1:${port}`;
}

test("concurrent sandboxes isolate optimized React and both keep working", async ({
  browser,
  request,
}) => {
  const processes = [];
  let context;
  try {
    const firstPort = await freePort();
    let secondPort = await freePort();
    while (secondPort === firstPort) secondPort = await freePort();
    const [first, second] = await Promise.all([
      startSandbox(firstPort, "2026-10-31T20:00:00Z", processes),
      startSandbox(secondPort, "2026-10-31T20:25:00Z", processes),
    ]);
    const [sourceA, sourceB] = await Promise.all([
      request.get(`${first}/src/main.jsx`).then((response) => response.text()),
      request.get(`${second}/src/main.jsx`).then((response) => response.text()),
    ]);
    const reactPath =
      /\/node_modules\/\.vite-servers\/[^/]+\/deps\/react\.js\?v=[a-f0-9]+/;
    expect(sourceA.match(reactPath)).not.toBeNull();
    expect(sourceB.match(reactPath)).not.toBeNull();
    expect(sourceA.match(reactPath)[0]).not.toBe(sourceB.match(reactPath)[0]);

    context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem("rng-infinite-rngween-intro-v1", "rngween-2026");
      localStorage.setItem(
        "rng-infinite-rngween-world-intro-v1",
        "rngween-2026",
      );
    });
    const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
    const errors = [];
    for (const page of [a, b])
      page.on("pageerror", (error) => errors.push(error.message));
    await Promise.all([a.goto(first), b.goto(second)]);
    await expect(a.locator('[data-reaper-act="omen"]')).toBeVisible();
    await expect(b.locator('[data-reaper-act="eclipse"]')).toBeVisible();
    await Promise.all([a.reload(), b.reload()]);
    await expect(
      a.getByRole("button", { name: "GENERATE", exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "GENERATE", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await Promise.all(
      processes.map(async (child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }),
    );
  }
});
