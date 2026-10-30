import { expect, test } from "@playwright/test";
import {
  applyProgress,
  emptyProgress,
  parseProgress,
  preservePermanentCosmetics,
} from "../src/progress.js";
import { RNGWEEN_ID } from "../src/rngween.js";
import {
  emptyRngweenLimited,
  limitedRewardIds,
} from "../src/rngween-limited.js";

const at = Date.UTC(2026, 10, 4, 12);
const profile = {
  id: "legacy-profile",
  username: "LegacyKeeper",
  createdAt: Date.UTC(2026, 9, 20),
};

function retiredEventSave() {
  return {
    ...emptyProgress(),
    profile,
    owned: ["jack-o-glow", "hexbound", "hollow-lantern"],
    equipped: "hollow-lantern",
    events: { [RNGWEEN_ID]: { at: Date.UTC(2026, 9, 21) } },
    tasks: {
      ...emptyProgress().tasks,
      rngween: {
        id: RNGWEEN_ID,
        counts: { rolls: 300, rare: 60, banked: 8_000_000, taskClaims: 21 },
        earned: ["jack-o-glow", "phantom-veil", "witchfire", "blood-moon"],
      },
    },
    rngweenLimited: {
      id: RNGWEEN_ID,
      auras: ["jack-o-glow", "phantom-veil", "witchfire", "blood-moon"],
      skinEarned: true,
      finaleEarned: true,
      retired: true,
    },
    history: [
      {
        id: "rngween-hourly:opening:1",
        type: "rngween-hourly",
        at,
        taskId: "hourly-rolls",
        name: "A Lucky Hour",
        pumpkoins: 3,
      },
      {
        id: "rngween-exchange:rngween-2026:1",
        type: "rngween-exchange",
        at: at + 1,
        name: "Pumpkoin exchange",
        ep: 300,
        pumpkoins: 3,
      },
      {
        id: "rngween-purchase:rngween-2026:1",
        type: "rngween-purchase",
        at: at + 2,
        productId: "jack-o-glow",
        name: "Jack-o'-Glow",
        pumpkoins: 5,
      },
      {
        id: "rngween-mission:rngween-2026:1",
        type: "rngween-mission",
        at: at + 3,
        productId: "phantom-veil",
        name: "Phantom Veil",
        pumpkoins: 1,
      },
      {
        id: "rngween-world-purchase:rngween-2026:1",
        type: "rngween-world-purchase",
        at: at + 4,
        productId: "world-supply",
        name: "World supply",
        points: 10,
      },
      {
        id: "rngween-world-exchange:rngween-2026:1",
        type: "rngween-world-exchange",
        at: at + 5,
        name: "World trade",
        points: 10,
        ep: 500,
      },
      {
        id: `rngween-forged-key:${RNGWEEN_ID}`,
        type: "rngween-forged-key",
        at: at + 6,
      },
      {
        id: `rngween-farewell:${RNGWEEN_ID}`,
        type: "rngween-farewell",
        at: at + 7,
        pumpkoins: 50,
        ep: 5_000,
      },
      {
        id: `rngween-finale:${RNGWEEN_ID}`,
        type: "rngween-finale",
        at: at + 8,
        productId: "hollow-lantern",
        name: "Hollow Lantern",
      },
    ],
  };
}

test("retired attendance, event activity and permanent cosmetics survive parsing", () => {
  const progress = parseProgress(JSON.stringify(retiredEventSave()));

  expect(progress.events[RNGWEEN_ID]).toEqual({ at: Date.UTC(2026, 9, 21) });
  expect(progress.owned).toEqual(
    expect.arrayContaining([
      "jack-o-glow",
      "phantom-veil",
      "witchfire",
      "blood-moon",
      "hexbound",
      "hollow-lantern",
    ]),
  );
  expect(progress.equipped).toBe("hollow-lantern");
  expect(progress.rngweenLimited).toMatchObject({
    retired: true,
    skinEarned: true,
    finaleEarned: true,
  });
  expect(limitedRewardIds(progress.rngweenLimited)).toEqual(
    expect.arrayContaining([
      "jack-o-glow",
      "phantom-veil",
      "witchfire",
      "blood-moon",
      "hexbound",
      "hollow-lantern",
    ]),
  );
  expect(progress.history.map(({ type }) => type)).toEqual([
    "rngween-hourly",
    "rngween-exchange",
    "rngween-purchase",
    "rngween-mission",
    "rngween-world-purchase",
    "rngween-world-exchange",
    "rngween-forged-key",
    "rngween-farewell",
    "rngween-finale",
  ]);
});

test("legacy permanent cosmetics survive same-account save reconciliation", () => {
  const old = parseProgress(JSON.stringify(retiredEventSave()));
  const newer = parseProgress(
    JSON.stringify({
      ...retiredEventSave(),
      owned: [],
      equipped: "none",
      events: {},
      tasks: emptyProgress().tasks,
      history: [],
      rngweenLimited: emptyRngweenLimited(),
    }),
  );

  const merged = preservePermanentCosmetics(old, newer);
  expect(merged.owned).toEqual(expect.arrayContaining(old.owned));
  expect(merged.rngweenLimited.finaleEarned).toBe(true);
  expect(limitedRewardIds(merged.rngweenLimited)).toEqual(
    expect.arrayContaining(["hollow-lantern", "hexbound"]),
  );
});

test("retired events remain parseable but cannot create fresh attendance", () => {
  const clean = emptyProgress();
  expect(clean.events[RNGWEEN_ID]).toBeUndefined();
  expect(() =>
    applyProgress(clean, {
      type: "attend-event",
      id: RNGWEEN_ID,
      at: Date.UTC(2026, 9, 24),
    }),
  ).toThrow(/Unknown progress action/);
});
