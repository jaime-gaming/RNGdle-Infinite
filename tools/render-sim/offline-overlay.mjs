// Render checks for the full-screen Offline Rolls overlay.
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import OfflineRewards from "../../src/components/OfflineRewards.jsx";

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return { root, host };
}

export async function run() {
  const profile = { id: "p1", username: "LuckyTester", createdAt: 1 };
  const progress = (extra = {}) => ({
    profile,
    owned: ["offline-roller"],
    offline: { lastSeenAt: 1, batch: null, report: null },
    ...extra,
  });
  const report = { id: "r", at: 1, rolls: 6, ep: 27978, newBadges: 2 };
  const status = { busy: false, error: "", retry: () => {} };
  let dismissed = 0;
  let historyCalls = 0;

  {
    const { root } = mount(
      <OfflineRewards
        progress={progress()}
        status={status}
        onDismiss={async () => ({ ok: true })}
        onHistory={() => {}}
      />,
    );
    await settle();
    check(
      document.querySelectorAll("dialog").length === 0,
      "no overlay without rewards",
    );
    act(() => root.unmount());
  }

  {
    const { root } = mount(
      <OfflineRewards
        progress={progress({ offline: { lastSeenAt: 1, batch: null, report } })}
        status={status}
        onDismiss={async () => {
          dismissed += 1;
          return { ok: true };
        }}
        onHistory={() => {
          historyCalls += 1;
        }}
      />,
    );
    await settle();
    const dialog = document.querySelector("dialog");
    check(Boolean(dialog), "a finished summary opens a dialog");
    check(dialog.hasAttribute("open"), "the dialog is modal");
    check(
      dialog.getAttribute("aria-label") === "Offline rewards",
      "the dialog is named for screen readers",
    );
    check(dialog.textContent.includes("+27,978 EP"), "earned EP is shown");
    check(dialog.textContent.includes("6 rolls"), "roll count is shown");
    const close = dialog.querySelector(
      '[aria-label="Dismiss offline summary"]',
    );
    check(Boolean(close), "the dismiss control keeps its accessible name");
    await act(async () => close.click());
    await settle();
    check(dismissed === 1, "dismiss calls the parent");
    const explore = [...dialog.querySelectorAll("button")].find((node) =>
      node.textContent.includes("Explore your rewards"),
    );
    check(Boolean(explore), "the reward can be explored");
    await act(async () => explore.click());
    await settle();
    check(dismissed === 2, "exploring acknowledges the reward first");
    check(historyCalls === 1, "exploring opens history afterwards");
    act(() => root.unmount());
  }

  {
    const batch = {
      id: "b",
      since: 1,
      numbers: [1, 2, 3, 4],
      index: 1,
      ep: 0,
      newBadges: 0,
    };
    const { root } = mount(
      <OfflineRewards
        progress={progress({ offline: { lastSeenAt: 1, batch, report: null } })}
        status={status}
        onDismiss={async () => ({ ok: true })}
        onHistory={() => {}}
      />,
    );
    await settle();
    const dialog = document.querySelector("dialog");
    check(Boolean(dialog), "a running batch opens the overlay");
    check(
      dialog.textContent.includes("1 / 4"),
      "progress is reported while crediting",
    );
    const bar = dialog.querySelector('[role="progressbar"]');
    check(
      bar.getAttribute("aria-valuenow") === "1",
      "the progress bar exposes its value",
    );
    check(
      !dialog.querySelector('[aria-label="Dismiss offline summary"]'),
      "a running batch cannot be dismissed halfway",
    );
    act(() => root.unmount());
  }

  {
    let retries = 0;
    const failing = {
      busy: false,
      error: "Offline rewards could not be saved.",
      retry: () => {
        retries += 1;
      },
    };
    const { root } = mount(
      <OfflineRewards
        progress={progress()}
        status={failing}
        onDismiss={async () => ({ ok: true })}
        onHistory={() => {}}
      />,
    );
    await settle();
    const dialog = document.querySelector("dialog");
    check(Boolean(dialog), "a failure opens the overlay");
    check(
      Boolean(dialog.querySelector('[role="alert"]')),
      "the failure is announced",
    );
    const retry = [...dialog.querySelectorAll("button")].find((node) =>
      node.textContent.includes("Retry offline rewards"),
    );
    await act(async () => retry.click());
    check(retries === 1, "retry is wired");
    const close = dialog.querySelector(
      '[aria-label="Dismiss offline summary"]',
    );
    await act(async () => close.click());
    await settle();
    check(
      document.querySelectorAll("dialog").length === 0,
      "a failure can be dismissed",
    );
    act(() => root.unmount());
  }

  {
    const { root } = mount(
      <OfflineRewards
        progress={{
          ...progress(),
          owned: [],
          offline: { lastSeenAt: 1, batch: null, report },
        }}
        status={{ busy: false, error: "boom", retry: () => {} }}
        onDismiss={async () => ({ ok: true })}
        onHistory={() => {}}
      />,
    );
    await settle();
    check(
      document.querySelectorAll("dialog").length === 0,
      "no overlay without the offline roller",
    );
    act(() => root.unmount());
  }

  const failed = results.filter((entry) => !entry.ok);
  assert.equal(failed.length, 0, `${failed.length} overlay check(s) failed`);
}
