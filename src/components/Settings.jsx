import React, { useEffect, useState } from "react";
import { Bell, BellOff, Volume2, Eye, Gamepad2, RotateCcw } from "lucide-react";
import { useSettings } from "../use-settings.jsx";
import {
  notificationPermission,
  playReadyChime,
  requestNotificationPermission,
  showReadyNotification,
} from "../notifications.js";
import "../settings.css";

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

export default function Settings({ notify }) {
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
          id="setting-flywheel-meter"
          label="Show the Flywheel meter"
          description="Hide the charge meter on the Roll page. Charge keeps accumulating either way."
          checked={settings.showFlywheelMeter}
          onChange={(next) => update({ showFlywheelMeter: next })}
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
