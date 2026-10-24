import { test, expect } from "./helpers/clock.js";
import { sandboxClock } from "../tools/sandbox-clock.mjs";
import { emptyRngween } from "../src/rngween.js";
import { emptyTasks } from "../src/tasks.js";
import { PROGRESS_KEY } from "../src/progress.js";
import { seedProgress } from "./helpers/progress.js";
import { withAllFragments } from "./helpers/world-roll.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
});

const active = Date.parse("2026-10-26T12:00:00Z");
const ended = Date.parse("2026-11-04T00:00:00Z");

async function reviewClock(page, at = active) {
  let time = at;
  let calls = 0;
  // Inject the same marker as the explicit preview, leaving ordinary dev/tests
  // and production calendar behaviour independent of the review mode.
  await page.route("**/tasks", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        "</head>",
        '<meta name="rngdle-sandbox-clock" content="/__rngdle/season-clock" /></head>',
      ),
    });
  });
  await page.route("**/__rngdle/season-clock?season-clock=*", async (route) => {
    calls++;
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // A proxy's real date/Age must not replace the server's review date.
      headers: { date: "Sat, 10 Oct 2026 12:00:00 GMT", age: "86400" },
      body: JSON.stringify({ at: time }),
    });
  });
  await page.route("**/favicon.svg?season-clock=*", (route) => route.abort());
  return {
    set: (at) => {
      time = at;
    },
    calls: () => calls,
  };
}

test("the review clock is opt-in and never a build plugin", () => {
  expect(sandboxClock(null)).toBeNull();
  expect(() => sandboxClock("invalid")).toThrow("Invalid RNGDLE_SANDBOX_DATE");
  const plugin = sandboxClock("2026-10-26T12:00:00Z");
  expect(plugin.apply).toBe("serve");
  expect(plugin.transformIndexHtml.handler()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        tag: "meta",
        attrs: {
          name: "rngdle-sandbox-clock",
          content: "/__rngdle/season-clock",
        },
      }),
    ]),
  );
});

test("the live review date is served in a fresh JSON body, not only in headers", () => {
  const plugin = sandboxClock("2026-10-26T12:00:00Z");
  let handle;
  plugin.configureServer({
    middlewares: {
      use: (middleware) => {
        handle = middleware;
      },
    },
  });
  const headers = {};
  let body;
  let passed = false;
  const response = {
    setHeader: (name, value) => {
      headers[name] = value;
    },
    end: (value) => {
      body = value;
    },
  };
  handle(
    { method: "GET", url: "/__rngdle/season-clock?season-clock=1" },
    response,
    () => {
      passed = true;
    },
  );
  expect(response.statusCode).toBe(200);
  expect(headers["Content-Type"]).toContain("application/json");
  expect(headers["Cache-Control"]).toContain("no-store");
  expect(new Date(JSON.parse(body).at).toISOString()).toContain("2026-10-26");
  expect(passed).toBe(false);
  handle({ method: "GET", url: "/" }, response, () => {
    passed = true;
  });
  expect(passed).toBe(true);
});

test("Halloween renders through a preview with replaced Date headers and a wrong device date", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-02-15T12:00:00Z"));
  const clock = await reviewClock(page);
  await page.goto("/tasks/rngween");
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await expect(
    page.getByRole("heading", { name: "RNGween", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Halloween tasks" }).locator("li"),
  ).toHaveCount(4);
  expect(
    await page.locator(".rngween-decor svg").count(),
  ).toBeGreaterThanOrEqual(12);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon-halloween.svg",
  );
  await expect(page.locator(".rngween-banner")).toHaveCount(0);
  expect(clock.calls()).toBeGreaterThan(0);
});

test("a review date that cannot be verified still cannot grant an aura", async ({
  page,
}) => {
  const clock = await reviewClock(page);
  await seedProgress(
    page,
    withAllFragments({
      tasks: {
        ...emptyTasks(),
        rngween: {
          ...emptyRngween(),
          counts: { ...emptyRngween().counts, rolls: 300 },
        },
      },
    }),
  );
  await page.goto("/tasks/rngween");
  const reward = page.getByRole("button", {
    name: "Collect Jack-o'-Glow",
    exact: true,
  });
  await expect(reward).toBeEnabled();
  clock.set(null);
  await reward.click();
  await expect(page.getByRole("alert")).toContainText(
    "Connect to the website to verify RNGween availability",
  );
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    PROGRESS_KEY,
  );
  expect(saved.owned).toEqual([]);
  expect(saved.tasks.rngween.earned).toEqual([]);
});

test("the review clock restores the ordinary theme and favicon after the seasonal window", async ({
  page,
}) => {
  const clock = await reviewClock(page);
  await page.goto("/tasks/rngween");
  await expect(page.locator(".rngween-event")).toBeVisible();
  clock.set(ended);
  await page.evaluate(async () => {
    await (await import("/src/season-clock.js")).refreshSeasonClock();
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator(".rngween-event, .rngween-decor")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
});
