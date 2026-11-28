import { test, expect, pauseClockAt } from "./helpers/clock.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import {
  BATTLE_PASS_REWARDS,
  passRewardsFor,
  emptyBattlePass,
  BATTLE_PASS_MAX_XP,
} from "../src/battle-pass.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { waitForApp } from "./helpers/app.js";

const winterAt = Date.UTC(2026, 11, 17, 12);
const dawnAt = Date.UTC(2026, 10, 25, 12);
const ready = (seasonId) => ({
  ...emptyProgress(),
  profile: testProfile,
  battlePass: {
    ...emptyBattlePass(),
    seasonId,
    xp: BATTLE_PASS_MAX_XP,
    premium: true,
  },
});
const cosmetics = (id) =>
  passRewardsFor(id)
    .flatMap((row) => [row.free, row.premium])
    .filter((reward) => reward.kind !== "ep")
    .map((reward) => reward.id);

test("RNGmas has its own cosmetics and EP budget without changing First Light", () => {
  expect(passRewardsFor("season-1")).toBe(BATTLE_PASS_REWARDS);
  expect(cosmetics("season-2")).toEqual([
    "pass-snowglobe",
    "pass-carillon",
    "pass-polar-crown",
  ]);
  for (const id of cosmetics("season-2"))
    expect(cosmetics("season-1")).not.toContain(id);
  for (const track of ["free", "premium"]) {
    const total = (id) =>
      passRewardsFor(id).reduce((sum, row) => sum + (row[track].ep ?? 0), 0);
    expect(total("season-2")).toBeLessThan(total("season-1"));
    expect(total("season-2")).toBeGreaterThan(0);
  }
});

test("claims and receipt repair use the saved season, not the current calendar", () => {
  for (const [id, at] of [
    ["season-1", dawnAt],
    ["season-2", winterAt],
  ]) {
    let state = ready(id);
    for (const [level, track] of [
      [10, "free"],
      [20, "premium"],
      [30, "premium"],
    ]) {
      state = applyProgress(state, {
        type: "claim-pass-reward",
        level,
        track,
        at,
      });
      expect(() =>
        applyProgress(state, { type: "claim-pass-reward", level, track, at }),
      ).toThrow(/not ready/);
    }
    expect(state.owned).toEqual(expect.arrayContaining(cosmetics(id)));
    const repaired = parseProgress(JSON.stringify({ ...state, owned: [] }));
    expect(repaired.owned).toEqual(expect.arrayContaining(cosmetics(id)));
    for (const other of cosmetics(id === "season-1" ? "season-2" : "season-1"))
      expect(repaired.owned).not.toContain(other);
  }
});

test("First Light rollover delivers First Light rewards before opening RNGmas", () => {
  const state = applyProgress(ready("season-1"), {
    type: "initialize-pass-season",
    at: winterAt,
  });
  expect(state.battlePass.seasonId).toBe("season-2");
  expect(state.owned).toEqual(expect.arrayContaining(cosmetics("season-1")));
  for (const id of cosmetics("season-2")) expect(state.owned).not.toContain(id);
  expect(state.battlePass.claimed).toEqual([]);
});

test("RNGmas pass shows only winter cosmetics and renders their ornaments", async ({
  page,
}) => {
  await seedProgress(page, ready("season-2"));
  await pauseClockAt(page, winterAt);
  await page.goto("/pass");
  await waitForApp(page);
  await expect(
    page.getByText("Snowglobe", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Midnight Carillon", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Polar Crown", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("First Light Crown", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Prism Axolotl", { exact: true })).toHaveCount(0);
  for (const [level, track, id] of [
    [10, "free", "pass-snowglobe"],
    [20, "premium", "pass-carillon"],
    [30, "premium", "pass-polar-crown"],
  ]) {
    await page
      .getByRole("button", { name: `Inspect level ${level} ${track} reward` })
      .click();
    await expect(
      page.locator(`[data-cosmetic="${id}"] .rngmas-aura`).first(),
    ).toBeAttached();
    await page.getByRole("button", { name: "Close reward details" }).click();
  }
});
