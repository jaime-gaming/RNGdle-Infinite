import { test, expect } from "@playwright/test";
import { seedProgress } from "./helpers/progress.js";
import { waitForApp } from "./helpers/app.js";

const roll = {
  ok: true,
  rollId: "cloud-roll-123",
  profileId: "test-profile",
  numbers: [123456],
  drawCount: 1,
  timing: { rollMS: 45000, cooldownMS: 60000 },
  armedSkills: [],
  firedSkills: [],
  flywheel: null,
  security: { status: "clear", message: "" },
};

test.beforeEach(async ({ page }) => {
  await seedProgress(page);
  await page.goto("/");
  await waitForApp(page);
  await page.evaluate(async () => {
    const client = await import("/src/game-authority-client.js");
    client.setGameTokenSource(async (userId) => ({
      uid: userId,
      getIdToken: async () => "fake-token",
    }));
  });
});

test("status recovery ignores error envelopes and unknown security states", async ({
  page,
}) => {
  for (const [status, body] of [
    [503, { ok: false, security: { status: "clear" } }],
    [200, { ok: false, security: { status: "clear" } }],
    [200, { ok: true, security: { status: "unknown" } }],
    [200, { ok: true, security: { status: "clear", message: {} } }],
  ]) {
    await page.route("**/api/game/status", (route) =>
      route.fulfill({ status, json: body }),
    );
    const result = await page.evaluate(async () => {
      const { requestGameStatus } =
        await import("/src/game-authority-client.js");
      let callbacks = 0;
      const security = await requestGameStatus("account-a", () => callbacks++);
      return { security, callbacks };
    });
    expect(result).toEqual({ security: null, callbacks: 0 });
    await page.unroute("**/api/game/status");
  }
});

test("a restricted account remains a decision, not an outage", async ({
  page,
}) => {
  await page.route("**/api/game/status", (route) =>
    route.fulfill({
      status: 403,
      json: {
        ok: false,
        code: "cloud-restricted",
        security: { status: "restricted", message: "Paused" },
      },
    }),
  );
  const security = await page.evaluate(async () =>
    (await import("/src/game-authority-client.js")).requestGameStatus(
      "account-a",
    ),
  );
  expect(security.status).toBe("restricted");
});

test("status requests are bounded so an unresponsive Worker cannot hold recovery forever", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const timeout = AbortSignal.timeout;
    const budgets = [];
    AbortSignal.timeout = (ms) => {
      budgets.push(ms);
      return AbortSignal.abort();
    };
    try {
      const security = await (
        await import("/src/game-authority-client.js")
      ).requestGameStatus("account-a");
      return { security, budgets };
    } finally {
      AbortSignal.timeout = timeout;
    }
  });
  expect(result).toEqual({ security: null, budgets: [15000] });
});

test("invalid roll timing and skills never commit or update security and keep the retry ID", async ({
  page,
}) => {
  let requestId;
  for (const change of [
    { timing: { rollMS: -1, cooldownMS: 60000 } },
    { timing: { rollMS: 45000, cooldownMS: -1 } },
    { timing: { rollMS: 45000, cooldownMS: Number.MAX_SAFE_INTEGER } },
    { rollId: "" },
    { armedSkills: ["not-a-skill"] },
    { firedSkills: ["not-armed"] },
    { numbers: [1000001] },
  ]) {
    await page.route("**/api/game/roll", (route) =>
      route.fulfill({ json: { ...roll, ...change } }),
    );
    const result = await page.evaluate(async () => {
      const { requestServerRoll, GAME_REQUEST_KEY } =
        await import("/src/game-authority-client.js");
      let callbacks = 0;
      let code;
      try {
        await requestServerRoll("account-a", "test-profile", () => callbacks++);
      } catch (error) {
        code = error.code;
      }
      return {
        code,
        callbacks,
        requestId: JSON.parse(sessionStorage.getItem(GAME_REQUEST_KEY))
          .requestId,
      };
    });
    expect(result.code).toBe("invalid-game-response");
    expect(result.callbacks).toBe(0);
    requestId ??= result.requestId;
    expect(result.requestId).toBe(requestId);
    await page.unroute("**/api/game/roll");
  }
});

test("a failed roll request cannot clear a previous restriction through its error body", async ({
  page,
}) => {
  await page.route("**/api/game/roll", (route) =>
    route.fulfill({
      status: 503,
      json: {
        ok: false,
        code: "game-security-unavailable",
        security: { status: "clear" },
      },
    }),
  );
  const callbacks = await page.evaluate(async () => {
    const { requestServerRoll } = await import("/src/game-authority-client.js");
    let callbacks = 0;
    try {
      await requestServerRoll("account-a", "test-profile", () => callbacks++);
    } catch {}
    return callbacks;
  });
  expect(callbacks).toBe(0);
});
