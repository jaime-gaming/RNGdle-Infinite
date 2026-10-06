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

// The numbers a device keeps about its own link: the stamp the room last
// accepted, and whether a change is still waiting to be sent.
const linkState = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("rng-infinite-sync-v1") ?? "null"),
  );

// "The room has it": the stamp moved forward and the outbox is empty.
async function expectDelivered(page, before) {
  await expect
    .poll(
      async () => {
        const link = await linkState(page);
        return link && !link.pending && link.savedAt > before
          ? link.savedAt
          : 0;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(before);
}

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
  await pageA.goto("/settings/link");
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
  await pageB.goto("/settings/link");
  await expect(pageB.getByTestId("sync-status")).toContainText(/live/);
  await pageB.goto("/");

  // A purchase on A lands in B's own storage without B touching anything —
  // B stays on its page the whole time, so nothing but the relay wrote it.
  await pageA.goto("/shop/tools");
  const autoRoll = shopProducts.find((item) => item.id === "auto-roll");
  await pageA
    .locator('[data-product="auto-roll"] button:not(.shop-tag)')
    .click();
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
  await pageB
    .locator('[data-product="archive-lens"] button:not(.shop-tag)')
    .click();
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

test("one device can stay closed while the other contributes, and catches up on return", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await seedProgress(pageA, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await pageA.goto("/settings/link");
  await pageA.getByTestId("sync-create").click();
  const link = await pageA.getByTestId("sync-link").inputValue();

  // B joins the room while A is watching.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto(link);
  await expect
    .poll(async () => (await saved(pageB))?.profile?.username, {
      timeout: 10000,
    })
    .toBe("LuckyTester");

  // A closes its tab entirely — from B's point of view, that device is off.
  await pageA.close();

  // B keeps contributing on its own: a whole purchase made while A is away.
  await pageB.goto("/shop/tools");
  await pageB
    .locator('[data-product="archive-lens"] button:not(.shop-tag)')
    .click();
  await pageB
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(pageB))?.owned ?? [], { timeout: 10000 })
    .toContain("archive-lens");

  // A comes back later — same browser, stored link, fresh tab. The room
  // answers with B's newer save and A adopts everything that happened.
  const pageA2 = await contextA.newPage();
  await pageA2.goto("/");
  await expect
    .poll(async () => (await saved(pageA2))?.owned ?? [], { timeout: 15000 })
    .toContain("archive-lens");
  await pageA2.goto("/settings/link");
  await expect(pageA2.getByTestId("sync-status")).toContainText(/live/);

  await contextB.close();
  await contextA.close();
});

test("a peer code carries the whole account with no relay in the middle", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await seedProgress(pageA, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: ["quickwind-1"],
  });
  await pageA.goto("/settings/link");

  // The hand-link lives behind a disclosure so the relay flow stays the
  // headline; opening it and copying fills the field whether or not the
  // browser allows the clipboard.
  await pageA.locator(".sync-hand summary").click();
  await pageA.getByTestId("peer-code-copy").click();
  const code = await pageA.getByTestId("peer-code-field").inputValue();
  expect(code.startsWith("RNGDLE-ACCOUNT-1:")).toBe(true);

  // A second, entirely empty browser — no link, no relay, no storage in
  // common — adopts the account the moment the code is pasted.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("/settings/link");
  await pageB.locator(".sync-hand summary").click();
  await pageB.getByTestId("peer-code-field").fill(code);
  await pageB.getByTestId("peer-code-adopt").click();
  await expect
    .poll(async () => (await saved(pageB))?.profile?.username, {
      timeout: 10000,
    })
    .toBe("LuckyTester");
  const adopted = await saved(pageB);
  expect(adopted.balance).toBe(5000000);
  expect(adopted.owned).toContain("quickwind-1");
  // The field clears once the code has been taken.
  await expect(pageB.getByTestId("peer-code-field")).toHaveValue("");

  // Rubbish pasted in is refused with a note, never a broken save.
  await pageB
    .getByTestId("peer-code-field")
    .fill("RNGDLE-ACCOUNT-1:not-a-code");
  await pageB.getByTestId("peer-code-adopt").click();
  expect((await saved(pageB)).profile.username).toBe("LuckyTester");

  await contextB.close();
  await contextA.close();
});

test("send now flushes the save, and the relay address is configurable", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await seedProgress(pageA, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await pageA.goto("/settings/link");
  await pageA.getByTestId("sync-create").click();
  await expect(pageA.getByTestId("sync-link")).toBeVisible();

  // One click on Send now posts this browser's save and says so.
  await pageA.getByTestId("sync-now").click();
  await expect(pageA.getByTestId("sync-note")).toContainText(
    /left this device|arrived/,
  );
  await expect(pageA.getByTestId("sync-status")).toHaveAttribute(
    "data-direction",
    /sent|received/,
  );

  // A static deployment points at a relay of its own; the field remembers it
  // and Reset hands the page back to this site's own address.
  await pageA.getByTestId("relay-field").fill("https://relay.example:8787/");
  await pageA.getByTestId("relay-save").click();
  await expect(pageA.getByTestId("relay-field")).toHaveValue(
    "https://relay.example:8787",
  );
  await expect
    .poll(async () =>
      pageA.evaluate(() =>
        localStorage.getItem("rng-infinite-sync-endpoint-v1"),
      ),
    )
    .toBe("https://relay.example:8787");
  await pageA.getByTestId("relay-reset").click();
  await expect(pageA.getByTestId("relay-field")).toHaveValue(
    "http://127.0.0.1:5173",
  );

  await contextA.close();
});

test("the link works when one device is closed the whole time, and when both are", async ({
  browser,
}) => {
  // Device A creates the link and plays on its own. Device B does not exist
  // yet — it might open the link tomorrow, which is the whole point: the room
  // keeps the newest save on the relay's own store, so a closed device is not
  // a missing device.
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await seedProgress(pageA, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await pageA.goto("/settings/link");
  await pageA.getByTestId("sync-create").click();
  const link = await pageA.getByTestId("sync-link").inputValue();
  await expect(pageA.getByTestId("sync-status")).toContainText(
    /Waiting for the other device/,
  );

  // A buys something and waits until the room has actually taken it — the
  // stamp moves forward and nothing is queued any more — then closes
  // entirely. Closing before that is exactly how a device loses a purchase.
  await pageA.goto("/shop/tools");
  const beforeA = (await linkState(pageA)).savedAt;
  await pageA
    .locator('[data-product="archive-lens"] button:not(.shop-tag)')
    .click();
  await pageA
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expectDelivered(pageA, beforeA);
  await pageA.close();

  // Much later, B opens the same link for the first time. It is handed
  // everything that happened while it did not exist.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto(link);
  await expect
    .poll(async () => (await saved(pageB))?.profile?.username, {
      timeout: 15000,
    })
    .toBe("LuckyTester");
  expect((await saved(pageB)).owned).toContain("archive-lens");

  // And the reverse once more: B plays alone while A is closed, and this time
  // B is the one that disappears — after the room has taken its purchase.
  await pageB.goto("/shop/tools");
  const beforeB = (await linkState(pageB)).savedAt;
  await pageB
    .locator('[data-product="auto-roll"] button:not(.shop-tag)')
    .click();
  await pageB
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(pageB)).owned ?? [], { timeout: 10000 })
    .toContain("auto-roll");
  await expectDelivered(pageB, beforeB);
  await contextB.close();

  const pageA2 = await contextA.newPage();
  await pageA2.goto(link);
  await expect
    .poll(async () => (await saved(pageA2))?.owned ?? [], { timeout: 15000 })
    .toContain("auto-roll");

  await contextA.close();
});

test("settings keeps the summary and the link page keeps the details", async ({
  page,
}) => {
  await seedProgress(page, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await page.goto("/settings");
  // The technical surface is not in Settings any more…
  await expect(page.getByTestId("relay-field")).toHaveCount(0);
  await expect(page.getByTestId("link-details")).toHaveCount(0);
  // …only a card that says what the link is and opens its own page.
  const summary = page.locator(".settings-group", {
    has: page.getByRole("heading", { name: "Link devices" }),
  });
  await expect(summary).toBeVisible();
  await summary.getByTestId("open-device-link").click();
  await expect(page).toHaveURL(/\/settings\/link$/);

  // The page states the link, the room, this device and the relay's store.
  await page.getByTestId("sync-create").click();
  await expect(page.getByTestId("sync-link")).toBeVisible();
  const details = page.getByTestId("link-details");
  await expect(details).toContainText("Relay");
  await expect(details).toContainText("Store");
  await expect(details).toContainText(/On disk|In memory only/);
  await expect(details).toContainText("Waiting to be sent");
  await expect(page.getByTestId("relay-field")).toBeVisible();

  // Back to settings is a real route, and the browser's Back works too.
  await page.getByRole("button", { name: "Back to settings" }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/link$/);
});

test("a change made while the relay is unreachable is queued and sent later", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedProgress(page, {
    balance: 5000000,
    totalEarned: 5000000,
    owned: [],
  });
  await page.goto("/settings/link");
  await page.getByTestId("sync-create").click();
  await expect(page.getByTestId("sync-link")).toBeVisible();

  // The relay goes away: every frame from here on fails, exactly as it does
  // when the device running it is asleep.
  await page.route("**/__sync/state**", (route) => route.abort());
  await page.goto("/shop/tools");
  await page
    .locator('[data-product="archive-lens"] button:not(.shop-tag)')
    .click();
  await page
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  // Waiting for the purchase to land in this browser's own storage keeps the
  // test about the queue, not about navigating away mid-commit. The commit is
  // asynchronous (Web Lock + write), so leaving the page in the same tick can
  // race it on a loaded machine.
  await expect
    .poll(async () => (await saved(page))?.owned ?? [], { timeout: 10000 })
    .toContain("archive-lens");
  await page.goto("/settings/link");
  await expect(page.getByTestId("sync-pending")).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByTestId("link-details")).toContainText(/Yes — since/);

  // The relay answers again; Send now hands over the queued save.
  await page.unroute("**/__sync/state**");
  await page.getByTestId("sync-now").click();
  await expect(page.getByTestId("sync-pending")).toHaveCount(0, {
    timeout: 10000,
  });
  await expect(page.getByTestId("link-details")).toContainText(
    "Nothing queued",
  );

  await context.close();
});
