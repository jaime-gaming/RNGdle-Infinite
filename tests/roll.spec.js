import { test, expect } from "@playwright/test";
import {
  buildRevealTimeline,
  buildReferenceTimeline,
} from "../src/roll-timeline.js";
import {
  groupResultBadges,
  badgeMetadata,
  buildShareText,
} from "../src/roll-data.js";

import { sampleResults, evaluate } from "./helpers/index.js";
import { seedProgress } from "./helpers/progress.js";
import { showRoll, mockRandom, startRoll } from "./helpers/random-roll.js";

test("reference timings and sample-score invariants", () => {
  const timeline = buildReferenceTimeline(6, 10);
  expect(timeline.digitTimes).toEqual([2000, 3000, 4040, 5200, 6560, 8200]);
  expect(timeline.badgeTimes[0]).toBe(9200);
  expect(timeline.rarity - timeline.summary).toBe(1000);
  expect(timeline.stats - timeline.rarity).toBe(250);
  expect(timeline.end - timeline.stats).toBe(4500);
  expect(buildReferenceTimeline(7, 3).digitTimes).toHaveLength(7);
  expect(sampleResults).toHaveLength(50);
  for (const sample of sampleResults) {
    const groups = groupResultBadges(sample.badges);
    expect(groups.reduce((s, g) => s + g.lead.ep, 0)).toBe(sample.totalEP);
    expect(groups.reduce((s, g) => s + 1 + g.rest.length, 0)).toBe(
      sample.badges.length,
    );
    for (const badge of sample.badges)
      expect(badgeMetadata.has(badge.id)).toBe(true);
  }
});

test("digit nodes persist and progressively settle; reduced motion finishes without spoilers", async ({
  page,
}) => {
  await startRoll(page, 1337);
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "data-tier",
    "neutral",
  );
  await expect(page.locator(".roll-vignette")).toHaveClass(/is-visible/);
  await page.locator('[data-slot="2"]').evaluate((el) => {
    el.dataset.identity = "stable";
  });
  const t = buildRevealTimeline(4, 14);
  await page.clock.runFor(2050 * t.scale);
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "data-revealed",
    "1",
  );
  await expect(page.locator('[data-slot="0"]')).toHaveClass(/is-blank/);
  await page.clock.runFor(2100 * t.scale);
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "data-revealed",
    "3",
  );
  await expect(page.locator('[data-slot="2"]')).toHaveText("1");
  await expect(page.locator('[data-slot="2"]')).toHaveAttribute(
    "data-identity",
    "stable",
  );
  await expect(page.locator(".result-rank")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(page.locator(".roll-ep")).toHaveText("100,177,458 EP");
  await expect(page.locator(".rank-pill")).toHaveText("mythic");
  await expect(page.locator(".result-badge-group")).toHaveCount(14);
  await expect(page.locator(".superseded-badge")).toHaveCount(3);
  await expect(page.locator(".badge-summary")).toHaveText("17 badges earned");
});

test("badges arrive lowest first; rank and percentile are gated until their beats", async ({
  page,
}) => {
  await startRoll(page, 103381);
  const sample = sampleResults.find((r) => r.number === 103381),
    groups = groupResultBadges(sample.badges);
  const t = buildRevealTimeline(6, groups.length);
  await page.clock.runFor(8300 * t.scale);
  await expect(page.locator(".roll-ep")).toHaveText("??? EP");
  await expect(page.locator(".result-badge-group")).toHaveCount(0);
  await expect(page.locator(".result-rank")).not.toBeVisible();
  await page.clock.runFor(1000 * t.scale);
  await expect(page.locator(".result-badge-group")).toHaveCount(1);
  await expect(page.locator(".result-badge-group")).toHaveAttribute(
    "data-badge-id",
    groups.at(-1).lead.id,
  );
  await page.clock.runFor(t.rarity - 9300 * t.scale + 75 * t.scale);
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "data-tier",
    "common",
  );
  await expect(page.locator(".share-button")).toBeVisible();
  await expect(page.locator(".result-rank")).not.toBeVisible();
  await page.clock.runFor(300 * t.scale);
  await expect(page.locator(".result-rank")).toBeVisible();
  await page.clock.runFor(4500 * t.scale);
  await expect(page.locator(".roll-vignette")).not.toHaveClass(/is-visible/);
  await expect(page.locator(".result-badge-group").first()).toHaveAttribute(
    "data-badge-id",
    groups[0].lead.id,
  );
});

test("completed rolls persist EP exactly once and enforce the saved cooldown", async ({
  page,
}) => {
  await seedProgress(page);
  await startRoll(page, 1337);
  await page.clock.runFor(buildRevealTimeline(4, 14).end + 20);
  await expect(page.locator(".session-total>span")).toHaveText(
    "100,177,458 EP",
  );
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /NEXT ROLL IN/ }),
  ).toBeDisabled();
  await page.clock.fastForward(60100);
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await page.keyboard.press("Space");
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await page.clock.runFor(buildRevealTimeline(4, 14).end + 20);
  await expect(page.locator(".session-total>span")).toHaveText(
    "200,354,916 EP",
  );
});

test("random rolls score zero, seven digits, and numbers outside the old sample set", async ({
  page,
}) => {
  await mockRandom(page, [0, 1000000, 123457]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  for (const [i, number] of [0, 1000000, 123457].entries()) {
    await page
      .getByRole("button", { name: i ? "ROLL AGAIN" : "GENERATE", exact: true })
      .click();
    await expect(page.locator(".artifact-digit:not(.is-blank)")).toHaveCount(
      String(number).length,
    );
    await expect(page.locator(".number-artifact")).toHaveAttribute(
      "aria-label",
      `Number ${number}`,
    );
    await expect(page.locator(".roll-ep")).toHaveText(
      `${evaluate(number).totalEP.toLocaleString("en-US")} EP`,
    );
    await page.clock.fastForward(60100);
  }
});

test("reduced motion skips the sequence, including under a changed preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(page.locator(".skip-reveal")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
});

test("share format and actual badge details", async ({ page, context }) => {
  const sample = evaluate(1337);
  expect(buildShareText(sample)).toContain("RNGdle Infinite 🎲 1337");
  expect(buildShareText(sample)).toContain("🟥 MYTHIC • Top <1%");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await showRoll(page, 1337);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied!", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    buildShareText(sample),
  );
  await page
    .locator('[data-badge-id="LEET_EXACT"] .result-badge-heading>button')
    .click();
  await expect(page.getByRole("dialog")).toContainText("100,000,100 EP");
  await expect(page.getByRole("dialog")).toContainText('Exactly "1337".');
});

test("all result tiers fit mobile, including a seven-digit result", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  const numbers = [
    1337, 103000, 103001, 103002, 103006, 103381, 103463, 1000000,
  ];
  await mockRandom(page, numbers);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  for (const [i, number] of numbers.entries()) {
    await page
      .getByRole("button", { name: i ? "ROLL AGAIN" : "GENERATE", exact: true })
      .click();
    await expect(page.locator(".number-artifact")).toHaveAttribute(
      "aria-label",
      `Number ${number}`,
    );
    await page.clock.fastForward(60100);
    await expect(page.locator(".roll-experience")).toHaveAttribute(
      "data-phase",
      "complete",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await page.locator(".result-badge-group").count()).toBeGreaterThan(
      0,
    );
  }
});

test("navigation does not discard an active reveal; dialogs and keys do not skip it", async ({
  page,
}) => {
  await startRoll(page, 1337);
  await page
    .getByRole("button", { name: "How to play", exact: true })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Badges", exact: true })
    .click();
  await expect(page.locator(".roll-view")).toBeHidden();
  await page.clock.runFor(buildRevealTimeline(4, 14).end + 20);
  await expect(page.locator(".badge-card")).toHaveCount(17);
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await expect(page.locator(".session-total>span")).toHaveText(
    "100,177,458 EP",
  );
});

test("a delayed clipboard response cannot mark a different roll as copied", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          new Promise((resolve) => {
            window.releaseClipboard = resolve;
          }),
      },
    });
  });
  await mockRandom(page, [1337, 604827]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "complete",
  );
  await page.clock.install();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.clock.fastForward(60100);
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect(page.locator(".number-artifact")).toHaveAttribute(
    "aria-label",
    "Number 604827",
  );
  await page.evaluate(async () => {
    window.releaseClipboard();
    await Promise.resolve();
  });
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copied!", exact: true }),
  ).toHaveCount(0);
});

test("a pending draw survives navigation without creating a duplicate roll", async ({
  page,
}) => {
  let release, seen;
  const gate = new Promise((r) => {
      release = r;
    }),
    requested = new Promise((r) => {
      seen = r;
    });
  await page.route("**/__test-release", async (route) => {
    seen();
    await gate;
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.route("**/src/roll.worker.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `const originalSend=self.postMessage.bind(self); self.postMessage=(message)=>{if(message.result) fetch('/__test-release').then(()=>originalSend(message));else originalSend(message);};\n${await response.text()}`,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await requested;
  await expect(
    page.getByRole("button", { name: "DRAWING…", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Badges", exact: true })
    .click();
  const replied = page.waitForResponse("**/__test-release");
  release();
  await replied;
  await page
    .getByRole("button", { name: "Back to rolling", exact: true })
    .click();

  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-phase",
    "digits",
  );
  await expect(page.locator(".number-artifact")).toHaveCount(1);
});
