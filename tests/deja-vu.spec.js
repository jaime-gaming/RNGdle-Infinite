import { test, expect } from "./helpers/clock.js";
import { mockRandom } from "./helpers/random-roll.js";
import { seedProgress } from "./helpers/progress.js";
import { evaluate } from "./helpers/index.js";
import { emptyProgress, applyProgress } from "../src/progress.js";
import { priorRollsOf, dejaVuIds } from "../src/deja-vu.js";

// Déjà vu is a look for a number rolled before: the box changes, nothing else.

const roll = (id, number, at) => {
  const scored = evaluate(number);
  return {
    type: "complete",
    id,
    at,
    cooldownUntil: 0,
    result: {
      number,
      totalEP: scored.totalEP,
      tier: scored.tier,
      badges: scored.badges,
    },
  };
};

test("a repeated exact number is counted from the history and pays nothing extra", () => {
  let state = {
    ...emptyProgress(),
    profile: { id: "p", username: "p", createdAt: 1 },
  };
  state = applyProgress(state, roll("a", 103002, 1000));
  const once = state.balance;
  state = applyProgress(state, roll("b", 103002, 2000));
  // Same EP both times: déjà vu is not a multiplier.
  expect(state.balance).toBe(once * 2);
  expect(priorRollsOf(state.history, 103002, "b")).toBe(1);
  expect(priorRollsOf(state.history, 103002, "a")).toBe(1);
  expect(priorRollsOf(state.history, 1337)).toBe(0);
  expect([...dejaVuIds(state.history)]).toEqual(["b"]);
});

test("the live roll and the History wear the déjà vu look only on a repeat", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockRandom(page, [103002, 103002]);
  await seedProgress(page);
  await page.goto("/");
  const box = page.locator(".number-artifact.number-box");
  await page.getByRole("button", { name: "GENERATE", exact: true }).click();
  await expect(box).toHaveAttribute("aria-label", "Number 103002");
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await expect(box).not.toHaveAttribute("data-deja-vu", "true");
  await expect(page.locator(".deja-vu-note")).toHaveCount(0);
  await page.clock.fastForward(105100);
  await page.getByRole("button", { name: "ROLL AGAIN", exact: true }).click();
  await expect(box).toHaveAttribute("aria-label", "Number 103002");
  await expect(page.locator(".roll-experience")).toHaveAttribute(
    "data-settled",
    "true",
  );
  await expect(box).toHaveAttribute("data-deja-vu", "true");
  await expect(box).toHaveAttribute("data-tier", "rare");
  await expect(page.locator(".deja-vu-note")).toContainText("once before");
  const ink = await box.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(ink).toBe("rgb(255, 160, 255)");
  await page.clock.fastForward(105100);
  await page.goto("/history");
  const rows = page.locator(".activity-roll .number-box");
  await expect(rows).toHaveCount(2);
  // Newest first: the repeat wears the look, the original does not.
  await expect(rows.nth(0)).toHaveAttribute("data-deja-vu", "true");
  await expect(rows.nth(1)).not.toHaveAttribute("data-deja-vu", "true");
});
