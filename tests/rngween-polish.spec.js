import { emptyRngweenWorld } from "../src/rngween-world-zones.js";
import { test, expect } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { mockSeasonClock } from "./helpers/season-clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { evaluate } from "./helpers/index.js";
import {
  PROGRESS_KEY,
  emptyProgress,
  parseAndRepairProgress,
  applyProgress,
} from "../src/progress.js";
import {
  defaultSettings,
  parseSettings,
  SETTINGS_KEY,
} from "../src/settings.js";
import { auraProducts, shopProducts } from "../src/shop-data.js";
import { validGoal } from "../src/gameplay-loop.js";
import { RNGWEEN_MISSIONS, RNGWEEN_WORLD_SKIN } from "../src/rngween.js";
import {
  RNGWEEN_LIMITED_ITEMS,
  RNGWEEN_SKILL,
  RNGWEEN_WORLD_KEY,
  emptyRngweenLimited,
  rngweenWorldUnlocked,
} from "../src/rngween-limited.js";
import { reaperDialogue } from "../src/rngween-reaper.js";
import { sandboxProgress } from "../tools/sandbox-progress.mjs";
import { unlockedRngweenPreview } from "../tools/rngween-preview-data.mjs";
import { runInNewContext } from "node:vm";

const active = Date.UTC(2026, 9, 26, 12);
const expired = Date.UTC(2026, 10, 4);
const SIX = [88125, 375660, 861456, 90750, 577281, 1000000];
const fullTasks = unlockedRngweenPreview().progress.tasks;
const account = (patch = {}) => ({
  ...emptyProgress(),
  profile: testProfile,
  ...patch,
});
const wallet = (pumpkoins = 2000, patch = {}) =>
  account({
    rngweenLimited: { ...emptyRngweenLimited(), pumpkoins },
    ...patch,
  });
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROGRESS_KEY);

async function startMulti(
  page,
  { aura = "hexbound", count = 6, motion = "reduce" } = {},
) {
  await mockSeasonClock(page, active);
  await page.emulateMedia({ reducedMotion: motion });
  await page.addInitScript(() => localStorage.setItem("rng-theme", "dark"));
  const skills =
    count === 2
      ? ["bedrock"]
      : count === 4
        ? ["triptych"]
        : [RNGWEEN_SKILL.id, "twice"];
  const draws = count === 2 ? [777777, 1000000] : SIX.slice(-count);
  await seedProgress(page, {
    owned: [
      ...auraProducts.map((item) => item.id),
      ...skills,
      "quickwind-1",
      "quickwind-2",
      "quickwind-3",
      "quickwind-4",
    ],
    equipped: aura,
    skills,
    equippedSkills: skills,
    skillCharge: { bedrock: 6, triptych: 6, [RNGWEEN_SKILL.id]: 7, twice: 7 },
    rngweenLimited: { ...emptyRngweenLimited(), bought: [RNGWEEN_SKILL.id] },
  });
  await mockRandom(page, draws);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(page.locator(".draw-panel")).toHaveCount(count);
  await page.clock.runFor(11000);
  await expect(page.locator(".draw-stage")).toHaveClass(/is-decided/);
  return draws;
}

async function auditAuraPanels(page, aura, draws) {
  const boxes = page.locator(".draw-box");
  await expect(boxes).toHaveCount(draws.length);
  for (const box of await boxes.all()) {
    await expect(box).toHaveAttribute("data-cosmetic", aura);
    await expect(box).toHaveAttribute("data-aura-layout", "contained");
  }
  const geometry = await boxes.evaluateAll((nodes) =>
    nodes.map((box) => {
      const r = (node) => node.getBoundingClientRect().toJSON();
      const scene = box.querySelector(".box-cosmetic");
      const content = box.querySelector(".number-box-content");
      const crest = box.querySelector(".aura-crest");
      const pick = box.closest(".draw-pick");
      const b = r(box);
      return {
        box: b,
        head: r(pick.querySelector(".draw-panel-head")),
        ep: r(pick.querySelector(".draw-ep")),
        badges: r(pick.querySelector(".draw-badges")),
        hint: r(pick.querySelector(".draw-panel-more")),
        crest: crest ? r(crest) : null,
        scene: r(scene),
        overflow: getComputedStyle(scene).overflow,
        decorativeZ: getComputedStyle(scene).zIndex,
        inkZ: getComputedStyle(content).zIndex,
        safeHit: pick.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        ),
        pointer: getComputedStyle(scene).pointerEvents,
      };
    }),
  );
  for (const g of geometry) {
    expect(g.overflow).toMatch(/clip|hidden/);
    expect(Number(g.decorativeZ)).toBeLessThan(Number(g.inkZ));
    expect(g.pointer).toBe("none");
    expect(g.safeHit).toBe(true);
    expect(g.scene.top).toBeGreaterThanOrEqual(g.head.bottom);
    expect(g.scene.bottom).toBeLessThanOrEqual(g.ep.top);
    expect(g.badges.bottom).toBeLessThanOrEqual(g.hint.top);
    if (g.crest) {
      expect(g.crest.top).toBeGreaterThanOrEqual(g.box.top);
      expect(g.crest.bottom).toBeLessThanOrEqual(g.box.bottom);
      expect(g.crest.left).toBeGreaterThanOrEqual(g.box.left);
      expect(g.crest.right).toBeLessThanOrEqual(g.box.right);
    }
  }
  expect(
    (await page.locator(".draw-digits").allTextContents()).map((text) =>
      text.replace(/\s/g, ""),
    ),
  ).toEqual(draws.map(String));
  expect(await page.locator(".draw-ep").allTextContents()).toEqual(
    draws.map(
      (number) => `${evaluate(number).totalEP.toLocaleString("en-US")} EP`,
    ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const scenario of [
  { count: 2, aura: "orbit", width: 340, height: 740 },
  { count: 4, aura: "phantom-veil", width: 390, height: 844 },
  { count: 6, aura: "hexbound", width: 340, height: 740 },
  {
    count: 6,
    aura: "blood-moon",
    width: 760,
    height: 740,
    motion: "no-preference",
  },
  { count: 6, aura: "singularity", width: 1280, height: 900 },
]) {
  test(`${scenario.count} draws with ${scenario.aura} stay readable and clickable at ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    const draws = await startMulti(page, scenario);
    await auditAuraPanels(page, scenario.aura, draws);
    const before = await saved(page);
    await page.locator(".draw-pick").first().click();
    const detail = page
      .locator(".draw-detail .number-box, .artifact-stage .number-box")
      .filter({ visible: true })
      .first();
    await expect(detail).toHaveAttribute("data-cosmetic", scenario.aura);
    await expect(detail).not.toHaveAttribute("data-aura-layout", "contained");
    expect((await saved(page)).balance).toBe(before.balance);
  });
}

test("every owned aura can be equipped during a six-number roll without changing any number, rank, score or wallet", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const draws = await startMulti(page);
  const before = await saved(page);
  const tiers = await page
    .locator(".draw-box")
    .evaluateAll((nodes) => nodes.map((box) => box.dataset.tier));
  for (const aura of auraProducts) {
    if (aura.id !== (await saved(page)).equipped) {
      await page
        .locator(".header")
        .getByRole("button", { name: "Shop", exact: true })
        .click();
      await page.locator('.shop-jump [data-shelf="auras"]').click();
      await page.locator(`[data-family="${aura.family}"]`).first().click();
      await page
        .locator(`[data-product="${aura.id}"]`)
        .getByRole("button", { name: "Equip aura", exact: true })
        .click();
      await page
        .locator(".header")
        .getByRole("button", { name: "RNGdle Infinite home", exact: true })
        .click();
    }
    await expect(page.locator(".draw-stage")).toBeVisible();
    await auditAuraPanels(page, aura.id, draws);
    await page.setViewportSize({ width: 340, height: 740 });
    await page.clock.runFor(20);
    await auditAuraPanels(page, aura.id, draws);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.runFor(20);
    expect(
      await page
        .locator(".draw-box")
        .evaluateAll((nodes) => nodes.map((box) => box.dataset.tier)),
    ).toEqual(tiers);
  }
  const after = await saved(page);
  expect(after.history.filter((entry) => entry.type !== "equip")).toEqual(
    before.history,
  );
  expect(after.balance).toBe(before.balance);
  expect(after.rngweenLimited.pumpkoins).toBe(before.rngweenLimited.pumpkoins);
});

test("the key is Limited Shop stock, never ordinary EP stock or a goal; Hexbound remains a world-only reward", () => {
  expect(RNGWEEN_LIMITED_ITEMS).toContain(RNGWEEN_WORLD_KEY);
  expect(RNGWEEN_LIMITED_ITEMS).not.toContain(RNGWEEN_WORLD_SKIN);
  expect(shopProducts.some((item) => item.id === RNGWEEN_WORLD_KEY.id)).toBe(
    false,
  );
  expect(validGoal(RNGWEEN_WORLD_KEY.id)).toBe(false);
  for (const type of ["buy", "buy-rngween-limited"])
    expect(() =>
      applyProgress(wallet(), { type, id: "hexbound", at: active }),
    ).toThrow();
});

test("Shop confirms the same saved key, spends once and opens the Reaper with passage already granted", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page, wallet());
  await page.goto("/shop/limited");
  const key = page.locator(`[data-limited-item="${RNGWEEN_WORLD_KEY.id}"]`);
  await expect(key.getByRole("heading")).toHaveText("Valley Challenge Key");
  await key
    .getByRole("button", {
      name: "Buy Valley Challenge Key for 2000 Pumpkoins",
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Buy a Valley Challenge Key?",
  });
  await expect(dialog).toContainText("no aura or Hexbound included");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(2000);
  await key
    .getByRole("button", {
      name: "Buy Valley Challenge Key for 2000 Pumpkoins",
    })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm purchase", exact: true })
    .click();
  await expect(key).toContainText("Valley key owned");
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(0);
  await page.reload();
  await key.getByRole("button", { name: "View World" }).click();
  const reaper = page.getByRole("dialog", { name: "The Reaper", exact: true });
  await expect(reaper).toBeVisible();
  await expect(reaper).toContainText("Your Valley key is ready");
  expect(
    (await saved(page)).history.filter(
      (entry) => entry.productId === RNGWEEN_WORLD_KEY.id,
    ),
  ).toHaveLength(1);
});

test("Shop does not sell an unnecessary challenge key when both distinct fragments are ready to forge for free", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  const p = wallet(2000, { tasks: fullTasks });
  p.rngweenLimited.world = {
    ...emptyRngweenWorld(),
    fragments: { graveyard: true, "haunted-house": true },
    rounds: { graveyard: 1, "haunted-house": 1, valley: 0 },
    visited: ["graveyard", "haunted-house"],
    wins: 2,
    streak: 2,
    bestStreak: 2,
  };
  await seedProgress(page, p);
  await page.goto("/shop/limited");
  const key = page.locator(`[data-limited-item="${RNGWEEN_WORLD_KEY.id}"]`);
  await expect(key).toContainText("Both fragments ready · forge for free");
  await expect(key.getByRole("button", { name: /^Buy/ })).toHaveCount(0);
  expect((await saved(page)).rngweenLimited.bought).not.toContain(
    RNGWEEN_WORLD_KEY.id,
  );
  await key.getByRole("button", { name: "View World" }).click();
  await expect(
    page.getByRole("dialog", { name: "The Reaper", exact: true }),
  ).toContainText("Forge your key for free inside the World");
});

test("a Shop key purchase still needs a fresh verified calendar and never charges on failure", async ({
  page,
}) => {
  const clock = await mockSeasonClock(page, active);
  await seedProgress(page, wallet());
  await page.goto("/shop/limited");
  await page
    .getByRole("button", {
      name: "Buy Valley Challenge Key for 2000 Pumpkoins",
    })
    .click();
  const before = await saved(page);
  clock.set(null);
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "verify RNGween availability",
  );
  expect(await saved(page)).toEqual(before);
});

test("unowned Hexbound has a Shop preview and a route to the Reaper, but no buy or equip action", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(page, wallet());
  await page.goto("/shop/limited");
  const prize = page.locator('[data-world-prize="hexbound"]');
  await expect(prize).toContainText("Find 6666 · never sold");
  await expect(prize.locator(".number-box")).toHaveAttribute(
    "data-cosmetic",
    "hexbound",
  );
  await expect(prize.getByRole("button", { name: /Buy|Equip/ })).toHaveCount(0);
  await prize.getByRole("button", { name: "Explore RNGween World" }).click();
  const reaper = page.getByRole("dialog", { name: "The Reaper", exact: true });
  await reaper.getByRole("button", { name: "What is Hexbound?" }).click();
  await expect(reaper).toContainText("cannot be bought");
  await expect(reaper).toContainText("6666");
  await reaper.getByRole("button", { name: "See Hexbound in Shop" }).click();
  await expect(page).toHaveURL(/\/shop\/limited$/);
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(2000);
});

test("earned Hexbound is equipped from its Shop reward card for free and remains in the owned aura collection", async ({
  page,
}) => {
  await mockSeasonClock(page, active);
  await seedProgress(
    page,
    wallet(2000, {
      owned: ["hexbound"],
      tasks: fullTasks,
      rngweenLimited: {
        ...emptyRngweenLimited(),
        pumpkoins: 2000,
        drawn: [6666],
        skinEarned: true,
        rewardedMissions: RNGWEEN_MISSIONS.map((mission) => mission.id),
      },
    }),
  );
  await page.goto("/shop/limited");
  const before = await saved(page);
  const prize = page.locator('[data-world-prize="hexbound"]');
  await prize
    .getByRole("button", { name: "Equip Hexbound", exact: true })
    .click();
  await expect(
    prize.getByRole("button", { name: "Hexbound equipped", exact: true }),
  ).toBeDisabled();
  const after = await saved(page);
  expect(after.equipped).toBe("hexbound");
  expect(after.balance).toBe(before.balance);
  expect(after.rngweenLimited).toEqual(before.rngweenLimited);
  await page
    .getByRole("button", { name: "Find The Reaper", exact: true })
    .click();
  const reaper = page.getByRole("dialog", { name: "The Reaper", exact: true });
  await reaper.getByRole("button", { name: "What is Hexbound?" }).click();
  await expect(reaper).toContainText("already unlocked Hexbound");
  await reaper.getByRole("button", { name: "See Hexbound in Shop" }).click();
  await expect(
    prize.getByRole("button", { name: "Hexbound equipped", exact: true }),
  ).toBeDisabled();
  await page.goto("/shop/auras/rngween");
  await expect(page.locator('[data-product="hexbound"]')).toBeVisible();
});

test("the Reaper's dialogue distinguishes calendar, progress, paid/free passage and an already earned world prize without mutating them", () => {
  const p = wallet();
  const before = JSON.stringify(p);
  expect(reaperDialogue(p, null).lines.join(" ")).toContain(
    "website's UTC date is unavailable",
  );
  expect(reaperDialogue(p, active - 86400000 * 6).lines.join(" ")).toContain(
    "opens October 21",
  );
  expect(reaperDialogue(p, expired).lines.join(" ")).toContain(
    "The event closed",
  );
  expect(reaperDialogue(p, active).lines.join(" ")).toContain(
    "open to everyone",
  );
  expect(
    reaperDialogue(p, Date.UTC(2026, 10, 2), "trials").lines.join(" "),
  ).toContain("aura trials ended");
  expect(reaperDialogue(p, active, "reward").lines.join(" ")).toContain(
    "cannot be bought",
  );
  expect(reaperDialogue(p, active, "trials").trials).toHaveLength(4);
  const won = unlockedRngweenPreview().progress;
  expect(reaperDialogue(won, active).lines.join(" ")).toContain(
    `revealed ${won.rngweenLimited.drawn.length} numbers`,
  );
  expect(reaperDialogue(won, active, "reward").lines.join(" ")).toContain(
    "already unlocked Hexbound",
  );
  expect(JSON.stringify(p)).toBe(before);
});

test("the Reaper's trial and reward conversations fit a phone and report real progress", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSeasonClock(page, active);
  await seedProgress(
    page,
    wallet(2000, {
      tasks: {
        ...emptyProgress().tasks,
        rngween: {
          ...fullTasks.rngween,
          earned: [],
          counts: { rolls: 200, rare: 12, banked: 1000000, taskClaims: 0 },
        },
      },
    }),
  );
  await page.goto("/shop/limited");
  await page
    .getByRole("button", { name: "Find The Reaper", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "The Reaper", exact: true });
  await expect(dialog).toContainText("1 / 4 aura trials complete");
  await dialog.getByRole("button", { name: "What are the trials?" }).click();
  const trials = dialog.getByRole("list", { name: "Reaper trials" });
  await expect(trials.locator("li")).toHaveCount(4);
  await expect(trials).toContainText("12 / 40");
  await dialog.getByRole("button", { name: "What is Hexbound?" }).click();
  await expect(dialog).toContainText("cannot be bought");
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(340);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(740);
  await dialog.getByRole("button", { name: "Can I pass?" }).click();
  await expect(dialog).toContainText("1 / 4 aura trials complete");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("the mobile rack folds persistently, closes old fans and never changes charging, timings or Auto-Roll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 340, height: 740 });
  await mockSeasonClock(page, active);
  const fixture = unlockedRngweenPreview().progress;
  await seedProgress(page, { ...fixture, cooldownUntil: Date.now() + 60000 });
  await page.goto("/");
  const rack = page.getByRole("group", { name: "Skills", exact: true });
  const auto = rack.getByRole("switch", { name: "Auto-Roll" });
  await auto.click();
  await expect(auto).toHaveAttribute("aria-checked", "true");
  await rack.getByRole("button", { name: /^Pet group/ }).click();
  await expect(rack.locator(".skill-stack-members")).toBeVisible();
  const before = await saved(page);
  const expanded = await rack.boundingBox();
  await rack
    .getByRole("button", { name: "Collapse skills", exact: true })
    .click();
  await expect(
    rack.getByRole("button", { name: "Expand skills", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(rack.locator(".skill-bar-items")).not.toBeVisible();
  const folded = await rack.boundingBox();
  expect(folded.width).toBeLessThan(expanded.width);
  expect(folded.height).toBeLessThan(expanded.height);
  expect(await saved(page)).toEqual(before);
  await rack
    .getByRole("button", { name: "Expand skills", exact: true })
    .click();
  await expect(auto).toHaveAttribute("aria-checked", "true");
  await expect(rack.locator(".skill-stack-members")).not.toBeVisible();
  await auto.click();
  await rack
    .getByRole("button", { name: "Collapse skills", exact: true })
    .click();
  await page.reload();
  await expect(
    rack.getByRole("button", { name: "Expand skills", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(rack.locator(".skill-bar-items")).toBeVisible();
  await expect(
    rack.getByRole("button", { name: "Expand skills", exact: true }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 340, height: 740 });
  await expect(rack.locator(".skill-bar-items")).not.toBeVisible();
  await rack
    .getByRole("button", { name: "Expand skills", exact: true })
    .click();
  const geometry = await rack.evaluate((node) => ({
    rack: node.getBoundingClientRect().toJSON(),
    number: document
      .querySelector(".question-number")
      .getBoundingClientRect()
      .toJSON(),
  }));
  expect(geometry.number.top).toBeGreaterThan(geometry.rack.bottom);
});

test("folding is a validated presentation preference, defaulting to expanded and synchronized across mobile tabs", async ({
  page,
  context,
}) => {
  expect(defaultSettings.skillBarCollapsed).toBe(false);
  expect(
    parseSettings(JSON.stringify({ skillBarCollapsed: "true" }))
      .skillBarCollapsed,
  ).toBe(false);
  expect(
    parseSettings(JSON.stringify({ skillBarCollapsed: true }))
      .skillBarCollapsed,
  ).toBe(true);
  await mockSeasonClock(page, active);
  await seedProgress(page, unlockedRngweenPreview().progress);
  const other = await context.newPage();
  try {
    await mockSeasonClock(other, active);
    for (const p of [page, other]) {
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto("/");
    }
    await page
      .getByRole("button", { name: "Collapse skills", exact: true })
      .click();
    await expect(
      other.getByRole("button", { name: "Expand skills", exact: true }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: "Expand skills", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Collapse skills", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("the unlocked sandbox fixture is opt-in, cleanly parsed, six-draw safe and never overwrites or refills a profile", async () => {
  expect(sandboxProgress(false)).toBeNull();
  const plugin = sandboxProgress(true);
  expect(plugin.apply).toBe("serve");
  const [tag] = await plugin.transformIndexHtml.handler();
  const fixture = unlockedRngweenPreview();
  expect(
    parseAndRepairProgress(JSON.stringify(fixture.progress)).repairs,
  ).toEqual([]);
  expect(
    rngweenWorldUnlocked(
      fixture.progress.tasks,
      fixture.progress.rngweenLimited,
    ),
  ).toBe(true);
  expect(fixture.progress.rngweenLimited.rewardedMissions).toHaveLength(4);
  expect(
    Object.values(fixture.progress.rngweenLimited.world.mini).reduce(
      (sum, stats) => sum + Object.keys(stats.counts).length,
      0,
    ),
  ).toBe(39);
  expect(fixture.progress.owned).toContain("hexbound");
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  runInNewContext(tag.children, { localStorage });
  expect(JSON.parse(values.get(PROGRESS_KEY)).profile.username).toBe(
    "RngweenSandbox",
  );
  const changed = JSON.parse(values.get(PROGRESS_KEY));
  changed.rngweenLimited.pumpkoins = 7;
  values.set(PROGRESS_KEY, JSON.stringify(changed));
  runInNewContext(tag.children, { localStorage });
  expect(JSON.parse(values.get(PROGRESS_KEY)).rngweenLimited.pumpkoins).toBe(7);
  values.set(PROGRESS_KEY, JSON.stringify({ profile: testProfile }));
  values.set(SETTINGS_KEY, "keep this preference");
  runInNewContext(tag.children, { localStorage });
  expect(JSON.parse(values.get(PROGRESS_KEY)).profile).toEqual(testProfile);
  expect(values.get(SETTINGS_KEY)).toBe("keep this preference");
});

test("the generated sandbox seed really opens every event reward, preserves spending and is absent in ordinary development", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("script[data-sandbox-unlocked]")).toHaveCount(0);
  const [tag] = await sandboxProgress(true).transformIndexHtml.handler();
  await page.route(new URL("/", page.url()).href, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        "</head>",
        `<script data-sandbox-unlocked="true">${tag.children}</script></head>`,
      ),
    });
  });
  await page.evaluate(() => localStorage.clear());
  await mockSeasonClock(page, active, { introSeen: false });
  await page.reload();
  const intro = page.getByRole("dialog", { name: "Welcome to RNGween" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Let's play", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-season", "rngween");
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(50000);
  await page.goto("/tasks");
  await expect(
    page.getByRole("list", { name: "Halloween tasks" }).locator("li"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("list", { name: "Halloween tasks" }),
  ).toContainText("Collected");
  await page.goto("/shop/limited");
  await expect(
    page.locator('[data-limited-item="rngween-world-key"]'),
  ).toContainText("Valley key owned");
  await expect(page.locator('[data-world-prize="hexbound"]')).toContainText(
    "Hexbound equipped",
  );
  await page.evaluate((key) => {
    const p = JSON.parse(localStorage.getItem(key));
    p.rngweenLimited.pumpkoins = 123;
    localStorage.setItem(key, JSON.stringify(p));
  }, PROGRESS_KEY);
  await page.goto("/");
  await expect(intro).not.toBeVisible();
  expect((await saved(page)).rngweenLimited.pumpkoins).toBe(123);
});
