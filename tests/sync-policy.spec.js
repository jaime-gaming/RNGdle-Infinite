import { test, expect } from "@playwright/test";
import { emptyProgress } from "../src/progress.js";
import { syncDecision } from "../src/sync-policy.js";

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
