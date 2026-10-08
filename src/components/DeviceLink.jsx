import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Handshake,
  Link2,
  Radio,
  RefreshCw,
  Server,
  Unplug,
} from "lucide-react";
import {
  adoptPeerCode,
  buildDeviceLink,
  buildPeerCode,
  createDeviceLink,
  fetchRelayHealth,
  pushNow,
  relayEndpoint,
  setRelayEndpoint,
  syncStatus,
  subscribeSync,
  unlinkDevices,
} from "../sync.js";
import "../settings.css";

// The device link, in two pieces.
//
// `DeviceLinkSummary` is the single card Settings shows: the state of the link
// and a door to the technical page. `DeviceLinkPanel` is this page — the link
// itself, the peer code, the optional relay address and the numbers behind
// the whole thing. Keeping the details on their own page means Settings stays
// a list of choices rather than a control room.
//
// On GitHub Pages (or any static host) the link uses PeerJS — a free public
// broker handles signaling, then every byte goes browser-to-browser. In
// development, or when the user points at one, an HTTP relay takes over.

const STATUS_COPY = {
  live: (detail) => detail || "Devices live",
  waiting: () => "Waiting for the other device…",
  connecting: () => "Connecting…",
  offline: () => "This device is offline",
  error: (detail) => detail || "Connection failed.",
  off: () => "Not linked",
};

function useLink() {
  const [state, setState] = useState(() => syncStatus());
  useEffect(() => subscribeSync(() => setState(syncStatus())), []);
  return [state, setState];
}

function LinkPill({ state }) {
  const statusText = (STATUS_COPY[state.status] ?? STATUS_COPY.off)(
    state.detail,
  );
  return (
    <span
      id="sync-status-row"
      className={`sync-status is-${state.status}`}
      data-testid="sync-status"
      data-direction={state.lastDirection || undefined}
      data-pending={state.pending || undefined}
    >
      <i className="sync-dot" aria-hidden="true" />
      {state.revision > 0 && (
        <b
          key={`ping-${state.revision}`}
          className="sync-ping"
          aria-hidden="true"
        />
      )}
      {statusText}
      {state.pending && (
        <em
          className="sync-pending"
          data-testid="sync-pending"
          title="Waiting to be sent"
        >
          queued
        </em>
      )}
    </span>
  );
}

function useCopy() {
  const [copied, setCopied] = useState("");
  function flash(key) {
    setCopied(key);
    setTimeout(
      () => setCopied((current) => (current === key ? "" : current)),
      1800,
    );
  }
  return [copied, flash];
}

function formatMoment(at) {
  if (!at) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

// ---- The Settings card -----------------------------------------------------
export function DeviceLinkSummary({ progress, navigate }) {
  const [state] = useLink();
  const linked = state.linked && !!state.room;
  return (
    <div className="settings-group">
      <h2>
        <Link2 size={16} aria-hidden="true" /> Link devices
      </h2>
      <p className="settings-group-note">
        Saves move between your own devices over an encrypted WebRTC channel — a
        free public broker handles only the initial handshake — or through a
        relay you run yourself when one answers. Devices catch up as soon as
        they can see each other; a relay with a store keeps the room while both
        are closed.
      </p>
      <div className="setting-row">
        <div className="setting-copy">
          <label htmlFor="sync-status-row">This account</label>
          <p>
            {linked
              ? state.pending
                ? "You have changes waiting to reach the other device."
                : "Both devices share one save. Closing one does not delete anything."
              : progress?.profile
                ? "Create a link, then open it on your other device whenever you like."
                : "Guests can open a link, but a local profile is needed to start one."}
          </p>
        </div>
        <LinkPill state={state} />
      </div>
      <button
        type="button"
        className="secondary-button sync-open"
        data-testid="open-device-link"
        onClick={() => navigate?.("settings", "link")}
      >
        <Radio size={15} aria-hidden="true" /> Device link settings
      </button>
    </div>
  );
}

// ---- The technical page ----------------------------------------------------
export default function DeviceLinkPanel({ progress, notify, navigate }) {
  const [state, setState] = useLink();
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [relay, setRelay] = useState(() => relayEndpoint());
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [copied, flash] = useCopy();
  const linked = state.linked && !!state.room;
  const lastLine =
    state.lastDirection === "sent"
      ? "Your save just left this device."
      : state.lastDirection === "received"
        ? "A save just arrived from the other device."
        : "";

  // The relay health check is only meaningful when a relay exists. On GitHub
  // Pages or any static host there is none, and the link uses PeerJS instead
  // — that is the happy path, not an error, so the details state it plainly
  // instead of dressing it up as a failure.
  useEffect(() => {
    let live = true;
    fetchRelayHealth()
      .then((info) => {
        if (live) {
          setHealth(info);
          setHealthError("");
        }
      })
      .catch(
        () =>
          live &&
          setHealthError("The relay did not answer. P2P is in use instead."),
      );
    return () => {
      live = false;
    };
  }, [state.status, state.revision]);

  async function create() {
    setCreating(true);
    try {
      await createDeviceLink();
      setState(syncStatus());
      notify?.("Link created. Open it on your other device.");
    } catch {
      setState(syncStatus());
      notify?.("Could not create the link. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildDeviceLink());
      flash("link");
      notify?.("Device link copied.");
    } catch {
      notify?.("Copying was blocked — select the link and copy it by hand.");
    }
  }

  async function send() {
    setSending(true);
    const result = await pushNow();
    setSending(false);
    notify?.(
      result.ok
        ? "Save sent — the other device will pick it up."
        : result.reason === "offline"
          ? "The other device is not reachable right now."
          : "There was nothing new to send.",
    );
  }

  async function copyCode() {
    const text = buildPeerCode();
    if (!text) {
      notify?.(
        "Create a local profile first — a guest save is not worth carrying.",
      );
      return;
    }
    setCode(text);
    try {
      await navigator.clipboard.writeText(text);
      flash("code");
      notify?.("Account code copied. Paste it on your other device.");
    } catch {
      notify?.("Code ready below — select it and copy it by hand.");
    }
  }

  function adopt() {
    const result = adoptPeerCode(code);
    if (result.ok) {
      setCode("");
      notify?.("Account adopted from the code. Keep it somewhere safe.");
      return;
    }
    notify?.(
      {
        empty: "Paste an account code first.",
        guest: "That code carries a guest save, which is not worth adopting.",
        unreadable: "That code could not be read. Copy it again, whole.",
      }[result.reason] ?? "That code could not be read.",
    );
  }

  function saveRelay() {
    const next = setRelayEndpoint(relay);
    setRelay(next);
    notify?.(
      next
        ? `Relay set to ${next}. Will be used when reachable.`
        : "Relay cleared — using browser-to-browser P2P.",
    );
  }

  // What the live transport actually is, and where the room is kept. A relay
  // that writes rooms to disk survives both devices being closed and a restart;
  // one that keeps them in memory keeps them for as long as it runs. Neither
  // case is an error, so neither is worded like one.
  const transport = health
    ? "Relay (HTTP)"
    : "Browser-to-browser (P2P via WebRTC)";
  const store = health
    ? health.store === "disk"
      ? health.storeLabel
        ? `On disk (${health.storeLabel})`
        : "On disk"
      : "In memory only"
    : "—";
  // The note has to describe the transport that actually answered, including
  // what its store can and cannot do: a memory-only relay keeps a room while it
  // runs, and loses every room when it restarts. The page says so.
  const note = !health
    ? "This deployment has no relay of its own, so saves travel browser-to-browser through WebRTC, with a free public broker handling only the initial handshake. Both devices therefore have to be open at the same time at least once. Treat the link like a password: whoever holds it plays this account."
    : health.store === "disk"
      ? "The relay above keeps rooms on its own disk, so either device may be closed and catch up later, and the newer save wins when both played apart. Treat the link like a password: whoever holds it plays this account."
      : "The relay above keeps rooms in memory. A room stays with it for as long as the relay runs, so a device that was closed still gets the newest save when it opens the link; a room nobody touches for a month is dropped. A restart of the relay forgets every room, so run your own relay with a store to keep rooms across restarts. Treat the link like a password: whoever holds it plays this account.";

  const details = [
    ["Transport", transport],
    [
      "Relay",
      health
        ? relayEndpoint() || "This device's own address"
        : healthError || "None — P2P in use",
    ],
    ["Store", store],
    ["Room", state.room || "—"],
    ["This device", state.device || "—"],
    ["Devices connected", linked ? String(state.peers || 1) : "—"],
    ["Last exchange", state.lastSyncAt ? formatMoment(state.lastSyncAt) : "—"],
    [
      "This device's last save",
      state.savedAt ? formatMoment(state.savedAt) : "—",
    ],
    [
      "Waiting to be sent",
      state.pending
        ? `Yes — since ${formatMoment(state.dirtyAt)}`
        : "Nothing queued",
    ],
  ];

  return (
    <section className="device-link" aria-label="Device link settings">
      <p className="device-link-lede">
        Two browsers, one account, no database. The link moves saves between
        your own devices: over an encrypted WebRTC channel, with a free public
        broker handling only the initial handshake, or through a relay you run
        yourself when one answers. Whichever device comes back catches up as
        soon as the two can see each other, and when both played apart the newer
        save wins — with a relay that keeps a store, a returning device is
        handed everything it missed even if the other one is closed.
      </p>

      <div className="setting-row">
        <div className="setting-copy">
          <label htmlFor="sync-status-row">This account</label>
          <p>
            {linked
              ? "Both devices share one save. Closing one does not delete anything."
              : progress?.profile
                ? "Create a link here, then open it on your other device."
                : "Guests can open a link, but a local profile is needed to start one."}
          </p>
        </div>
        <LinkPill state={state} />
      </div>

      {linked ? (
        <>
          <div className="sync-link-row" data-testid="sync-link-row">
            <input
              className="sync-link-field"
              data-testid="sync-link"
              readOnly
              aria-label="Your device link"
              value={buildDeviceLink()}
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              className="secondary-button sync-action"
              data-testid="sync-copy"
              onClick={copyLink}
            >
              {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "link" ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="secondary-button sync-action"
              data-testid="sync-now"
              disabled={sending}
              onClick={send}
            >
              <RefreshCw
                size={14}
                className={sending ? "is-spinning" : undefined}
              />
              {sending ? "Sending…" : "Send now"}
            </button>
            <button
              type="button"
              className="secondary-button sync-action"
              data-testid="sync-unlink"
              onClick={() => {
                unlinkDevices();
                setState(syncStatus());
                notify?.("Devices unlinked. Each browser keeps its own save.");
              }}
            >
              <Unplug size={14} /> Unlink
            </button>
          </div>
          <p className="sync-note" data-testid="sync-note" key={state.revision}>
            {lastLine ||
              (state.pending
                ? "A change is queued here and goes out with the next connection."
                : "The link is open. Changes sync every second while both devices are online.")}
          </p>
        </>
      ) : !progress?.profile ? (
        <p className="sync-hint">
          Sign up (or create a local profile) to start a link from this device.
        </p>
      ) : (
        <button
          type="button"
          className="secondary-button sync-action sync-create"
          data-testid="sync-create"
          disabled={creating}
          onClick={create}
        >
          <Link2 size={14} /> {creating ? "Creating link…" : "Create link"}
        </button>
      )}

      <h3 className="device-link-heading">
        <Radio size={15} aria-hidden="true" /> Technical details
      </h3>
      <dl className="device-link-details" data-testid="link-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="device-link-note">{note}</p>

      {state.status === "error" && (
        <p className="sync-note" data-testid="sync-trouble" role="status">
          The link is not connected right now. You can retry from here, or use
          “No link? Transfer by hand” below — a code needs no connection at all.
        </p>
      )}

      <h3 className="device-link-heading">
        <Server size={15} aria-hidden="true" /> Relay
      </h3>
      <p className="sync-hand-note">
        The built-in P2P transport works everywhere without any server. If you
        run your own relay ({`npm run relay`}), point this page at it here — the
        relay is preferred over P2P when it answers, keeps each room on its own
        store so a closed device can catch up later, and is faster on a local
        network. Leave the field on this site&apos;s own address to let the game
        decide.
      </p>
      <div className="setting-row sync-relay-row">
        <div className="sync-relay-controls">
          <input
            id="setting-relay"
            className="sync-relay-field"
            data-testid="relay-field"
            value={relay}
            spellCheck="false"
            aria-label="Relay address"
            placeholder="https://relay.example:8787"
            onChange={(event) => setRelay(event.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            data-testid="relay-save"
            onClick={saveRelay}
          >
            Save
          </button>
          <button
            type="button"
            className="secondary-button"
            data-testid="relay-reset"
            onClick={() => {
              setRelayEndpoint("");
              setRelay(relayEndpoint());
              notify?.("Relay cleared — using browser-to-browser P2P.");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <details className="sync-hand">
        <summary>
          <Handshake size={14} aria-hidden="true" /> No link? Transfer by hand
        </summary>
        <p className="sync-hand-note">
          A link needs both browsers online at some point; a code does not. Copy
          this account&apos;s code and adopt it on the other device — no
          connection needed, just the save itself in one blob of text. Your logo
          travels inside it too.
        </p>
        <div className="sync-hand-row">
          <button
            type="button"
            className="secondary-button sync-action"
            data-testid="peer-code-copy"
            onClick={copyCode}
          >
            {copied === "code" ? <Check size={14} /> : <Copy size={14} />}
            {copied === "code" ? "Code copied" : "Copy this account's code"}
          </button>
          <button
            type="button"
            className="secondary-button sync-action"
            data-testid="peer-code-adopt"
            disabled={!code.trim()}
            onClick={adopt}
          >
            <Handshake size={14} /> Adopt this account
          </button>
        </div>
        <textarea
          className="sync-code-field"
          data-testid="peer-code-field"
          rows={3}
          spellCheck="false"
          aria-label="Account code"
          placeholder="Paste an account code here, then adopt it…"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </details>

      <div className="device-link-footer">
        <button
          type="button"
          className="secondary-button back-to-settings"
          onClick={() => navigate?.("settings")}
        >
          Back to settings
        </button>
      </div>
    </section>
  );
}
