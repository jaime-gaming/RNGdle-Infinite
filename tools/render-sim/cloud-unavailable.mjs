// Render checks for the Cloud outage notice on the roll screen.
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import CloudUnavailableNotice, {
  CLOUD_UNAVAILABLE_COPY,
} from "../../src/components/CloudUnavailableNotice.jsx";

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`   ${ok ? "PASS" : "FAIL"} ${label}`);
}

function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return { root, host };
}

export async function run() {
  const cases = [
    ["offline", "You are offline", "Check connection"],
    ["signIn", "Sign in again", "Sign in again"],
    ["provider", "Sign in again", "Sign in again"],
    ["browser-settings", "Cloud rolls are unavailable", "How this can happen"],
    ["server", "Cloud rolls are unavailable", "Try again"],
  ];

  for (const [reason, title, action] of cases) {
    const { root, host } = mount(<CloudUnavailableNotice reason={reason} />);
    const text = host.textContent;
    check(text.includes(title), `${reason}: names the situation (${title})`);
    check(
      text.includes(action),
      `${reason}: offers the action that helps (${action})`,
    );
    check(
      text.includes("You can keep playing locally"),
      `${reason}: says local play still works`,
    );
    check(
      Boolean(host.querySelector('[role="alert"]')),
      `${reason}: is announced to assistive technology`,
    );
    act(() => root.unmount());
    host.remove();
  }

  {
    let retried = 0;
    const server = mount(
      <CloudUnavailableNotice reason="server" onRetry={() => retried++} />,
    );
    act(() => {
      server.host
        .querySelector("button")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    check(retried === 1, "server: Try again asks for a new verification");
    act(() => server.root.unmount());

    let signedIn = 0;
    const expired = mount(
      <CloudUnavailableNotice
        reason="signIn"
        onSignInAgain={() => signedIn++}
      />,
    );
    act(() => {
      expired.host
        .querySelector("button")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    check(signedIn === 1, "sign-in: the button reopens sign-in");
    act(() => expired.root.unmount());
  }

  {
    const browser = mount(<CloudUnavailableNotice reason="browser-settings" />);
    act(() => {
      browser.host
        .querySelector("button")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    check(
      browser.host.textContent.includes("privacy extension"),
      "browser settings: explains what can block the request",
    );
    act(() => browser.root.unmount());
  }

  {
    const fallback = mount(<CloudUnavailableNotice reason="unexpected" />);
    check(
      fallback.host.textContent.includes(CLOUD_UNAVAILABLE_COPY.server.lead),
      "unknown reasons fall back to the server notice",
    );
    act(() => fallback.root.unmount());
  }

  const failed = results.filter((result) => !result.ok).length;
  assert.equal(failed, 0, `${failed} Cloud outage notice checks failed`);
}
