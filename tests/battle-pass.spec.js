import { test, expect } from "./helpers/clock.js";
import { waitForApp } from "./helpers/app.js";
import { pauseClockAt } from "./helpers/clock.js";
import { seedProgress, testProfile } from "./helpers/progress.js";
import { readSavedProgress } from "./helpers/save.js";
import { evaluate } from "./helpers/index.js";
import {
  applyProgress,
  emptyProgress,
  parseAndRepairProgress,
  parseProgress,
} from "../src/progress.js";
import {
  BATTLE_PASS_FIRST_START,
  BATTLE_PASS_LEVELS,
  BATTLE_PASS_PREMIUM_PRICE,
  BATTLE_PASS_REWARDS,
  BATTLE_PASS_SEASON_MS,
  BATTLE_PASS_VARIANT,
  BPEP_PER_LEVEL,
  PASS_BOOSTS,
  PASS_BOOST_PRICE,
  boostBuyStatus,
  PASS_METRICS,
  PASS_MISSIONS,
  activeBoosts,
  activePassMissionIds,
  activePassMissions,
  battlePassSeason,
  boostMultiplier,
  emptyBattlePass,
  parseBattlePass,
  parseBoosts,
  passPeriodKey,
  passRewardState,
  rewardKey,
} from "../src/battle-pass.js";
import { compareSaveRichness, saveHasProgress } from "../src/cloud-save.js";
import { allBadgeMetadata } from "../src/infinite-badges.js";
import { PETS, petDrop, PET_DROP_CHANCE } from "../src/pets.js";
import { auraProducts, shopProducts } from "../src/shop-data.js";

const at = Date.UTC(2026, 10, 17, 12);
const ids = allBadgeMetadata.map((badge) => badge.id);
const saved = (page) => readSavedProgress(page);

function roll(id, time, extra = {}) {
  return {
    type: "complete",
    id,
    at: time,
    cooldownUntil: time + 1000,
    result: evaluate(1337),
    ...extra,
  };
}

function readyPass(time = at) {
  const pass = emptyBattlePass();
  pass.seasonId = battlePassSeason(time).id;
  const counts = Object.fromEntries(
    PASS_METRICS.map((metric) => [metric, 1_000_000]),
  );
  for (const cadence of ["daily", "weekly", "season"]) {
    pass.missions[cadence] = {
      period: passPeriodKey(cadence, time, pass.seasonId),
      counts,
      claimed: [],
      swaps: [],
      rerolls: 0,
    };
  }
  return pass;
}

test("seasons are 28 UTC days and the pass repair keeps valid progress", () => {
  expect(battlePassSeason(BATTLE_PASS_FIRST_START).id).toBe("season-1");
  expect(
    battlePassSeason(BATTLE_PASS_FIRST_START + BATTLE_PASS_SEASON_MS - 1).id,
  ).toBe("season-1");
  expect(
    battlePassSeason(BATTLE_PASS_FIRST_START + BATTLE_PASS_SEASON_MS).id,
  ).toBe("season-2");
  expect(battlePassSeason(BATTLE_PASS_FIRST_START - 1).upcoming).toBe(true);

  const pass = readyPass();
  pass.xp = 750;
  pass.premium = true;
  pass.claimed = [rewardKey("free", 1)];
  const repaired = parseBattlePass({
    ...pass,
    xp: -5,
    claimed: [rewardKey("free", 1), "free-999", rewardKey("free", 1)],
    archive: [{ seasonId: "season-0", xp: 1, premium: false, claimed: 0 }],
  });
  expect(repaired.repaired).toBe(true);
  expect(repaired.pass.xp).toBe(0);
  expect(repaired.pass.claimed).toEqual([rewardKey("free", 1)]);
  expect(repaired.pass.archive).toEqual([]);
  expect(parseBattlePass(null).pass).toEqual(emptyBattlePass());
  expect(parseBattlePass("broken").repaired).toBe(true);
});

test("online rolls advance Tasks and the pass together; offline rolls do neither", () => {
  const online = applyProgress(
    { ...emptyProgress(), profile: testProfile },
    roll("online", at),
  );
  expect(online.tasks.daily.counts.rolls).toBe(1);
  expect(online.battlePass.seasonId).toBe("season-1");
  expect(online.battlePass.missions.daily.counts.rolls).toBe(1);
  expect(online.battlePass.missions.season.counts.rolls).toBe(1);

  const offline = applyProgress(
    { ...emptyProgress(), profile: testProfile, owned: ["offline-roller"] },
    roll("offline", at, { source: "offline" }),
  );
  expect(offline.battlePass.missions.daily.counts.rolls).toBe(0);
  expect(offline.battlePass.seasonId).toBe("");
});

test("pass missions pay BPEP once and rewards claim once per track", () => {
  const pass = readyPass();
  const mission = activePassMissions(pass, "daily", at)[0];
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: pass,
    balance: 0,
    totalEarned: 0,
  };
  state = applyProgress(state, {
    type: "claim-pass-mission",
    id: mission.id,
    at,
  });
  expect(state.battlePass.xp).toBe(mission.reward);
  expect(state.balance).toBe(0);
  expect(state.history.at(-1)).toMatchObject({
    type: "pass-mission",
    bpep: mission.reward,
  });
  expect(() =>
    applyProgress(state, { type: "claim-pass-mission", id: mission.id, at }),
  ).toThrow("already claimed");

  state = { ...state, battlePass: { ...state.battlePass, xp: BPEP_PER_LEVEL } };
  expect(passRewardState(state.battlePass, 1, "free")).toBe("claimable");
  expect(passRewardState(state.battlePass, 1, "premium")).toBe(
    "premium-locked",
  );
  state = applyProgress(state, {
    type: "claim-pass-reward",
    level: 1,
    track: "free",
    at,
  });
  expect(state.balance).toBeGreaterThan(0);
  expect(state.battlePass.claimed).toContain(rewardKey("free", 1));
  expect(() =>
    applyProgress(state, {
      type: "claim-pass-reward",
      level: 1,
      track: "free",
      at,
    }),
  ).toThrow("not ready");
  expect(() =>
    applyProgress(state, {
      type: "claim-pass-reward",
      level: 1,
      track: "premium",
      at,
    }),
  ).toThrow("not ready");
});

test("premium is an EP purchase, survives reload, and cannot be bought twice", () => {
  const pass = readyPass();
  const state = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: pass,
    balance: BATTLE_PASS_PREMIUM_PRICE,
    totalEarned: BATTLE_PASS_PREMIUM_PRICE,
  };
  const bought = applyProgress(state, { type: "buy-pass-premium", at });
  expect(bought.balance).toBe(0);
  expect(bought.battlePass.premium).toBe(true);
  expect(bought.history.at(-1)).toMatchObject({
    type: "pass-upgrade",
    ep: BATTLE_PASS_PREMIUM_PRICE,
  });
  expect(parseProgress(JSON.stringify(bought)).battlePass.premium).toBe(true);
  expect(() => applyProgress(bought, { type: "buy-pass-premium", at })).toThrow(
    "already unlocked",
  );
  expect(() =>
    applyProgress({ ...state, balance: 0 }, { type: "buy-pass-premium", at }),
  ).toThrow("Not enough");
});

test("a closed season delivers earned rewards once and archives the season", () => {
  const pass = readyPass();
  pass.xp = BPEP_PER_LEVEL * 10;
  pass.premium = true;
  const state = { ...emptyProgress(), profile: testProfile, battlePass: pass };
  const nextSeason = BATTLE_PASS_FIRST_START + BATTLE_PASS_SEASON_MS + 1000;
  const settled = applyProgress(state, roll("next-season", nextSeason));
  expect(settled.battlePass.seasonId).toBe("season-2");
  expect(settled.battlePass.xp).toBe(0);
  expect(settled.battlePass.archive).toHaveLength(1);
  expect(settled.owned).toContain("pass-signal");
  expect(
    settled.history.filter((event) => event.type === "pass-reward").length,
  ).toBe(20);
  const replay = applyProgress(settled, roll("next-season", nextSeason));
  expect(replay).toBe(settled);
});

test("rebirth and fresh start keep the pass, and cloud comparison sees pass progress", () => {
  const pass = readyPass();
  pass.xp = 500;
  const base = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: pass,
    discovered: ids,
    balance: 50_000_000,
    totalEarned: 50_000_000,
    cycleEarnedEP: 30_000_000,
    history: [
      {
        id: "ep",
        type: "roll",
        at: 1,
        number: 604827,
        tier: "godly",
        ep: 30_000_000,
        badges: [],
      },
    ],
  };
  const reborn = applyProgress(base, {
    type: "rebirth",
    expectedRebirths: 0,
    at,
  });
  expect(reborn.battlePass).toEqual(pass);
  const fresh = applyProgress(
    { ...base, ultraRebirths: 3 },
    { type: "fresh-start", at },
  );
  expect(fresh.battlePass).toEqual(pass);

  const local = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: { ...pass, xp: 600 },
  };
  const cloud = { ...emptyProgress(), profile: testProfile, battlePass: pass };
  expect(saveHasProgress(local)).toBe(true);
  expect(compareSaveRichness(local, cloud)).toBe("local");
  expect(compareSaveRichness(cloud, local)).toBe("cloud");

  const premiumLocal = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: { ...emptyBattlePass(), seasonId: "season-1", premium: true },
  };
  const premiumCloud = { ...emptyProgress(), profile: testProfile };
  expect(compareSaveRichness(premiumLocal, premiumCloud)).toBe("local");
  expect(compareSaveRichness(premiumCloud, premiumLocal)).toBe("cloud");
});

test("malformed pass saves repair without losing the rest of the profile", () => {
  const raw = JSON.stringify({
    ...emptyProgress(),
    profile: testProfile,
    balance: 123,
    totalEarned: 123,
    battlePass: {
      seasonId: "season-1",
      xp: "lots",
      premium: "yes",
      claimed: "free-1",
      missions: [],
    },
  });
  const repaired = parseAndRepairProgress(raw);
  expect(repaired.progress.balance).toBe(123);
  expect(repaired.progress.battlePass).toEqual({
    ...emptyBattlePass(),
    seasonId: "season-1",
  });
  expect(repaired.repairs.join(" ")).toMatch(/battle pass/i);
});

test("the pass page claims a reward and stays vertical on a phone", async ({
  page,
}) => {
  const pass = readyPass();
  pass.xp = BPEP_PER_LEVEL;
  await seedProgress(page, {
    battlePass: pass,
    balance: BATTLE_PASS_PREMIUM_PRICE,
    totalEarned: BATTLE_PASS_PREMIUM_PRICE,
  });
  await pauseClockAt(page, new Date(at));
  await page.goto("/pass");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "Battle Pass" }),
  ).toBeVisible();
  await expect(page.locator(".pass-level")).toHaveCount(BATTLE_PASS_LEVELS);
  // Missions moved to Tasks: the pass page no longer hosts them.
  await expect(page.locator(".pass-mission")).toHaveCount(0);
  await expect(page.locator(".pass-missions")).toHaveCount(0);

  await page.getByRole("button", { name: "Claim free level 1 reward" }).click();
  await expect
    .poll(async () => (await saved(page)).battlePass.claimed)
    .toContain(rewardKey("free", 1));

  // The track reads downwards: each level sits below the one before it.
  const first = await page.locator(".pass-level").first().boundingBox();
  const second = await page.locator(".pass-level").nth(1).boundingBox();
  expect(second.y).toBeGreaterThan(first.y + 8);
  expect(Math.abs(second.x - first.x)).toBeLessThan(4);
  expect(
    await page.evaluate(
      () => document.querySelector(".pass-track-scroll").scrollWidth,
    ),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".battle-pass")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("the premium variant is permanent, cosmetic, and never a shop or drop companion", () => {
  const pass = readyPass();
  pass.xp = BPEP_PER_LEVEL * 20;
  pass.premium = true;
  let state = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: pass,
    balance: 0,
    totalEarned: 0,
  };
  state = applyProgress(state, {
    type: "claim-pass-reward",
    level: 20,
    track: "premium",
    at,
  });
  expect(state.owned).toContain(BATTLE_PASS_VARIANT.id);
  expect(state.balance).toBe(0);
  expect(state.history.at(-1)).toMatchObject({
    type: "pass-reward",
    productId: BATTLE_PASS_VARIANT.id,
    ep: 0,
  });
  expect(() =>
    applyProgress(state, {
      type: "claim-pass-reward",
      level: 20,
      track: "premium",
      at,
    }),
  ).toThrow("not ready");
  expect(() =>
    applyProgress(state, { type: "equip", id: BATTLE_PASS_VARIANT.id, at }),
  ).toThrow();
  expect(PETS.some((pet) => pet.id === BATTLE_PASS_VARIANT.id)).toBe(false);
  expect(shopProducts.some((item) => item.id === BATTLE_PASS_VARIANT.id)).toBe(
    false,
  );
  expect(auraProducts.some((item) => item.id === BATTLE_PASS_VARIANT.id)).toBe(
    false,
  );
  for (let i = 0; i < 1000; i++)
    expect(petDrop((i / 1000) * PET_DROP_CHANCE, [])).not.toBe(
      BATTLE_PASS_VARIANT.id,
    );

  const reborn = applyProgress(
    {
      ...state,
      discovered: ids,
      balance: 50_000_000,
      totalEarned: 50_000_000,
      cycleEarnedEP: 30_000_000,
      history: [
        {
          id: "ep",
          type: "roll",
          at: 1,
          number: 604827,
          tier: "godly",
          ep: 30_000_000,
          badges: [],
        },
      ],
    },
    { type: "rebirth", expectedRebirths: 0, at },
  );
  expect(reborn.owned).toContain(BATTLE_PASS_VARIANT.id);
  const fresh = applyProgress(
    { ...state, ultraRebirths: 3 },
    { type: "fresh-start", at },
  );
  expect(fresh.owned).toContain(BATTLE_PASS_VARIANT.id);
  const repaired = parseProgress(JSON.stringify({ ...state, owned: [] }));
  expect(repaired.owned).toContain(BATTLE_PASS_VARIANT.id);
});

test("a daily pass mission swaps once and the replacement starts from its own baseline", () => {
  const pass = { ...emptyBattlePass(), seasonId: "season-1" };
  const before = activePassMissionIds(pass, "daily", at);
  const state = { ...emptyProgress(), profile: testProfile, battlePass: pass };
  const swapped = applyProgress(state, {
    type: "reroll-pass-mission",
    id: before[0],
    at,
  });
  const after = activePassMissionIds(swapped.battlePass, "daily", at);
  expect(after).not.toContain(before[0]);
  expect(swapped.battlePass.missions.daily.rerolls).toBe(1);
  expect(() =>
    applyProgress(swapped, { type: "reroll-pass-mission", id: after[1], at }),
  ).toThrow("already used");
});

test("pass missions are claimed and swapped on the Tasks page", async ({
  page,
}) => {
  const pass = readyPass();
  pass.xp = BPEP_PER_LEVEL;
  await seedProgress(page, { battlePass: pass });
  await pauseClockAt(page, new Date(at));
  await page.goto("/tasks");
  await waitForApp(page);

  // All three pass cadences now live here, each in its own section.
  const section = page.locator(".task-pass");
  await expect(section).toHaveCount(1);
  await expect(section.locator(".task-group-pass")).toHaveCount(3);
  await expect(section).toContainText("Daily pass missions");
  await expect(section).toContainText("Weekly pass missions");
  await expect(section).toContainText("Season milestones");

  const mission = activePassMissions(pass, "daily", at)[0];
  await expect(page.locator(`[data-pass-mission="${mission.id}"]`)).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: `Claim BPEP for ${mission.title}` })
    .click();
  await expect
    .poll(async () => (await saved(page)).battlePass.xp)
    .toBe(BPEP_PER_LEVEL + mission.reward);
  // Claiming BPEP never moves the EP wallet.
  const claim = await saved(page);
  expect(claim.history.at(-1)?.type).toBe("pass-mission");
  expect(claim.balance).toBe(0);
});

test("a daily pass mission can be swapped once on the Tasks page", async ({
  page,
}) => {
  // A fresh pass has no counts, so every daily mission is still open.
  const pass = { ...emptyBattlePass(), seasonId: "season-1" };
  await seedProgress(page, { battlePass: pass });
  await pauseClockAt(page, new Date(at));
  await page.goto("/tasks");
  await waitForApp(page);

  const swap = activePassMissions(pass, "daily", at)[0];
  await page.getByRole("button", { name: `Swap ${swap.title}` }).click();
  await expect
    .poll(async () => (await saved(page)).battlePass.missions.daily.rerolls)
    .toBe(1);
  const swapped = await saved(page);
  expect(activePassMissionIds(swapped.battlePass, "daily", at)).not.toContain(
    swap.id,
  );
  // The one free swap per day is spent.
  await expect(
    page.getByRole("button", { name: /^Swap / }).first(),
  ).toBeDisabled();
});

test("boost saves repair multiple live windows without stacking multipliers", () => {
  const parsed = parseBoosts(
    {
      charges: {},
      active: [
        { id: "boost-spark", until: at + 60_000 },
        { id: "boost-surge", until: at + 90_000 },
      ],
    },
    at,
  );
  expect(parsed.repaired).toBe(true);
  expect(parsed.boosts.active).toEqual([
    { id: "boost-spark", until: at + 60_000 },
  ]);
  expect(boostMultiplier(parsed.boosts, at)).toBe(1.5);
});

test("a pass boost multiplies banked EP only while its window runs", () => {
  const pass = readyPass();
  pass.xp = BPEP_PER_LEVEL * 5;
  const state = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: pass,
    balance: 0,
    totalEarned: 0,
  };
  const claimed = applyProgress(state, {
    type: "claim-pass-reward",
    level: 5,
    track: "free",
    at,
  });
  expect(claimed.battlePass.boosts.charges).toEqual({ "boost-spark": 1 });
  // The boost is an extra reward: level 5 still pays the EP it always paid.
  expect(claimed.balance).toBe(25000);
  expect(boostMultiplier(claimed.battlePass.boosts, at)).toBe(1);

  expect(() =>
    applyProgress(claimed, { type: "activate-boost", id: "boost-surge", at }),
  ).toThrow("no charge");

  const running = applyProgress(claimed, {
    type: "activate-boost",
    id: "boost-spark",
    at,
  });
  expect(running.battlePass.boosts.charges).toEqual({});
  expect(activeBoosts(running.battlePass.boosts, at + 60_000)).toHaveLength(1);
  expect(boostMultiplier(running.battlePass.boosts, at + 60_000)).toBe(1.5);
  expect(boostMultiplier(running.battlePass.boosts, at + 20 * 60_000)).toBe(1);
  expect(running.history.at(-1)).toMatchObject({
    type: "boost",
    boostId: "boost-spark",
    minutes: 15,
  });

  // A matching charge extends the same window without stacking its multiplier.
  const twoCharges = {
    ...running,
    battlePass: {
      ...running.battlePass,
      boosts: {
        charges: { "boost-spark": 1 },
        active: running.battlePass.boosts.active,
      },
    },
  };
  const extended = applyProgress(twoCharges, {
    type: "activate-boost",
    id: "boost-spark",
    at: at + 60_000,
  });
  expect(extended.battlePass.boosts.charges).toEqual({});
  expect(extended.battlePass.boosts.active).toEqual([
    { id: "boost-spark", until: at + 30 * 60_000 },
  ]);
  expect(extended.history.at(-1).until).toBe(at + 30 * 60_000);
  expect(boostMultiplier(extended.battlePass.boosts, at + 60_000)).toBe(1.5);

  const differentCharge = {
    ...running,
    battlePass: {
      ...running.battlePass,
      boosts: {
        charges: { "boost-surge": 1 },
        active: running.battlePass.boosts.active,
      },
    },
  };
  expect(() =>
    applyProgress(differentCharge, {
      type: "activate-boost",
      id: "boost-surge",
      at,
    }),
  ).toThrow("different boost is already running");

  // The multiplier is real EP: the same roll banks more inside the window than
  // outside it, while cycle gates still count only the number itself.
  const sample = roll("boosted", at + 60_000);
  const boosted = applyProgress(running, sample);
  const plain = applyProgress(
    { ...running, battlePass: { ...running.battlePass, boosts: undefined } },
    sample,
  );
  expect(boosted.balance).toBeGreaterThan(plain.balance);
  expect(boosted.balance - plain.balance).toBe(
    Math.round(plain.history.find((event) => event.id === "boosted").ep * 0.5),
  );
  expect(boosted.cycleEarnedEP).toBe(plain.cycleEarnedEP);

  // Charges and a running window survive a season change and a save repair.
  const nextSeason = BATTLE_PASS_FIRST_START + BATTLE_PASS_SEASON_MS + 1000;
  const rolled = applyProgress(
    {
      ...running,
      battlePass: {
        ...running.battlePass,
        boosts: { charges: { "boost-surge": 2 }, active: [] },
      },
    },
    roll("next-season-boost", nextSeason),
  );
  expect(rolled.battlePass.boosts.charges).toEqual({ "boost-surge": 2 });
  const repaired = parseAndRepairProgress(JSON.stringify(rolled));
  expect(repaired.progress.battlePass.boosts.charges).toEqual({
    "boost-surge": 2,
  });
  expect(repaired.repairs.join(" ")).not.toMatch(/battle pass/i);
});

test("a boost charge can also be bought with EP, once a day", () => {
  const pass = { ...emptyBattlePass(), seasonId: "season-1" };
  const rich = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: pass,
    balance: PASS_BOOST_PRICE * 3,
    totalEarned: PASS_BOOST_PRICE * 3,
  };
  const bought = applyProgress(rich, {
    type: "buy-boost",
    id: "boost-surge",
    at,
  });
  expect(bought.balance).toBe(PASS_BOOST_PRICE * 2);
  expect(bought.battlePass.boosts.charges).toEqual({ "boost-surge": 1 });
  expect(bought.history.at(-1)).toMatchObject({
    type: "purchase",
    productId: "boost-surge",
    ep: PASS_BOOST_PRICE,
  });
  expect(boostBuyStatus(bought.battlePass.boosts, at + 1000).waitMs).toBe(
    24 * 60 * 60 * 1000 - 1000,
  );

  // One purchase a day, whatever the balance says.
  expect(() =>
    applyProgress(bought, { type: "buy-boost", id: "boost-surge", at }),
  ).toThrow("already on the counter");
  expect(() =>
    applyProgress(
      { ...bought, balance: 10 },
      { type: "buy-boost", id: "boost-surge", at: at + 24 * 60 * 60 * 1000 },
    ),
  ).toThrow("Not enough EP");

  const nextDay = applyProgress(bought, {
    type: "buy-boost",
    id: "boost-spark",
    at: at + 24 * 60 * 60 * 1000,
  });
  expect(nextDay.battlePass.boosts.charges).toEqual({
    "boost-surge": 1,
    "boost-spark": 1,
  });
  expect(nextDay.balance).toBe(PASS_BOOST_PRICE);
  // The purchase limit is part of the save contract.
  const repaired = parseAndRepairProgress(JSON.stringify(nextDay));
  expect(repaired.progress.battlePass.boosts.boughtAt).toBe(
    at + 24 * 60 * 60 * 1000,
  );
});

test("a season milestone can pay a boost charge on top of its BPEP", () => {
  const pass = readyPass();
  const mission = PASS_MISSIONS.find((entry) => entry.boost);
  expect(mission).toMatchObject({
    cadence: "season",
    boost: { id: "boost-surge", charges: 1 },
  });
  expect(mission.metric).toBe("claims");
  // A season deals four of its milestones, so the test brings this one in
  // through the same swap a daily mission uses.
  const withBoost = {
    ...pass,
    missions: {
      ...pass.missions,
      season: {
        ...pass.missions.season,
        swaps: [
          {
            out: activePassMissionIds(pass, "season", at)[0],
            in: mission.id,
            base: 0,
          },
        ],
      },
    },
  };
  expect(activePassMissionIds(withBoost, "season", at)).toContain(mission.id);
  const state = {
    ...emptyProgress(),
    profile: testProfile,
    battlePass: withBoost,
  };
  const claimed = applyProgress(state, {
    type: "claim-pass-mission",
    id: mission.id,
    at,
  });
  expect(claimed.battlePass.boosts.charges).toEqual({ "boost-surge": 1 });
  expect(claimed.battlePass.xp).toBe(mission.reward);
  expect(claimed.balance).toBe(0);

  // Claiming any mission counts towards that milestone.
  const other = activePassMissions(pass, "daily", at)[0];
  const counted = applyProgress(state, {
    type: "claim-pass-mission",
    id: other.id,
    at,
  });
  expect(counted.battlePass.missions.season.counts.claims).toBe(1000001);
});

test("every boost level keeps its EP and the premium track doubles the charge", () => {
  for (const reward of BATTLE_PASS_REWARDS) {
    const boosted = ["free", "premium"].filter((track) => reward[track].boost);
    for (const track of boosted) {
      expect(reward[track].kind).toBe("ep");
      expect(reward[track].ep).toBeGreaterThan(0);
      expect(PASS_BOOSTS.some((b) => b.id === reward[track].boost.id)).toBe(
        true,
      );
    }
    if (reward.level === 5) {
      expect(reward.free.boost.charges).toBe(1);
      expect(reward.premium.boost.charges).toBe(2);
    }
  }
  const levels = BATTLE_PASS_REWARDS.filter((r) => r.free.boost).map(
    (r) => r.level,
  );
  expect(levels).toEqual([5, 15, 25]);
});

test("a running boost can be extended with a matching charge without stacking it", async ({
  page,
}) => {
  const pass = readyPass();
  pass.boosts = {
    charges: { "boost-spark": 1 },
    active: [{ id: "boost-spark", until: at + 60_000 }],
    boughtAt: 0,
  };
  await seedProgress(page, { battlePass: pass });
  await pauseClockAt(page, new Date(at));
  await page.goto("/pass");
  await waitForApp(page);

  const spark = page.locator('[data-boost="boost-spark"]');
  const extend = spark.getByRole("button", {
    name: "Extend Spark Injector by 15 minutes",
  });
  await expect(extend).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Activate Surge Capacitor" }),
  ).toBeDisabled();
  await extend.click();

  await expect
    .poll(async () => (await saved(page)).battlePass.boosts.active[0]?.until)
    .toBe(at + 16 * 60_000);
  expect((await saved(page)).battlePass.boosts.charges).toEqual({});
  await expect(page.locator(".pass-boost-mult")).toContainText("×1.5");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("before the first season the pass shows its opening date and sells nothing", async ({
  page,
}) => {
  await pauseClockAt(page, new Date(Date.UTC(2026, 10, 11, 12)));
  await page.goto("/pass");
  await waitForApp(page);
  await expect(
    page.getByRole("heading", { name: "The pass opens soon" }),
  ).toBeVisible();
  await expect(page.locator(".pass-hero")).toContainText("Nov 16, 2026");
  await expect(page.getByRole("button", { name: /Unlock ·/ })).toBeDisabled();
});
