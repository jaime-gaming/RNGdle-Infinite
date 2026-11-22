// The privacy button must never be silently disabled: every outcome is shown.
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LocalProfile from "../../src/components/LocalProfile.jsx";
import { emptyProgress } from "../../src/progress.js";

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
}
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export async function run() {
  const progress = {
    ...emptyProgress(),
    profile: { id: "p1", username: "LuckyTester", createdAt: 1 },
    balance: 10,
    totalEarned: 10,
  };
  const account = { id: "uid-1", email: "player@example.com" };
  const mount = (props) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <LocalProfile
          profile={progress.profile}
          progress={progress}
          onAction={async () => ({ ok: true })}
          onContinue={() => {}}
          onProfileDeleted={() => {}}
          canEdit
          canContinue
          cloudAccount={account}
          {...props}
        />,
      ),
    );
    return { root, host };
  };
  const button = (host) =>
    host.querySelector('[data-testid="profile-visibility"]');

  {
    const { root, host } = mount({
      cloudProfileIdentity: { reserved: false, reservationBlocked: true },
      onSetPublicProfile: async () => ({
        ok: false,
        message: "It did not work.",
      }),
    });
    await settle();
    const control = button(host);
    check(Boolean(control), "the visibility button is rendered");
    check(!control.disabled, "an unreserved name does not disable the button");
    await act(async () => control.click());
    await settle();
    const alert = host.querySelector('[role="alert"]');
    check(Boolean(alert), "a failed attempt is announced");
    check(
      alert.textContent.includes("It did not work."),
      "the failure is described",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount({
      cloudProfileIdentity: { reserved: false },
      onSetPublicProfile: async () => ({
        ok: true,
        enabled: true,
        message:
          "Your profile is public. Anyone who knows the name or link can view its summary.",
      }),
    });
    await settle();
    await act(async () => button(host).click());
    await settle();
    const note = host.querySelector(".profile-share-note");
    check(
      note.getAttribute("role") === "status",
      "success is reported as status",
    );
    check(
      note.textContent.includes("Your profile is public"),
      "success is described",
    );
    check(
      !note.classList.contains("profile-share-note--error"),
      "success is not an error",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount({ cloudProfileIdentity: { reserved: true } });
    await settle();
    const control = button(host);
    check(!control.disabled, "the button stays clickable without a handler");
    await act(async () => control.click());
    await settle();
    check(
      Boolean(host.querySelector('[role="alert"]')),
      "a missing handler is explained",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount({
      cloudProfileIdentity: { reserved: true },
      onSetPublicProfile: async () => {
        throw new Error("The signed-in account changed. Try again.");
      },
    });
    await settle();
    await act(async () => button(host).click());
    await settle();
    const alert = host.querySelector('[role="alert"]');
    check(Boolean(alert), "a thrown error is reported");
    check(
      alert.textContent.includes("signed-in account changed"),
      "the thrown message is shown",
    );
    act(() => root.unmount());
  }

  {
    const { root, host } = mount({
      onlinePaused: true,
      cloudProfileIdentity: { reserved: true },
    });
    await settle();
    check(button(host).disabled, "maintenance keeps the button disabled");
    act(() => root.unmount());
  }

  const failed = results.filter((entry) => !entry.ok);
  assert.equal(failed.length, 0, `${failed.length} profile check(s) failed`);
}
