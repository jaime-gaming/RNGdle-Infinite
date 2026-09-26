import { test, expect } from "./helpers/clock.js";
import fs from "node:fs";
import { emptyProgress } from "../src/progress.js";
import { seedProgress } from "./helpers/progress.js";

// Ink shadows in this codebase are black or the #101828 blue-black (a channel
// spread of 24). A coloured glow — the pink/violet pair the main action used to
// wear — spreads past 100, so this line separates the two cleanly.
const INK_SPREAD = 48;

const funded = {
  ...emptyProgress(),
  balance: 2412500,
  totalEarned: 50000000,
  owned: ["quickwind-1"],
};

// Colours that make up a shadow, as numbers: a decorative glow is any channel
// that is not grey (and, being a shadow, not fully transparent).
function shadowInks(value) {
  return [...String(value).matchAll(/rgba?\(([^)]+)\)/g)]
    .map((match) => match[1].split(/[,/]/).map((n) => Number(n.trim())))
    .filter(([, , , alpha = 1]) => alpha > 0.01);
}

test("filled actions are ink blocks: one height, no glow, and only as wide as their label", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/about");

  const actions = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      const room = el.parentElement.getBoundingClientRect().width;
      return {
        text: el.textContent.trim().slice(0, 20),
        w: Math.round(r.width),
        h: Math.round(r.height),
        share: +(r.width / room).toFixed(2),
        shadow: getComputedStyle(el).boxShadow,
        before: getComputedStyle(el, "::before").content,
      };
    };
    const row = [...document.querySelectorAll(".about-actions button")];
    return { row: row.map(box), room: 720 };
  });

  // Two buttons side by side: same height, each sized to its own words. A
  // filled action stretched across the page reads as a banner.
  expect(actions.row).toHaveLength(2);
  expect(actions.row[0].h).toBe(actions.row[1].h);
  for (const button of actions.row)
    expect(button.w, `${button.text} width`).toBeLessThan(actions.room * 0.5);
  for (const button of actions.row) {
    // Whatever it sits on, a shadow is a shadow: grey, never a coloured halo.
    for (const [r, g, b] of shadowInks(button.shadow))
      expect(
        Math.max(r, g, b) - Math.min(r, g, b),
        `${button.text} shadow ${button.shadow}`,
      ).toBeLessThan(INK_SPREAD);
  }

  // The one deliberately full-width action is the sign-up form's submit.
  await page.goto("/profile");
  const submit = await page.evaluate(() => {
    const el = document.querySelector(".profile-page form .primary-button");
    const r = el.getBoundingClientRect();
    return {
      share: +(
        r.width / el.parentElement.getBoundingClientRect().width
      ).toFixed(2),
      h: Math.round(r.height),
    };
  });
  expect(submit.share).toBe(1);
  expect(submit.h).toBeGreaterThanOrEqual(42);
});

test("the main action is one solid plate, and its cooldown bar stays inside it", async ({
  page,
}) => {
  await seedProgress(page, {
    ...funded,
    balance: 0,
    totalEarned: 0,
    owned: [],
  });
  await page.goto("/");
  // Not a roll in flight: "LOADING ROLL DATA…" paints the button in its
  // cooling style, which is a state, not the idle plate under test.
  const start = page.getByRole("button", { name: "GENERATE", exact: true });
  await expect(start).toBeEnabled();
  const idle = await page.evaluate(() => {
    const el = document.querySelector(".generate");
    const cs = getComputedStyle(el);
    return {
      before: getComputedStyle(el, "::before").content,
      after: getComputedStyle(el, "::after").content,
      animation: cs.animationName,
      shadow: cs.boxShadow,
    };
  });
  // No painted ring behind the button and no cycling colour under it.
  expect(idle.before).toBe("none");
  expect(idle.after).toBe("none");
  expect(idle.animation).toBe("none");
  for (const [r, g, b] of shadowInks(idle.shadow))
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(INK_SPREAD);

  // The cooldown track runs inside the plate: at the very edge its rounded
  // corners poked past the button's own radius and read as a grey notch.
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await start.click();
  await page.clock.fastForward(44000);
  await page.clock.runFor(1200);
  const rail = await page.evaluate(() => {
    const button = document.querySelector(".generate").getBoundingClientRect();
    const fill = document
      .querySelector(".cooldown-fill")
      .getBoundingClientRect();
    return {
      left: +(fill.left - button.left).toFixed(1),
      right: +(button.right - fill.right).toFixed(1),
      bottom: +(button.bottom - fill.bottom).toFixed(1),
      label: document.querySelector(".generate").textContent.trim(),
    };
  });
  expect(rail.label).toContain("NEXT ROLL IN");
  expect(rail.left).toBeGreaterThan(2);
  expect(rail.right).toBeGreaterThan(2);
  expect(rail.bottom).toBeGreaterThan(2);
});

test("nothing decorative loops forever on the roll screen", async ({
  page,
}) => {
  await seedProgress(page, funded);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "GENERATE", exact: true }),
  ).toBeEnabled();
  const loops = await page.evaluate(() =>
    [...document.querySelectorAll(".roll-experience *")]
      .map((el) => ({
        cls: el.className,
        animation: getComputedStyle(el).animation,
      }))
      .filter((row) => row.animation.includes("infinite")),
  );
  // Nothing on the roll screen breathes on its own: the plate is the number,
  // and it holds still until a roll is asked for. (The changelog's unseen dot
  // lives in the header and is a notification, not decoration.)
  expect(loops).toEqual([]);

  const roll = fs.readFileSync("src/roll.css", "utf8");
  const base = fs.readFileSync("src/styles.css", "utf8");
  expect(roll).not.toContain("cta-ring-cycle");
  expect(roll).not.toContain("artifact-breathing");
  expect(roll).toContain("artifact-settle");
  // The plate settles once and stops; the reveal keeps its pop animations.
  expect(roll).toContain(".number-artifact.is-breathing {");
  expect(base).not.toContain("#cc68ed");
  expect(base).not.toContain("#666ee2");
});
