import { test, expect } from "@playwright/test";
import { emptyProgress } from "../src/progress.js";
import {
  chooseSyncOwner,
  isBlankSave,
  isSyncWriter,
  pendingStamp,
  primarySide,
  progressWeight,
  richerSide,
  syncDecision,
} from "../src/sync-policy.js";

const profile = {
  id: "account-owner",
  username: "LuckyTester",
  createdAt: 1700000000000,
};
const accountState = JSON.stringify({ ...emptyProgress(), profile });
const guestState = JSON.stringify(emptyProgress());

test("a profile wins the initial P2P exchange even when the guest wins the id tie", () => {
  const owner = syncDecision(
    { state: accountState, savedAt: 0, device: "z-account" },
    { state: guestState, savedAt: 0, device: "a-guest" },
    1700000000000,
  );
  expect(owner).toEqual({
    direction: "send",
    savedAt: 1700000000001,
  });

  const guest = syncDecision(
    { state: guestState, savedAt: 0, device: "a-guest" },
    { state: accountState, savedAt: owner.savedAt, device: "z-account" },
    1700000000000,
  );
  expect(guest).toEqual({ direction: "receive" });
});

test("a guest clock cannot replace an account, while account conflicts keep the shared order", () => {
  expect(
    syncDecision(
      { state: accountState, savedAt: 10, device: "account" },
      { state: guestState, savedAt: 5000, device: "guest" },
      1000,
    ),
  ).toEqual({ direction: "send", savedAt: 5001 });

  expect(
    syncDecision(
      { state: guestState, savedAt: 5000, device: "guest" },
      { state: accountState, savedAt: 10, device: "account" },
      1000,
    ),
  ).toEqual({ direction: "receive" });

  expect(
    syncDecision(
      { state: accountState, savedAt: 10, device: "a-device" },
      { state: accountState, savedAt: 11, device: "z-device" },
      1000,
    ),
  ).toEqual({ direction: "receive" });
  expect(
    syncDecision(
      { state: accountState, savedAt: 11, device: "z-device" },
      { state: accountState, savedAt: 10, device: "a-device" },
      1000,
    ),
  ).toEqual({ direction: "send", savedAt: 11 });
});

test("a pending change is stamped at the moment it was made, or one step past the last accepted save when that is later", () => {
  // The change is newer than the last accepted save: its own moment is the stamp.
  expect(pendingStamp(100, 250)).toBe(250);
  // The other device's clock ran ahead: the change still beats the save it
  // would otherwise tie with, instead of being lost on a tie.
  expect(pendingStamp(300, 250)).toBe(301);
  expect(pendingStamp(250, 250)).toBe(251);
  expect(pendingStamp(0, 0)).toBe(1);
});

test("linked devices agree on one writer, and a legacy link waits until both devices are known", () => {
  expect(chooseSyncOwner(["owner", "guest"], ["owner"])).toBe("owner");
  expect(chooseSyncOwner(["guest", "owner"], [])).toBe("guest");
  expect(chooseSyncOwner(["only-device"], [])).toBe("");
  // Conflicting legacy declarations still resolve identically at both ends.
  expect(
    chooseSyncOwner(["z-device", "a-device"], ["z-device", "a-device"]),
  ).toBe("a-device");
  expect(isSyncWriter("owner", "owner")).toBe(true);
  expect(isSyncWriter("guest", "owner")).toBe(false);
  expect(isSyncWriter("guest", "")).toBe(false);
});

// Linking is a decision about which account survives. The one that has been
// played is the primary; a browser that was barely used adopts it instead of
// overwriting it, however new its last write happens to be.
const played = (profile) => ({
  ...emptyProgress(),
  profile,
  balance: 4000000,
  totalEarned: 4000000,
  owned: ["static", "quickwind-1"],
  discovered: ["even", "odd", "round"],
  history: Array.from({ length: 40 }, (_, index) => ({
    id: `roll:${index}`,
    type: "roll",
    at: 1000 + index,
    number: 123456,
    tier: "common",
    ep: 12,
    badges: [],
  })),
});
const otherProfile = {
  id: "account-phone",
  username: "SecondPlayer",
  createdAt: 1700000500000,
};

test("the account with more progress is the primary when two different accounts meet", () => {
  const rich = JSON.stringify(played(profile));
  const lean = JSON.stringify({ ...emptyProgress(), profile: otherProfile });
  expect(progressWeight(rich)).toBeGreaterThan(progressWeight(lean) + 100);
  expect(isBlankSave(lean)).toBe(true);
  expect(primarySide({ state: rich }, { state: lean })).toBe("local");
  expect(primarySide({ state: lean }, { state: rich })).toBe("remote");

  // The lean account's write is far newer, and it still does not win.
  expect(
    syncDecision(
      { state: rich, savedAt: 10, device: "z-rich" },
      { state: lean, savedAt: 9_000_000, device: "a-lean" },
      1000,
    ),
  ).toEqual({ direction: "send", savedAt: 9_000_001 });
  expect(
    syncDecision(
      { state: lean, savedAt: 9_000_000, device: "a-lean" },
      { state: rich, savedAt: 10, device: "z-rich" },
      1000,
    ),
  ).toEqual({ direction: "receive" });
});

test("two devices of one account still settle by timestamp, so no queued change is refused", () => {
  const rich = JSON.stringify(played(profile));
  const older = JSON.stringify(played(profile));
  expect(primarySide({ state: rich }, { state: older })).toBe("");
  expect(
    syncDecision(
      { state: rich, savedAt: 10, device: "a-device" },
      { state: older, savedAt: 11, device: "z-device" },
      1000,
    ),
  ).toEqual({ direction: "receive" });
  expect(
    syncDecision(
      { state: rich, savedAt: 11, device: "z-device" },
      { state: older, savedAt: 10, device: "a-device" },
      1000,
    ),
  ).toEqual({ direction: "send", savedAt: 11 });
});

test("a save that carries nothing never outranks one that carries the game", () => {
  expect(progressWeight(JSON.stringify(emptyProgress()))).toBe(0);
  expect(isBlankSave(JSON.stringify(emptyProgress()))).toBe(true);
  expect(isBlankSave(JSON.stringify(played(profile)))).toBe(false);
  expect(
    richerSide(
      JSON.stringify(played(profile)),
      JSON.stringify(emptyProgress()),
    ),
  ).toBe("local");
  // Two saves of comparable weight are left to the timestamp order.
  expect(
    richerSide(
      JSON.stringify(played(profile)),
      JSON.stringify(played(profile)),
    ),
  ).toBe("");
});
