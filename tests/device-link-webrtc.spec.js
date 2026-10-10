import { test, expect } from "@playwright/test";
import { PeerServer } from "peer";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";

// The link on a static host (GitHub Pages) has no relay: the two browsers meet
// through PeerJS and talk over WebRTC. This runs the same path end to end, with
// a PeerJS signaling broker started right here instead of the public cloud one.
// The relay is switched off for these pages, so nothing else can carry the save.

const BROKER_PORT = 9000;
const NO_RELAY = "http://127.0.0.1:59999";

let broker;
test.beforeAll(async () => {
  broker = PeerServer({ port: BROKER_PORT, path: "/", allow_discovery: false });
  await new Promise((resolve) => setTimeout(resolve, 300));
});
test.afterAll(async () => {
  await new Promise((resolve) => broker?.close?.(resolve) ?? resolve());
});

async function linkedContext(browser) {
  const context = await browser.newContext();
  await context.addInitScript(
    ({ port, relay }) => {
      localStorage.setItem(
        "rng-infinite-peer-broker",
        JSON.stringify({ host: "127.0.0.1", port, path: "/", secure: false }),
      );
      localStorage.setItem("rng-infinite-sync-endpoint-v1", relay);
    },
    { port: BROKER_PORT, relay: NO_RELAY },
  );
  return context;
}

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

// Device A creates a link; device B opens it. Both must report "live".
async function pair(browser) {
  const contextA = await linkedContext(browser);
  const pageA = await contextA.newPage();
  await seedProgress(pageA, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await pageA.goto("/settings/link");
  await pageA.getByTestId("sync-create").click();
  await expect(pageA.getByTestId("sync-link")).toBeVisible();
  const link = await pageA.getByTestId("sync-link").inputValue();

  const contextB = await linkedContext(browser);
  const pageB = await contextB.newPage();
  await pageB.goto(link);
  // The address is read once the app mounts; wait for the link to be stored
  // before moving on, so the navigation cannot race the join.
  await expect
    .poll(
      () => pageB.evaluate(() => localStorage.getItem("rng-infinite-sync-v1")),
      { timeout: 15000 },
    )
    .toContain("room");
  await pageB.goto("/settings/link");

  await expect(pageA.getByTestId("sync-status")).toContainText(/live/, {
    timeout: 30000,
  });
  await expect(pageB.getByTestId("sync-status")).toContainText(/live/, {
    timeout: 30000,
  });
  return { contextA, pageA, contextB, pageB };
}

test("two browsers link over WebRTC through PeerJS, live in both directions", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const { contextA, pageA, contextB, pageB } = await pair(browser);

  // A purchase on A reaches B's own storage over the data channel.
  await pageA.goto("/shop/tools");
  await pageA
    .locator('[data-product="auto-roll"] button:not(.shop-tag)')
    .click();
  await pageA
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(pageB))?.owned ?? [], { timeout: 30000 })
    .toContain("auto-roll");

  await contextB.close();
  await contextA.close();
});

test("after one device reloads, the link comes back on its own", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const { contextA, pageA, contextB, pageB } = await pair(browser);
  await pageB.reload();
  await expect(pageB.getByTestId("sync-status")).toContainText(/live/, {
    timeout: 30000,
  });
  await expect(pageA.getByTestId("sync-status")).toContainText(/live/, {
    timeout: 30000,
  });
  await contextB.close();
  await contextA.close();
});

test("after the network drops, the link recovers as soon as it is back", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const { contextA, pageA, contextB, pageB } = await pair(browser);
  await contextB.setOffline(true);
  await expect(pageB.getByTestId("sync-status")).not.toContainText(/live/, {
    timeout: 30000,
  });
  await contextB.setOffline(false);
  await expect(pageB.getByTestId("sync-status")).toContainText(/live/, {
    timeout: 30000,
  });
  await expect(pageA.getByTestId("sync-status")).toContainText(/live/, {
    timeout: 30000,
  });
  await contextB.close();
  await contextA.close();
});
