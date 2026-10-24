import { test, expect } from "./helpers/clock.js";
import { pauseClockAt } from "./helpers/clock.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { withAllFragments } from "./helpers/world-roll.js";
import { applyProgress, emptyProgress, PROGRESS_KEY } from "../src/progress.js";
import { emptyTasks } from "../src/tasks.js";
import { emptyRngween } from "../src/rngween.js";
import { evaluate } from "./helpers/index.js";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
});

const active = Date.parse("2026-10-26T12:00:00Z");
const ended = Date.parse("2026-11-04T12:00:00Z");
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

async function settle(page) {
  for (let i = 0; i < 70; i++) {
    if (
      (await page.locator(".roll-experience").getAttribute("data-settled")) ===
      "true"
    )
      return;
    await page.clock.runFor(250);
  }
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
}

test("calendar eligibility is independent of a roll's device timestamp", () => {
  const action = {
    type: "complete",
    id: "clock-test",
    result: evaluate(861456),
    cooldownUntil: 0,
  };
  const earlyDevice = Date.parse("2025-01-01T00:00:00Z");
  const during = applyProgress(emptyProgress(), {
    ...action,
    at: earlyDevice,
    rngweenAt: active,
  });
  expect(during.tasks.rngween.counts.rolls).toBe(1);
  const closed = applyProgress(emptyProgress(), {
    ...action,
    at: active,
    rngweenAt: ended,
  });
  expect(closed.tasks.rngween.counts.rolls).toBe(0);
  const unknown = applyProgress(emptyProgress(), {
    ...action,
    at: active,
    rngweenAt: null,
  });
  expect(unknown.balance).toBe(evaluate(861456).totalEP);
  expect(unknown.tasks.rngween.counts.rolls).toBe(0);
  const ready = {
    ...emptyProgress(),
    tasks: {
      ...emptyTasks(),
      rngween: {
        ...emptyRngween(),
        counts: { ...emptyRngween().counts, rolls: 300 },
      },
    },
  };
  for (const time of [ended, null])
    expect(() =>
      applyProgress(ready, {
        type: "claim-rngween-aura",
        id: "jack-o-glow",
        at: active,
        rngweenAt: time,
      }),
    ).toThrow();
});

test("real online rolls follow the website date; a rewound player clock never reopens RNGween", async ({
  page,
}) => {
  await pauseClockAt(page, new Date("2030-02-15T12:00:00Z"));
  const website = await mockSeasonClock(page, active);
  await mockRandom(page, [861456]);
  await seedProgress(page, {
    owned: ["quickwind-1", "quickwind-2", "quickwind-3", "quickwind-4"],
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await settle(page);
  expect((await saved(page)).tasks.rngween.counts.rolls).toBe(1);
  await page.clock.runFor(120000);
  website.set(ended);
  await page.evaluate(async () => {
    const { refreshSeasonClock } = await import("/src/season-clock.js");
    await refreshSeasonClock();
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-season",
    "rngween",
  );
  await page.clock.setFixedTime(new Date(active));
  await expect(
    page.getByRole("button", { name: "ROLL AGAIN", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).pendingRoll?.id)
    .toBeTruthy();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await settle(page);
  const progress = await saved(page);
  expect(progress.receipts).toHaveLength(2);
  expect(progress.tasks.rngween.counts.rolls).toBe(1);
});

test("a claim waiting for website time cannot grant an aura to a replacement account", async ({
  page,
}) => {
  const tasks = {
    ...emptyTasks(),
    rngween: {
      ...emptyRngween(),
      counts: { ...emptyRngween().counts, rolls: 300 },
    },
  };
  await mockSeasonClock(page, active);
  await seedProgress(page, withAllFragments({ tasks }));
  await page.goto("/tasks/rngween");
  const claim = page.getByRole("button", {
    name: "Collect Jack-o'-Glow",
    exact: true,
  });
  await expect(claim).toBeEnabled();
  let resume;
  let waiting = false;
  const gate = new Promise((resolve) => {
    resume = resolve;
  });
  await page.route("**/favicon.svg?season-clock=*", async (route) => {
    waiting = true;
    await gate;
    await route.fulfill({
      status: 200,
      headers: { date: new Date(active).toUTCString() },
      body: "",
    });
  });
  try {
    await claim.click();
    await expect.poll(() => waiting).toBe(true);
    const replacement = {
      ...emptyProgress(),
      tasks,
      profile: {
        id: "replacement-account",
        username: "OtherTester",
        createdAt: active,
      },
    };
    await page.evaluate(
      ({ key, next }) => {
        const value = JSON.stringify(next);
        localStorage.setItem(key, value);
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: value,
            storageArea: localStorage,
          }),
        );
      },
      { key: PROGRESS_KEY, next: replacement },
    );
    resume();
    await expect(page.getByRole("alert")).toContainText(
      "The previous action was cancelled",
    );
    expect((await saved(page)).profile.id).toBe("replacement-account");
    expect((await saved(page)).owned).toEqual([]);
    expect((await saved(page)).tasks.rngween.earned).toEqual([]);
  } finally {
    resume();
  }
});
