import { WINTER_COMPANION_SKINS } from "../src/winter-companions.js";
import { test, expect, pauseClockAt } from "./helpers/clock.js";
import {
  emptyProgress,
  applyProgress,
  parseProgress,
} from "../src/progress.js";
import { evaluate } from "./helpers/index.js";
import {
  recordWinterRoll,
  parseRngmas,
  RNGMAS_COSMETICS,
  RNGMAS_REWARDS,
} from "../src/rngmas.js";
import {
  WINTER_SPECIAL_TASKS,
  WINTER_LIVE_EVENTS,
  parseWinterFestival,
} from "../src/winter-festival.js";
import { compareSaveRichness } from "../src/cloud-save.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { waitForApp } from "./helpers/app.js";
import { readSavedProgress } from "./helpers/save.js";
const state = () => ({
  ...emptyProgress(),
  profile: testProfile,
  balance: 3000000,
  totalEarned: 3000000,
});

test("all seventeen event cosmetics have distinct identities and all live windows are bounded", () => {
  expect(RNGMAS_COSMETICS.length).toBe(17);
  expect(new Set(RNGMAS_COSMETICS.map((a) => a.id)).size).toBe(17);
  expect(WINTER_LIVE_EVENTS.length).toBe(19);
  for (const e of WINTER_LIVE_EVENTS) {
    expect(e.start).toBeLessThan(e.end);
    if (e.reward)
      expect(RNGMAS_REWARDS.some((a) => a.id === e.reward)).toBe(true);
  }
});
test("festival rolls are primary, online, once-per-receipt and do not progress outside their live window", () => {
  const at = WINTER_LIVE_EVENTS[0].start;
  const action = {
    type: "complete",
    id: "festival-main",
    at,
    cooldownUntil: at + 1000,
    result: evaluate(777772),
    extras: [{ result: evaluate(777774) }],
  };
  const before = state();
  const after = applyProgress(before, action);
  expect(after.rngmas.festival).toMatchObject({
    rolls: 1,
    seven: 1,
    digits: [2],
  });
  expect(after.rngmas.festival.live["meteor-watch"].count).toBe(1);
  expect(applyProgress(after, action).rngmas.festival.rolls).toBe(1);
  expect(
    applyProgress(after, { ...action, id: "offline", source: "offline" }).rngmas
      .festival.rolls,
  ).toBe(1);
  expect(
    recordWinterRoll(before.rngmas, { number: 2 }, at - 1).festival.live[
      "meteor-watch"
    ].count,
  ).toBe(0);
  expect(
    recordWinterRoll(before.rngmas, { number: 2 }, WINTER_LIVE_EVENTS[0].end)
      .festival.live["meteor-watch"].count,
  ).toBe(0);
});
test("special tasks grant cosmetics once, restore ownership receipts and survive Fresh Start", () => {
  for (const task of WINTER_SPECIAL_TASKS) {
    const saved = state();
    saved.rngmas.festival.rolls = 150;
    saved.rngmas.festival.seven = 25;
    saved.rngmas.festival.digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const action = {
      type: "winter-special-claim",
      id: task.id,
      at: Date.UTC(2026, 11, 2),
    };
    const claimed = applyProgress(saved, action);
    if (task.reward) expect(claimed.owned).toContain(task.reward);
    else
      expect(claimed.battlePass.boosts.charges[task.boost]).toBe(task.charges);
    expect(claimed.rngmas.snowcoins).toBe(task.coins);
    expect(claimed.cycleEarnedEP).toBe(0);
    const loaded = parseProgress(JSON.stringify(claimed));
    expect(loaded.history.at(-1).type).toBe("winter-reward");
    expect(() => applyProgress(loaded, action)).toThrow(/already/);
    loaded.ultraRebirths = 3;
    expect(
      applyProgress(loaded, { type: "fresh-start", at: action.at }).rngmas
        .festival,
    ).toEqual(loaded.rngmas.festival);
    const owned = parseRngmas(null, { owned: [task.reward] });
    if (task.reward) expect(owned.festival.claimed).toContain(task.id);
  }
});
test("bell relay counts distinct digits, not repeated rolls", () => {
  const e = WINTER_LIVE_EVENTS[1];
  let record = state().rngmas;
  for (let i = 0; i < 12; i++)
    record = recordWinterRoll(record, { number: 20 }, e.start);
  expect(record.festival.live[e.id].digits).toEqual([0]);
  for (let n = 0; n < 8; n++)
    record = recordWinterRoll(record, { number: n }, e.start);
  const claimed = applyProgress(
    { ...state(), rngmas: record },
    { type: "winter-special-claim", id: e.id, at: e.start },
  );
  expect(claimed.owned).toContain(e.reward);
  expect(() =>
    applyProgress(
      { ...state(), rngmas: record },
      { type: "winter-special-claim", id: e.id, at: e.end },
    ),
  ).toThrow(/closed/);
});
test("gift drive requires four paid parcels during the window and never refunds the cost", () => {
  const e = WINTER_LIVE_EVENTS[2];
  let saved = state();
  saved.rngmas.snowcoins = saved.rngmas.snowcoinsEarned = 20;
  const action = { type: "winter-parcel", id: e.id, at: e.start };
  expect(() => applyProgress(saved, { ...action, at: e.start - 1 })).toThrow(
    /closed/,
  );
  expect(() =>
    applyProgress(saved, {
      type: "winter-special-claim",
      id: e.id,
      at: e.start,
    }),
  ).toThrow(/Complete/);
  for (let i = 0; i < 4; i++) saved = applyProgress(saved, action);
  expect(saved.rngmas.snowcoins).toBe(0);
  expect(saved.rngmas.snowcoinsEarned).toBe(20);
  expect(() => applyProgress(saved, action)).toThrow(/already/);
  saved = applyProgress(saved, {
    type: "winter-special-claim",
    id: e.id,
    at: e.start,
  });
  expect(saved.owned).toContain(e.reward);
  expect(saved.rngmas.snowcoins).toBe(10);
});
test("malformed festival fields repair defensively and retained progress participates in Cloud comparison", () => {
  const repaired = parseWinterFestival({
    rolls: Infinity,
    seven: -4,
    digits: [0, 0, "1", 20, 2.5],
    claimed: "lantern-run",
    live: { "bell-relay": { count: 999, digits: [9, 9, 8], claimed: "yes" } },
  });
  expect(repaired.rolls).toBe(0);
  expect(repaired.seven).toBe(0);
  expect(repaired.digits).toEqual([0]);
  expect(repaired.claimed).toEqual([]);
  expect(repaired.live["bell-relay"]).toMatchObject({
    count: 8,
    digits: [8, 9],
    claimed: false,
  });
  const before = state(),
    after = structuredClone(before);
  after.rngmas.festival = repaired;
  expect(compareSaveRichness(after, before)).toBe("local");
  expect(
    compareSaveRichness(
      { ...after, profile: { ...after.profile, id: "other" } },
      before,
    ),
  ).toBe("incomparable");
});
test("market exclusives grant permanent auras without minting boost charges", () => {
  const saved = state();
  saved.rngmas.snowcoins = saved.rngmas.snowcoinsEarned = 300;
  const action = {
    type: "winter-market-buy",
    id: "snow-polar-axolotl",
    at: Date.UTC(2026, 11, 10),
  };
  const bought = applyProgress(saved, action);
  expect(bought.owned).toContain("winter-polar-axolotl");
  expect(bought.rngmas.snowcoins).toBe(200);
  expect(bought.battlePass.boosts.charges).toEqual({});
  const loaded = parseProgress(JSON.stringify(bought));
  expect(loaded.owned).toContain("winter-polar-axolotl");
  expect(() => applyProgress(loaded, action)).toThrow(/already/);
});
test("live drive works on a phone and special rewards appear in activity history", async ({
  page,
}) => {
  const saved = state();
  saved.rngmas.snowcoins = saved.rngmas.snowcoinsEarned = 20;
  await seedProgress(page, saved);
  await pauseClockAt(page, WINTER_LIVE_EVENTS[2].start + 1000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tasks?event=rngmas");
  await waitForApp(page);
  await page
    .getByRole("button", { name: "Live schedule", exact: true })
    .click();
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("button", { name: "Send parcel · 5 Snowcoins", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readSavedProgress(page)).rngmas.festival.live["gift-drive"]
            .count,
      )
      .toBe(i + 1);
  }
  await page
    .getByRole("button", { name: "Collect Parcel Kit", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await readSavedProgress(page)).owned.includes("winter-parcel-kit"),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await page.goto("/history");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", {
      name: "Winter reward · Parcel Kit",
      exact: true,
    }),
  ).toBeVisible();
});

test("every exclusive renders its aura artwork and distinct palette instead of a plain number box", async ({
  page,
}) => {
  await seedProgress(page, state());
  await pauseClockAt(page, Date.UTC(2026, 11, 17));
  await page.goto("/shop/rngmas");
  await waitForApp(page);
  await page.getByRole("button", { name: "Rewards", exact: true }).click();
  const collection = page.locator(".festival-collection");
  await expect(collection.locator("article")).toHaveCount(13);
  await expect(collection.locator(".rngmas-aura")).toHaveCount(8);
  await expect(collection.locator(".winter-pet-accessory")).toHaveCount(5);
});

test("winter companion skins reject forged equipment and preserve old earned aura receipts", () => {
  const saved = state();
  saved.pets = ["moth"];
  expect(() =>
    applyProgress(saved, {
      type: "equip-pet-skin",
      petId: "moth",
      skinId: "lantern",
    }),
  ).toThrow(/Unlock/);
  saved.owned.push("winter-lantern-moth");
  const equipped = applyProgress(saved, {
    type: "equip-pet-skin",
    petId: "moth",
    skinId: "lantern",
  });
  expect(parseProgress(JSON.stringify(equipped)).petSkins.moth).toBe("lantern");
  expect(
    parseProgress(JSON.stringify({ ...saved, petSkins: { moth: "forged" } }))
      .petSkins,
  ).toEqual({});
  const old = state();
  old.rngmas.festival.claimed = ["lantern-run"];
  const restored = parseProgress(JSON.stringify(old));
  expect(restored.owned).toContain("rngmas-lantern");
  expect(restored.owned).not.toContain("winter-lantern-moth");
});

test("all five winter skins equip only for their owner and survive resets", () => {
  expect(WINTER_COMPANION_SKINS).toHaveLength(5);
  for (const skin of WINTER_COMPANION_SKINS) {
    const saved = state();
    saved.pets = [skin.petId];
    saved.owned.push(skin.id);
    const equipped = applyProgress(saved, {
      type: "equip-pet-skin",
      petId: skin.petId,
      skinId: skin.skinId,
    });
    expect(parseProgress(JSON.stringify(equipped)).petSkins[skin.petId]).toBe(
      skin.skinId,
    );
    equipped.ultraRebirths = 3;
    expect(
      applyProgress(equipped, {
        type: "fresh-start",
        at: Date.UTC(2026, 11, 17),
      }).owned,
    ).toContain(skin.id);
  }
});
