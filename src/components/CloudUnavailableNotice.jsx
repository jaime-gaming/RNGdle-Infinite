import React, { useState } from "react";

// A Cloud verification outage leaves the player with a support reference and no
// obvious next step. These reasons name the action that actually helps, so the
// same failure no longer reads as a dead end.
export const CLOUD_UNAVAILABLE_COPY = Object.freeze({
  offline: {
    lead: "Cloud rolls need a connection. Your saved progress is safe on this device.",
    action: "reconnect",
  },
  signIn: {
    lead: "Your Cloud session needs a fresh sign-in. Your saved progress is safe.",
    action: "sign-in",
  },
  provider: {
    lead: "Cloud rolls were refused for this sign-in. Your saved progress is safe.",
    action: "sign-in",
  },
  "browser-settings": {
    lead: "This browser blocked the Cloud roll request. Your saved progress is safe.",
    action: "browser",
  },
  server: {
    lead: "Cloud rolls cannot be verified right now. Your saved progress is safe.",
    action: "retry",
  },
});

const ACTION_LABELS = Object.freeze({
  reconnect: "Check connection",
  "sign-in": "Sign in again",
  browser: "How this can happen",
  retry: "Try again",
});

export default function CloudUnavailableNotice({
  reason = "server",
  onRetry,
  onSignInAgain,
}) {
  const [explained, setExplained] = useState(false);
  const copy = CLOUD_UNAVAILABLE_COPY[reason] ?? CLOUD_UNAVAILABLE_COPY.server;
  const title =
    reason === "offline"
      ? "You are offline"
      : reason === "signIn" || reason === "provider"
        ? "Sign in again"
        : "Cloud rolls are unavailable";

  function act() {
    if (copy.action === "retry") return onRetry?.();
    if (copy.action === "sign-in") return onSignInAgain?.();
    if (copy.action === "reconnect")
      return globalThis.navigator?.onLine
        ? onRetry?.()
        : globalThis.location?.reload?.();
    setExplained(true);
  }

  return (
    <div
      className="roll-cloud-unavailable"
      role="alert"
      data-testid="cloud-unavailable"
    >
      <strong>{title}</strong>
      <p>{copy.lead} You can keep playing locally in the meantime.</p>
      <button type="button" className="secondary-button" onClick={act}>
        {ACTION_LABELS[copy.action]}
      </button>
      {explained && (
        <p className="roll-cloud-unavailable-detail">
          A privacy extension, a proxy or strict browser settings can block the
          request this game sends to verify a Cloud roll. Allow this site, then
          try again.
        </p>
      )}
    </div>
  );
}
