import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { shopProducts } from "../src/shop-data.js";

// Live account linking with no database anywhere: device A creates a link,
// device B opens it, and from then on a save on either side is written to
// the other by the memory-only relay. Each context has its own localStorage,
// so the only path between them is the relay itself.

const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

test("one link joins two browsers to the same account, live", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await seedProgress(pageA, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await pageA.goto("/settings");
  await expect(pageA.getByTestId("sync-create")).toBeVisible();
  await pageA.getByTestId("sync-create").click();

  // The link is a URL with the room and its key inside: no account on any
  // server, just a door both devices can walk through.
  await expect(pageA.getByTestId("sync-link")).toBeVisible();
  const link = await pageA.getByTestId("sync-link").inputValue();
  expect(link).toContain("sync=");
  await expect(pageA.getByTestId("sync-status")).toContainText(
    /Waiting for the other device/,
  );

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto(link);

  // The guest browser adopts A's account — no reload, no button, the relay
  // simply wrote it — and both sides report the pairing.
  await expect(pageA.getByTestId("sync-status")).toContainText(/live/);
  await expect
    .poll(async () => (await saved(pageB))?.profile?.username, {
      timeout: 10000,
    })
    .toBe("LuckyTester");
  await pageB.goto("/settings");
  await expect(pageB.getByTestId("sync-status")).toContainText(/live/);
  await pageB.goto("/");

  // A purchase on A lands in B's own storage without B touching anything —
  // B stays on its page the whole time, so nothing but the relay wrote it.
  await pageA.goto("/shop/tools");
  const autoRoll = shopProducts.find((item) => item.id === "auto-roll");
  await pageA.locator('[data-product="auto-roll"] button').click();
  await pageA
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(pageB))?.owned ?? [], { timeout: 10000 })
    .toContain("auto-roll");
  expect((await saved(pageB)).balance).toBe(5000000 - autoRoll.price);

  // And back the other way: a purchase on B reaches A's storage live.
  await pageB.goto("/shop/tools");
  const lens = shopProducts.find((item) => item.id === "archive-lens");
  await pageB.locator('[data-product="archive-lens"] button').click();
  await pageB
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(pageA))?.owned ?? [], { timeout: 10000 })
    .toContain("archive-lens");
  expect((await saved(pageA)).balance).toBe(
    5000000 - autoRoll.price - lens.price,
  );

  await contextB.close();
  await contextA.close();
});

test("an invalid link fails with a note instead of a blank page", async ({
  page,
}) => {
  await page.goto("/?sync=not-a-real-room");
  // The app still boots, the address bar is cleaned, and the failure is
  // announced rather than swallowed.
  await expect(page.locator(".question-number.number-box")).toHaveText(
    "??????",
    { timeout: 15000 },
  );
  expect(new URL(page.url()).search).not.toContain("sync=");
});
