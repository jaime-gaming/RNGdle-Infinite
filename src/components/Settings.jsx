import React, { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  Copy,
  Eye,
  Gamepad2,
  Handshake,
  Link2,
  RefreshCw,
  RotateCcw,
  Shirt,
  Unplug,
  Volume2,
} from "lucide-react";
import AuraWardrobe from "./AuraWardrobe";
import { useSettings } from "../use-settings.jsx";
import {
  notificationPermission,
  playReadyChime,
  requestNotificationPermission,
  showReadyNotification,
} from "../notifications.js";
import {
  adoptPeerCode,
  buildDeviceLink,
  buildPeerCode,
  createDeviceLink,
  pushNow,
  relayEndpoint,
  setRelayEndpoint,
  syncStatus,
  subscribeSync,
  unlinkDevices,
} from "../sync.js";
import "../settings.css";

// One link, two devices, one account — live. The relay it talks to keeps
// rooms in memory only: no database, no sign-up, and the save itself never
// leaves the players' own browsers.
function DeviceLink({ progress, notify }) {
  const [state, setState] = useState(() => syncStatus());
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [code, setCode] = useState("");
  const [relay, setRelay] = useState(() => relayEndpoint());
  useEffect(() => subscribeSync(() => setState(syncStatus())), []);
  const linked = state.linked && !!state.room;
  // Moves once per frame that actually crosses the wire: the pill's ring
  // replays its one-shot animation whenever this changes.
  const exchanges = state.revision;
  const lastLine =
    state.lastDirection === "sent"
      ? "Your save just left this device."
      : state.lastDirection === "received"
        ? "A save just arrived from the other device."
        : "";

  async function create() {
    setCreating(true);
    try {
      await createDeviceLink();
      setState(syncStatus());
      notify?.("Link created. Open it on your other device.");
    } catch {
      setState(syncStatus());
      notify?.("No relay answered. Try again, or link by hand below.");
    } finally {
      setCreating(false);
    }
  }

  function flash(setter) {
    setter(true);
    setTimeout(() => setter(false), 1800);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildDeviceLink());
      flash(setCopied);
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
        ? "Save sent — your other device has it."
        : result.reason === "offline"
          ? "The relay is offline, so there is nobody to send to."
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
      flash(setCodeCopied);
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
        ? `Linked through ${next}.`
        : "Relay reset to this site's own address.",
    );
  }

  const statusText =
    state.status === "live"
      ? state.detail || "Devices live"
      : state.status === "waiting"
        ? "Waiting for the other device…"
        : state.status === "connecting"
          ? "Connecting…"
          : state.status === "error"
            ? state.detail || "Relay unreachable."
            : "Not linked";

  return (
    <div className="settings-group">
      <h2>
        <Link2 size={16} aria-hidden="true" /> Link devices
      </h2>
      <p className="settings-group-note">
        Two browsers, one account, no database: saves are forwarded straight
        between your devices, and the relay only ever holds the newest one in
        memory. Buy on your phone, watch it land on your PC. One device can stay
        closed while the other keeps playing, and everything meets again the
        moment both are back on the link. Whoever holds the link plays this
        account, so treat it like a password.
      </p>
      <div className="setting-row">
        <div className="setting-copy">
          <label htmlFor="sync-status-row">This account</label>
          <p>
            {linked
              ? "Both devices share one save, live. Closing one does not delete anything."
              : progress?.profile
                ? "Create a link here, then open it on your other device."
                : "Guests can open a link, but a local profile is needed to start one."}
          </p>
        </div>
        <span
          id="sync-status-row"
          className={`sync-status is-${state.status}`}
          data-testid="sync-status"
          data-direction={state.lastDirection || undefined}
        >
          <i className="sync-dot" aria-hidden="true" />
          {exchanges > 0 && (
            <b
              key={`ping-${exchanges}`}
              className="sync-ping"
              aria-hidden="true"
            />
          )}
          {statusText}
        </span>
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
              onClick={copy}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
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
          <p className="sync-note" data-testid="sync-note" key={exchanges}>
            {lastLine ||
              "The link is open. Anything that changes here is sent straight over."}
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
          <Link2 size={14} /> {creating ? "Contacting relay…" : "Create link"}
        </button>
      )}
      <details className="sync-hand">
        <summary>
          <Handshake size={14} aria-hidden="true" /> No relay? Link by hand
        </summary>
        <p className="sync-hand-note">
          A live link needs a relay somewhere; a code does not. Copy this
          account's code and adopt it on the other device — no server, no
          address to configure, just the save itself in one blob of text.
        </p>
        <div className="sync-hand-row">
          <button
            type="button"
            className="secondary-button sync-action"
            data-testid="peer-code-copy"
            onClick={copyCode}
          >
            {codeCopied ? <Check size={14} /> : <Copy size={14} />}
            {codeCopied ? "Code copied" : "Copy this account's code"}
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
      <div className="setting-row sync-relay-row">
        <div className="setting-copy">
          <label htmlFor="setting-relay">Relay</label>
          <p>
            {`This page talks to ${relayEndpoint()}. A static deployment has no relay of its own: run npm run relay and point this page at it here.`}
          </p>
        </div>
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
              notify?.("Relay reset to this site's own address.");
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ id, label, description, checked, onChange, disabled }) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <label htmlFor={id}>{label}</label>
        {description && <p>{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className="setting-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="setting-thumb" aria-hidden="true" />
        {checked ? "On" : "Off"}
      </button>
    </div>
  );
}

export default function Settings({ notify, progress, onAction, navigate }) {
  const { settings, update, reset, saveError } = useSettings();
  const [permission, setPermission] = useState(notificationPermission);
  useEffect(() => {
    const refresh = () => setPermission(notificationPermission());
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  const unsupported = permission === "unsupported";
  const denied = permission === "denied";

  async function toggleNotifications(next) {
    if (!next) {
      update({ notifyReady: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      update({ notifyReady: true });
      notify?.("Desktop notifications enabled for finished cooldowns.");
    } else {
      update({ notifyReady: false });
      notify?.(
        result === "unsupported"
          ? "This browser does not support desktop notifications."
          : "Your browser blocked notifications. Allow them in site settings and try again.",
      );
    }
  }

  return (
    <section className="settings-panel" aria-label="Game settings">
      <div className="settings-group">
        <h2>
          <Bell size={16} aria-hidden="true" /> Alerts
        </h2>
        <p className="settings-group-note">
          Alerts only announce a cooldown that has already finished. They never
          roll for you, never award EP, and never change your timings.
        </p>
        <Toggle
          id="setting-notify-ready"
          label="Desktop notification when a roll is ready"
          description={
            unsupported
              ? "This browser does not support desktop notifications."
              : denied
                ? "Blocked by your browser. Allow notifications for this site, then switch this on."
                : "Sent only while this tab is in the background, once per cooldown."
          }
          checked={settings.notifyReady && permission === "granted"}
          disabled={unsupported || denied}
          onChange={toggleNotifications}
        />
        <Toggle
          id="setting-notify-sound"
          label="Play a chime when a roll is ready"
          description="A short two-tone sound, also only while the tab is in the background."
          checked={settings.notifySound}
          onChange={(next) => update({ notifySound: next })}
        />
        <div className="setting-row">
          <div className="setting-copy">
            <label htmlFor="setting-test-alert">Test your alerts</label>
            <p>Sends the same notification and chime you would receive.</p>
          </div>
          <button
            id="setting-test-alert"
            type="button"
            className="secondary-button"
            onClick={() => {
              const shown =
                settings.notifyReady &&
                showReadyNotification({
                  title: "Test alert",
                  body: "This is how RNGdle Infinite will tell you a roll is ready.",
                });
              const played = settings.notifySound && playReadyChime();
              notify?.(
                shown || played
                  ? "Test alert sent."
                  : "Enable an alert above to test it.",
              );
            }}
          >
            {settings.notifyReady || settings.notifySound ? (
              <>
                <Volume2 size={14} /> Test
              </>
            ) : (
              <>
                <BellOff size={14} /> Test
              </>
            )}
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h2>
          <Eye size={16} aria-hidden="true" /> Presentation
        </h2>
        <div className="setting-row">
          <div className="setting-copy">
            <label htmlFor="setting-motion">Reveal motion</label>
            <p>
              Reduced motion completes the reveal instantly. It never shortens
              your cooldown or changes a score.
            </p>
          </div>
          <select
            id="setting-motion"
            value={settings.reduceMotion}
            onChange={(e) => update({ reduceMotion: e.target.value })}
          >
            <option value="system">Match system</option>
            <option value="off">Full animation</option>
            <option value="on">Reduced motion</option>
          </select>
        </div>
        <Toggle
          id="setting-skill-bar"
          label="Show the skill bar"
          description="Hide the charged circles in the top-left corner of the Roll page. Charge keeps accumulating either way, and Flywheel stays in the rack."
          checked={settings.showSkillBar}
          onChange={(next) => update({ showSkillBar: next })}
        />
        <Toggle
          id="setting-goal-recap"
          label="Show goal progress after each roll"
          description="A savings summary for your chosen goal, shown once the reveal finishes. It never changes prices or EP."
          checked={settings.showGoalRecap}
          onChange={(next) => update({ showGoalRecap: next })}
        />
        <Toggle
          id="setting-compact-numbers"
          label="Compact large EP numbers"
          description="Show 12.5M instead of 12,500,000 in prices and balances."
          checked={settings.compactNumbers}
          onChange={(next) => update({ compactNumbers: next })}
        />
      </div>

      <div className="settings-group">
        <h2>
          <Gamepad2 size={16} aria-hidden="true" /> Gameplay
        </h2>
        <Toggle
          id="setting-confirm-purchases"
          label="Confirm every purchase"
          description="Turn off to buy shop items in one click. Prices and prerequisites are unchanged."
          checked={settings.confirmPurchases}
          onChange={(next) => update({ confirmPurchases: next })}
        />
        <Toggle
          id="setting-auto-roll-default"
          label="Start Auto-Roll enabled"
          description="Applies when you own Auto-Roll. Persistence Core remembers your last switch instead."
          checked={settings.autoRollDefault}
          onChange={(next) => update({ autoRollDefault: next })}
        />
      </div>

      <DeviceLink progress={progress} notify={notify} />

      {progress && (
        <div className="settings-group">
          <h2>
            <Shirt size={16} aria-hidden="true" /> Wardrobe
          </h2>
          <p className="settings-group-note">
            Switch between the auras you already own, previewed on any rarity.
            Equipping is free and never changes a score or your odds.
          </p>
          <AuraWardrobe
            progress={progress}
            onAction={onAction}
            navigate={navigate}
            notify={notify}
          />
        </div>
      )}
      {saveError && (
        <p className="settings-error" role="alert">
          {saveError}
        </p>
      )}
      <div className="settings-footer">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            reset();
            notify?.("Settings restored to their defaults.");
          }}
        >
          <RotateCcw size={14} /> Restore defaults
        </button>
        <small>
          Settings are saved in this browser only, separately from your game
          progress. They are kept when you delete your account.
        </small>
      </div>
    </section>
  );
}
