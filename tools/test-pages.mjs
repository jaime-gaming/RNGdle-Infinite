// Test real production output against a strict static server (no SPA fallback).
// Both root/custom-domain and repository-subpath hosting must work, including
// worker fetches, local emoji, fonts, real routes through the 404.html
// fallback, and browser-local saves.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "vite";
import { emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { completedWorldObjectives } from "../tests/helpers/world-roll.js";
import { scoreWorldNumber } from "../src/rngween-world-badges.js";
import { chooseTheme } from "../tests/helpers/appearance.js";
import { mockSeasonClock } from "../tests/helpers/season-clock.js";

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? {
        executablePath: process.env.CHROMIUM_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
      }
    : {},
);
try {
  for (const base of ["/", "/RNGdle-Infinite/"]) {
    const outDir = path.resolve(".cache/pages-smoke");
    await build({ base, build: { outDir, emptyOutDir: true } });
    const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
    assert.ok(
      !html.includes("data-sandbox-clock") &&
        !html.includes("rngdle-sandbox-clock"),
      "Sandbox clock leaked into production HTML",
    );
    const appAsset = (await fs.readdir(path.join(outDir, "assets"))).find(
      (name) => /^index-.*\.js$/.test(name),
    );
    const appScript = await fs.readFile(
      path.join(outDir, "assets", appAsset),
      "utf8",
    );
    for (const marker of [
      "X-RNGdle-Sandbox-Date",
      "rngdle-sandbox-clock",
      "/__rngdle/season-clock",
    ])
      assert.ok(
        !appScript.includes(marker),
        "Sandbox clock leaked into the production bundle",
      );
    const requests = [];
    const fallbacks = new Set();
    const server = http.createServer(async (req, res) => {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://test").pathname,
      );
      requests.push(pathname);
      if (!pathname.startsWith(base)) {
        res.writeHead(404).end();
        return;
      }
      let relative = pathname.slice(base.length) || "index.html";
      if (relative.endsWith("/")) relative += "index.html";
      const filename = path.resolve(outDir, relative);
      if (!filename.startsWith(outDir + path.sep)) {
        res.writeHead(404).end();
        return;
      }
      try {
        const body = await fs.readFile(filename);
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(filename)] ?? "application/octet-stream",
        });
        res.end(body);
      } catch {
        // GitHub Pages serves 404.html for paths that are not files, which is
        // how a direct link or reload on a real route (/shop) boots the app.
        try {
          const body = await fs.readFile(path.join(outDir, "404.html"));
          fallbacks.add(pathname);
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end(body);
        } catch {
          res.writeHead(404).end();
        }
      }
    });
    await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
    const context = await browser.newContext({ reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await mockSeasonClock(page, Date.UTC(2026, 10, 3, 12));
      const errors = [],
        failures = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() < 400) return;
        // The route fallback above is expected; anything else is a break —
        // except the relay, which a static host does not have and the device
        // link page reports as unreachable by design.
        const { pathname } = new URL(response.url());
        if (pathname.includes("/__sync/")) return;
        if (!fallbacks.has(pathname)) failures.push(response.url());
      });
      page.on("requestfailed", (request) => {
        // Navigating/reloading cancels this optional document's calendar HEAD.
        // Still fail on HTTP errors, asset failures or any other network error.
        if (
          request.url().includes("season-clock=") &&
          request.failure()?.errorText === "net::ERR_ABORTED"
        )
          return;
        failures.push(request.url());
      });
      await page.addInitScript(
        ({ key, progress }) => {
          if (!localStorage.getItem(key))
            localStorage.setItem(key, JSON.stringify(progress));
        },
        {
          key: PROGRESS_KEY,
          progress: {
            ...emptyProgress(),
            profile: {
              id: "pages-test",
              username: "PagesTester",
              createdAt: Date.now(),
            },
          },
        },
      );
      const url = `http://127.0.0.1:${server.address().port}${base}`;
      const saved = () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)),
          PROGRESS_KEY,
        );
      await page.goto(url);
      await expect(
        page.getByRole("button", { name: "GENERATE", exact: true }),
      ).toBeEnabled();
      // Vite must rewrite HTML assets as well as the worker and its data URLs.
      const favicon = await page
        .locator('link[rel="icon"]')
        .getAttribute("href");
      assert.equal(favicon, `${base}favicon.svg`);
      assert.equal(
        (await page.request.get(new URL(favicon, url).href)).status(),
        200,
      );
      await page.getByRole("button", { name: "GENERATE", exact: true }).click();
      await expect(page.locator(".roll-experience")).toHaveAttribute(
        "data-settled",
        "true",
      );
      const before = await saved();
      assert.equal(
        before.history.filter((row) => row.type === "roll").length,
        1,
      );
      assert.ok(before.balance >= 0);
      assert.equal(
        before.balance,
        before.history.find((row) => row.type === "roll").ep,
      );
      await expect
        .poll(() => page.locator(".emoji img").count())
        .toBeGreaterThan(0);
      await expect
        .poll(() =>
          page
            .locator(".emoji img")
            .evaluateAll((images) =>
              images.every((img) => img.complete && img.naturalWidth > 0),
            ),
        )
        .toBe(true);
      for (const src of await page
        .locator(".emoji img")
        .evaluateAll((images) =>
          images.map((img) => img.getAttribute("src")),
        )) {
        assert.ok(src.startsWith(`${base}emoji/`), src);
      }
      for (const [section, title] of Object.entries({
        shop: "The EP shop",
        badges: "The badge collection",
        history: "Your activity",
      })) {
        // A legacy hash link still lands on its page, and a fresh load of it
        // normalises the address bar to the real path a share would use.
        await page.goto(`${url}#${section}`);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        assert.equal(new URL(page.url()).pathname, `${base}${section}`);
        assert.equal(new URL(page.url()).hash, "");
        assert.equal((await saved()).balance, before.balance);
      }
      // A direct link to a route is exactly the request a static host answers
      // with 404.html: the app must boot from that fallback, not a dead end.
      for (const [section, title] of Object.entries({
        badges: "The badge collection",
        history: "Your activity",
      })) {
        await page.goto(`${url}${section}`);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        assert.equal(new URL(page.url()).pathname, `${base}${section}`);
      }
      // A shelf is a sub-page of the shop: the same 404 fallback has to boot it,
      // and a legacy "#tools" bookmark has to normalise to the real path.
      await page.goto(`${url}shop/auras`);
      await expect(
        page.getByRole("heading", { name: "Auras", exact: true }),
      ).toBeVisible();
      assert.equal(new URL(page.url()).pathname, `${base}shop/auras`);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Auras", exact: true }),
      ).toBeVisible();
      assert.equal(new URL(page.url()).pathname, `${base}shop/auras`);
      // Device links on a published build: there is no relay of its own, the
      // page says exactly that, and the hand-link still carries the account
      // from one browser to another with no server anywhere in the middle.
      await page.goto(`${url}settings/link`);
      await expect(
        page.getByRole("heading", { name: "Device link", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("link-details")).toContainText(
        "The relay did not answer.",
      );
      await expect(page.locator(".device-link-note")).toContainText(
        "no relay of its own",
      );
      await expect(page.getByTestId("link-details")).toContainText(
        "Nothing queued",
      );
      await page.locator(".sync-hand summary").click();
      await page.getByTestId("peer-code-copy").click();
      const code = await page.getByTestId("peer-code-field").inputValue();
      assert.ok(code.startsWith("RNGDLE-ACCOUNT-1:"), code.slice(0, 24));
      const second = await browser.newContext({ reducedMotion: "reduce" });
      try {
        const other = await second.newPage();
        await mockSeasonClock(other, Date.UTC(2026, 10, 3, 12));
        await other.goto(`${url}settings/link`);
        await other.locator(".sync-hand summary").click();
        await other.getByTestId("peer-code-field").fill(code);
        await other.getByTestId("peer-code-adopt").click();
        await expect
          .poll(() =>
            other.evaluate(
              (key) =>
                JSON.parse(localStorage.getItem(key) ?? "null")?.profile
                  ?.username ?? "",
              PROGRESS_KEY,
            ),
          )
          .toBe("PagesTester");
      } finally {
        await second.close();
      }
      await page.goto(`${url}shop#tools`);
      await expect(
        page.getByRole("heading", { name: "Tools", exact: true }),
      ).toBeVisible();
      assert.equal(new URL(page.url()).pathname, `${base}shop/tools`);
      assert.equal(new URL(page.url()).hash, "");
      await page.goto(url);
      await expect(page.locator(".generate")).toBeDisabled();
      assert.equal(
        (await saved()).history.filter((row) => row.type === "roll").length,
        1,
      );
      // These are server-side request logs, so worker requests are included.
      for (const pattern of [
        /\/assets\/roll\.worker-.*\.js$/,
        /\/data\/ep-table\..*\.json$/,
        /\/data\/badge-table\..*\.json$/,
        /\/assets\/.*\.woff2$/,
        /\/emoji\/.*\.svg$/,
      ]) {
        assert.ok(
          requests.some((request) => pattern.test(request)),
          `Missing request: ${pattern}`,
        );
      }
      assert.ok(
        requests.every((request) => request.startsWith(base)),
        "Asset escaped the deployment base",
      );
      // Seasonal assets obey the same deployment base, and the real production
      // app uses a website date independently of the browser's wall clock.
      const halloween = await mockSeasonClock(page, Date.UTC(2026, 9, 26, 12));
      await page.goto(`${url}tasks`);
      await chooseTheme(page, "dark");
      await expect(page.locator(".rngween-event")).toBeVisible();
      await expect(page.locator(".rngween-banner")).toHaveCount(0);
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
        "href",
        `${base}favicon-halloween.svg`,
      );
      const icon = await page.request.get(
        new URL(`${base}favicon-halloween.svg`, url).href,
      );
      assert.equal(icon.status(), 200);
      assert.ok((await icon.text()).includes("RNG ∞"));
      await page.goto(`${url}shop`);
      await expect(
        page.locator(".shop-jump [data-shelf]").first(),
      ).toHaveAttribute("data-shelf", "limited");
      await page.locator(".rngween-shop-door").click();
      await expect(page).toHaveURL(new RegExp(`${base}shop/limited$`));
      await expect(
        page.getByRole("heading", { name: "Limited Shop: RNGween 2026" }),
      ).toBeVisible();
      // The first three of four compiled phases are public; only the Valley needs a key.
      // Start this isolated event fixture without November's future board.
      await page.evaluate((key) => {
        const p = JSON.parse(localStorage.getItem(key));
        delete p.rngweenLimited.hourly;
        p.tasks.rngween = {
          id: "rngween-2026",
          counts: { rolls: 0, rare: 0, banked: 0, taskClaims: 0 },
          earned: [],
        };
        localStorage.setItem(key, JSON.stringify(p));
      }, PROGRESS_KEY);
      // Install before the World document binds its monotonic clock. This
      // advances real saved deadlines, never bypasses the compiled writer/RNG.
      await page.clock.install();
      assert.equal(
        (await page.request.get(`${url}rngween-world/`)).status(),
        200,
      );
      await page.goto(`${url}rngween-world/`);
      await expect(page.locator("[data-world-zone]")).toHaveCount(4);
      await expect(page.getByRole("button", { name: /Predict/ })).toHaveCount(
        0,
      );
      await page.locator('[data-world-zone="valley"]').click();
      await expect(page.getByText("Challenge key needed")).toBeVisible();
      async function settleWorld(button) {
        await button.click();
        await expect
          .poll(async () => (await saved()).rngweenLimited.world.pending?.id)
          .toBeTruthy();
        const pending = (await saved()).rngweenLimited.world.pending;
        await page.clock.fastForward(
          pending.revealsAt - pending.startedAt + 80,
        );
        await expect
          .poll(async () => (await saved()).rngweenLimited.world.pending)
          .toBeNull();
        return (await saved()).rngweenLimited.world.last;
      }
      await page.locator('[data-world-zone="pumpkin-patch"]').click();
      await expect(page.locator("[data-phase-aura]")).toHaveAttribute(
        "data-phase-aura",
        "jack-o-glow",
      );
      const pumpkin = await settleWorld(
        page.getByRole("button", { name: /Roll in Pumpkin Patch/ }),
      );
      assert.ok(pumpkin.number >= 1 && pumpkin.number <= 9);
      const beforeTalk = await saved();
      await page
        .getByRole("button", { name: "Talk to The Reaper", exact: true })
        .click();
      const scene = page.getByRole("dialog", {
        name: "The Reaper",
        exact: true,
      });
      await expect(scene).toBeVisible();
      await expect(
        scene.locator(
          '[data-reaper-art="original-vector"].reaper-figure-sketch',
        ),
      ).toHaveCount(1);
      await scene
        .getByLabel("Your next line", { exact: true })
        .fill("Tell me about Phantom Veil");
      await scene.getByRole("button", { name: "Say your line" }).click();
      await expect(scene).toContainText("40 Rare or better");
      assert.deepEqual(await saved(), beforeTalk);
      await page.keyboard.press("Escape");
      await expect(scene).not.toBeVisible();
      await page.locator('[data-world-zone="graveyard"]').click();
      const grave = await settleWorld(
        page.getByRole("button", { name: /Roll in Graveyard/ }),
      );
      assert.ok(grave.number >= 1 && grave.number <= 99);
      await page.locator('[data-world-zone="haunted-house"]').click();
      const house = await settleWorld(
        page.getByRole("button", { name: /Roll in Haunted House/ }),
      );
      assert.ok(house.number >= 1 && house.number <= 999);
      const worldBefore = await saved();
      assert.equal(worldBefore.rngweenLimited.drawn.length, 0);
      assert.equal(worldBefore.rngweenLimited.world.rounds.graveyard, 1);
      assert.equal(worldBefore.rngweenLimited.world.rounds["haunted-house"], 1);
      assert.ok(
        requests.some((request) =>
          /\/assets\/rngween-world\.worker-.*\.js$/.test(request),
        ),
        "Missing secure World worker",
      );
      assert.ok(
        requests.every((request) => request.startsWith(base)),
        "World asset escaped deployment base",
      );
      assert.equal(worldBefore.rngweenLimited.world.fragments.graveyard, false);
      assert.equal(
        worldBefore.rngweenLimited.world.fragments["haunted-house"],
        false,
      );
      assert.equal(grave.rules, 3);
      assert.equal(house.rules, 3);
      assert.equal(grave.choice, null);
      assert.equal(house.choice, null);
      await expect(page.locator(".world-choices, .world-run")).toHaveCount(0);
      await expect(page.locator("[data-world-objective]")).toHaveCount(3);
      await expect(page.locator("[data-world-badge]")).toHaveCount(11);
      await expect(page.locator("[data-world-points]")).toHaveText(
        String(scoreWorldNumber("haunted-house", house.number).points),
      );
      await page.locator('[data-world-zone="graveyard"]').click();
      await expect(
        page.getByLabel(`World number ${grave.number}`, { exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.locator('[data-world-zone="graveyard"]').click();
      await expect(
        page.getByLabel(`World number ${grave.number}`, { exact: true }),
      ).toBeVisible();
      // Complete collection fixtures through actual committed core deadlines;
      // the compiled parser, goals, free forge and reward UI must agree.
      let collection = await saved();
      collection.rngweenLimited.world = emptyProgress().rngweenLimited.world;
      collection = completedWorldObjectives(
        collection,
        "graveyard",
        Date.UTC(2026, 9, 26, 12) + 40000,
      );
      collection = completedWorldObjectives(
        collection,
        "haunted-house",
        Date.UTC(2026, 9, 26, 12) + 100000,
      );
      await page.evaluate(
        ({ key, collection }) =>
          localStorage.setItem(key, JSON.stringify(collection)),
        { key: PROGRESS_KEY, collection },
      );
      halloween.set(Date.UTC(2026, 9, 26, 12) + 250000);
      await page.goto(`${url}rngween-world`);
      await expect(page.locator(".world-fragment-owned")).toContainText(
        "Fragment owned",
      );
      await page.getByRole("button", { name: "Forge key · free" }).click();
      await expect(
        page.getByRole("heading", { name: "Your key is ready" }),
      ).toBeVisible();
      assert.equal((await saved()).rngweenLimited.world.keyForged, true);
      assert.equal(
        (await saved()).rngweenLimited.pumpkoins,
        worldBefore.rngweenLimited.pumpkoins,
      );
      // Independent paid-shortcut fixture: remove only this test's forge
      // receipt so ownership recovery does not reopen its free key.
      await page.evaluate(
        ({ key, empty }) => {
          const p = JSON.parse(localStorage.getItem(key));
          p.rngweenLimited.world = empty;
          p.history = p.history.filter(
            (entry) => entry.type !== "rngween-forged-key",
          );
          p.rngweenLimited.pumpkoins = 2200;
          localStorage.setItem(key, JSON.stringify(p));
        },
        { key: PROGRESS_KEY, empty: emptyProgress().rngweenLimited.world },
      );
      halloween.set(Date.UTC(2026, 9, 26, 12) + 25000);
      await page.goto(`${url}shop/limited`);
      const prize = page.locator('[data-world-prize="hexbound"]');
      await expect(prize).toContainText("Find 6666 · never sold");
      await page
        .getByRole("button", {
          name: "Buy Valley Challenge Key for 2000 Pumpkoins",
        })
        .click();
      const keyDialog = page.getByRole("dialog", {
        name: "Buy a Valley Challenge Key?",
      });
      await expect(keyDialog).toContainText("no aura or Hexbound included");
      await keyDialog.getByRole("button", { name: "Confirm purchase" }).click();
      await page.getByRole("button", { name: "View World" }).click();
      const reaper = page.getByRole("dialog", {
        name: "The Reaper",
        exact: true,
      });
      await expect(reaper).toBeVisible();
      await reaper.getByRole("button", { name: "What is Hexbound?" }).click();
      await expect(reaper).toContainText("6666");
      await reaper.getByRole("button", { name: "Can I pass?" }).click();
      await expect(reaper).toContainText("Your Valley key is ready");
      await reaper.getByRole("button", { name: "Enter RNGween World" }).click();
      await page.getByRole("button", { name: /World shop/ }).click();
      const worldShop = page.getByRole("dialog", {
        name: "World shop",
      });
      await expect(worldShop.locator("[data-world-upgrade]")).toHaveCount(3);
      await worldShop
        .getByRole("button", { name: "Buy Wisp Lantern", exact: true })
        .click();
      await expect(worldShop).toContainText("8s current reveal");
      await worldShop.getByRole("button", { name: "Close World shop" }).click();
      await page.locator('[data-world-zone="valley"]').click();
      const first = await settleWorld(
        page.getByRole("button", { name: /Roll in the Valley/ }),
      );
      assert.equal(first.revealsAt - first.startedAt, 8000);
      assert.ok(first.number >= 1 && first.number <= 9999);
      await expect(page.locator(".world-six")).toHaveCount(
        String(first.number).split("6").length - 1,
      );
      halloween.set(Date.UTC(2026, 9, 26, 12) + 40000);
      await page.reload();
      await expect(
        page.getByLabel(`World number ${first.number}`, { exact: true }),
      ).toBeVisible();
      await settleWorld(
        page.getByRole("button", { name: /Roll in the Valley/ }),
      );
      const keyed = await saved();
      assert.equal(new Set(keyed.rngweenLimited.drawn).size, 2);
      assert.equal(keyed.rngweenLimited.pumpkoins, 0);
      assert.ok(keyed.rngweenLimited.bought.includes("rngween-world-key"));
      assert.deepEqual(keyed.rngweenLimited.world.upgrades, ["wisp-lantern"]);
      assert.equal(keyed.balance, worldBefore.balance);
      await page.reload();
      await expect(
        page.getByRole("button", { name: /Roll in the Valley/ }),
      ).toBeEnabled();
      halloween.set(Date.UTC(2026, 10, 1, 12));
      await page.goto(`${url}tasks`);
      await expect(page.locator("[data-hourly-task]")).toHaveCount(4);
      assert.ok(
        (await page
          .locator('[data-hourly-task][data-source="world"]')
          .count()) > 0,
      );
      await expect(page.locator(".rngween-event")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute(
        "data-season",
        "rngween",
      );
      halloween.set(Date.UTC(2026, 10, 4, 12));
      await page.goto(`${url}tasks`);
      await expect(
        page.locator(".rngween-event, .rngween-decor, [data-hourly-board]"),
      ).toHaveCount(0);
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
        "href",
        `${base}favicon.svg`,
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      console.log(
        `Pages smoke passed: ${base} — real RNG, worker/data, emoji/fonts, route fallback, saved reload, relay-free device link, dark-only seasonal favicon, limited shelf, four World phases, 39 event badges, vector Reaper and typewritten replies, saved collections and fragment goals, challenge key, speed shop and timed unseen Valley pool`,
      );
    } finally {
      await context.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
} finally {
  await browser.close();
}
