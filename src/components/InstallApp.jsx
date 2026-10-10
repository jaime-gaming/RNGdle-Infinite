import React, { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import "../install-app.css";

const DISMISS_KEY = "rng-infinite-install-dismissed-v1";
const OPEN_EVENT = "rngdle-open-install";

// Phones get a small card above the tab bar: one tap installs the game as a
// home-screen app (the browser's own prompt where it has one), or explains
// the two-tap manual route where it doesn't. Desktop never sees it, and a
// dismissed card stays dismissed until Settings reopens it.
export default function InstallApp({ notify }) {
  const [deferred, setDeferred] = useState(null);
  const [help, setHelp] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [standalone] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true,
  );
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
      notify?.({
        kind: "done",
        text: "RNGdle Infinite is on your home screen.",
      });
    };
    const onOpen = () => {
      setDismissed(false);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [notify]);
  if (standalone || dismissed) return null;
  async function install() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice?.outcome === "accepted") setDismissed(true);
      return;
    }
    setHelp((value) => !value);
  }
  return (
    <div className="install-app" role="region" aria-label="Install the app">
      <span className="install-app-copy">
        <strong>Get the app</strong>
        <span>
          {help
            ? ios
              ? "Tap Share, then “Add to Home Screen” — the game opens full-screen like an app."
              : "Open your browser menu and choose “Install app” / “Add to Home screen”."
            : "RNGdle on your home screen: one tap, full screen, no browser chrome."}
        </span>
      </span>
      <button type="button" className="install-app-action" onClick={install}>
        {help ? <Share size={14} /> : <Download size={14} />}
        {deferred ? "Install" : help ? "Got it" : "How?"}
      </button>
      <button
        type="button"
        className="install-app-close"
        aria-label="Dismiss install banner"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {}
          setDismissed(true);
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// Settings reopens the banner through this, so the card stays discoverable
// after being dismissed.
export function openInstallBanner() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
