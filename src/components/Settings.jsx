import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Cloud,
  UserRound,
  BellOff,
  BookOpen,
  Download,
  Eye,
  Gamepad2,
  History,
  RotateCcw,
  RefreshCw,
  ScrollText,
  Shirt,
  Volume2,
} from "lucide-react";
import AuraWardrobe from "./AuraWardrobe";
import { useSettings } from "../use-settings.jsx";
import { NOTIFICATION_RANKS } from "../settings.js";
import {
  notificationPermission,
  playReadyChime,
  requestNotificationPermission,
  showReadyNotification,
} from "../notifications.js";
import { openInstallBanner } from "./InstallApp.jsx";
import "../settings.css";

function rankLabel(rank) {
  return rank ? rank[0].toUpperCase() + rank.slice(1) : "";
}

function savedAt(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

export default function Settings({
  notify,
  progress,
  onAction,
  navigate,
  appUpdate,
  onStartUpdate,
  onStopUpdate,
  vault,
}) {
  const { settings, update, reset, saveError } = useSettings();
  const [permission, setPermission] = useState(notificationPermission);
  // The automatic backup and the separate copy kept when progress differs.
  const [backup, setBackup] = useState(() => vault?.get?.() ?? null);
  const [recovery, setRecovery] = useState(
    () => vault?.getRecovery?.() ?? null,
  );
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setPermission(notificationPermission());
      setBackup(vault?.get?.() ?? null);
      setRecovery(vault?.getRecovery?.() ?? null);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  const unsupported = permission === "unsupported";
  const denied = permission === "denied";
  const notificationsActive = settings.notifyReady && permission === "granted";
  const rankActive = settings.notifyRankEnabled && permission === "granted";

  async function toggleNotifications(next) {
    if (!next) {
      update({ notifyReady: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      update({ notifyReady: true });
      notify?.({
        kind: "done",
        text: "Desktop notifications enabled for ready rolls and rank alerts.",
      });
    } else {
      update({ notifyReady: false });
      notify?.({
        kind: "warning",
        text:
          result === "unsupported"
            ? "Desktop alerts are not available on this device."
            : "Allow notifications for this game in your settings, then try again.",
      });
    }
  }

  async function toggleRankNotifications() {
    if (settings.notifyRankEnabled) {
      update({ notifyRankEnabled: false });
      return;
    }
    if (unsupported || denied) return;
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      update({ notifyRankEnabled: true });
      notify?.({
        kind: "done",
        text: "Rank alerts enabled. Choose a minimum rank above to be alerted and stop Auto-Roll for review.",
      });
    } else {
      update({ notifyRankEnabled: false });
      notify?.({
        kind: "warning",
        text:
          result === "unsupported"
            ? "Desktop alerts are not available on this device."
            : "Allow notifications for this game in your settings, then try again.",
      });
    }
  }

  // One button for the section: the ready notification and its chime. The
  // rank alert stays the player's own choice, and the permission prompt is
  // the only thing the button cannot answer for them.
  async function enableNotifications() {
    let result = permission;
    if (result !== "granted") {
      result = await requestNotificationPermission();
      setPermission(result);
    }
    const granted = result === "granted";
    update({ notifyReady: granted, notifySound: true });
    notify?.(
      granted
        ? { kind: "done", text: "Notifications are on." }
        : {
            kind: "warning",
            text:
              result === "unsupported"
                ? "Desktop alerts are not available on this device. The chime is on."
                : "Allow notifications for this game in your settings, then try again. The chime is on.",
          },
    );
  }

  return (
    <section className="settings-panel" aria-label="Game settings">
      <div className="settings-group">
        <h2>
          <Bell size={16} aria-hidden="true" /> Alerts
        </h2>
        <p className="settings-group-note">
          Desktop alerts can announce a finished cooldown or a rank you choose.
          They never roll for you, award EP, or change your timings.
        </p>
        <div className="setting-row">
          <div className="setting-copy">
            <p className="setting-title">Turn on notifications</p>
            <p>
              One button for the ready notification and its chime. A rank alert
              stays yours to choose below.
            </p>
          </div>
          <button
            id="setting-notify-all"
            type="button"
            className="secondary-button"
            disabled={unsupported}
            onClick={enableNotifications}
          >
            {notificationsActive && settings.notifySound
              ? "Notifications on"
              : "Enable notifications"}
          </button>
        </div>
        <Toggle
          id="setting-notify-ready"
          label="Desktop notification when a roll is ready"
          description={
            unsupported
              ? "Desktop alerts are not available on this device."
              : denied
                ? "Allow notifications for this game in your settings, then try again."
                : "Sent once when your roll is ready, while you are away from the game."
          }
          checked={settings.notifyReady && permission === "granted"}
          disabled={unsupported || denied}
          onChange={toggleNotifications}
        />
        <Toggle
          id="setting-notify-rank-toggle"
          label="Notify me at this rank or higher"
          description={
            unsupported
              ? "Rank alerts are not available on this device."
              : denied
                ? "Allow notifications for this game in your settings, then try again."
                : "Rolls at the chosen rank or higher alert you and stop Auto-Roll for review. Independent of the ready-roll notification."
          }
          checked={rankActive}
          disabled={unsupported || denied}
          onChange={toggleRankNotifications}
        />
        <div className="setting-row setting-rank-row">
          <div className="setting-copy">
            <label htmlFor="setting-notify-rank-select">Minimum rank</label>
            <p>
              {!rankActive
                ? "Turn on rank alerts above to choose a minimum rank."
                : denied
                  ? "Allow desktop notifications to receive rank alerts."
                  : "Rolls at this rank or higher alert you and stop Auto-Roll for review."}
            </p>
          </div>
          <select
            id="setting-notify-rank-select"
            value={settings.notifyRank ?? ""}
            disabled={!rankActive || unsupported || denied}
            onChange={(event) =>
              update({ notifyRank: event.target.value || null })
            }
          >
            <option value="">No rank alert</option>
            {NOTIFICATION_RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rankLabel(rank)} or higher
              </option>
            ))}
          </select>
        </div>
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
                  ? { kind: "done", text: "Test alert sent." }
                  : { kind: "info", text: "Enable an alert above to test it." },
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

      <div className="settings-group">
        <h2>
          <Cloud size={16} aria-hidden="true" /> Online account
        </h2>
        <p className="settings-group-note">
          Link a Cloud Account for an online backup. If this device and your
          online account have different progress, you choose which to keep; the
          other copy stays safe here.
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("profile")}
        >
          <UserRound size={14} aria-hidden="true" /> Open profile &amp; sign-in
        </button>
      </div>

      {/* The footer never paints on phones, so its destinations live here —
          the group only renders where the footer is gone. */}
      <div className="settings-group settings-mobile-only">
        <h2>
          <Gamepad2 size={16} aria-hidden="true" /> More
        </h2>
        <div className="settings-more-links">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("about")}
          >
            <BookOpen size={14} /> How to play
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("changelog")}
          >
            <ScrollText size={14} /> Changelog
          </button>
          <a
            className="secondary-button"
            href="https://www.rngdle.com/"
            target="_blank"
            rel="noreferrer"
          >
            <ArrowUpRight size={14} /> Real game
          </a>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              navigate("roll");
              setTimeout(openInstallBanner, 350);
            }}
          >
            <Download size={14} /> Get the app
          </button>
        </div>
      </div>

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
            notify?.({
              kind: "done",
              text: "Settings restored to their defaults.",
            });
          }}
        >
          <RotateCcw size={14} /> Restore defaults
        </button>
        <small>
          Settings stay on this device, separate from your game progress.
          Deleting your game profile does not remove them or your sign-in.
        </small>
      </div>
      <div className="settings-save" data-testid="settings-backup">
        <h2>Your save</h2>
        <p>
          {backup
            ? `A backup copy was saved on ${savedAt(backup.at)}.`
            : "No backup copy has been made yet. One is saved automatically as you play."}
        </p>
        <button
          type="button"
          className="secondary-button"
          data-testid="settings-restore-backup"
          disabled={!backup || restoring}
          onClick={() => {
            setRestoring(true);
            const outcome = vault?.restore?.();
            setRestoring(false);
            notify?.(
              outcome?.ok
                ? {
                    kind: "done",
                    title: "Backup restored",
                    text: "The last saved copy is back on this device.",
                  }
                : {
                    kind: "error",
                    text:
                      outcome?.message ?? "The backup could not be restored.",
                  },
            );
          }}
        >
          <History size={14} />{" "}
          {restoring ? "Restoring…" : "Restore the last backup"}
        </button>
        <small>
          Your progress stays on this device when you reload or update the game.
          Deleting your game profile also deletes its online copy when you’re
          signed in, but keeps your sign-in. We keep a second copy here just in
          case.
        </small>
      </div>
      <div className="settings-save" data-testid="settings-cloud-recovery">
        <h2>Progress recovery</h2>
        <p>
          {recovery
            ? `A second copy of your progress was saved on ${savedAt(recovery.at)}.`
            : "If this device and your online account have different progress, the copy you don’t choose is kept here."}
        </p>
        <button
          type="button"
          className="secondary-button"
          data-testid="settings-restore-cloud-recovery"
          disabled={!recovery || restoring}
          onClick={() => {
            setRestoring(true);
            const outcome = vault?.restoreRecovery?.();
            setRestoring(false);
            setRecovery(vault?.getRecovery?.() ?? null);
            notify?.(
              outcome?.ok
                ? {
                    kind: "done",
                    title: "Recovery copy restored",
                    text: "Your progress is back on this device. If the online copy differs, you’ll be asked which to keep.",
                  }
                : {
                    kind: "error",
                    text:
                      outcome?.message ??
                      "The recovery copy could not be restored.",
                  },
            );
          }}
        >
          <History size={14} />{" "}
          {restoring ? "Restoring…" : "Restore other saved copy"}
        </button>
        <small>
          Kept on this device. Restoring it will ask before changing different
          online progress.
        </small>
      </div>
      <div className="settings-update">
        <button
          type="button"
          className="secondary-button"
          data-testid="settings-update"
          onClick={() =>
            appUpdate?.active ? onStopUpdate?.() : onStartUpdate?.()
          }
        >
          <RefreshCw
            size={14}
            className={appUpdate?.active ? "is-spinning" : undefined}
            aria-hidden="true"
          />
          {appUpdate?.active ? "Stop refresh" : "Refresh game"}
        </button>
        <p data-testid="update-status" role="status" aria-live="polite">
          {appUpdate?.message ||
            "Refreshes the game to get the latest version. Your progress, profile and settings stay saved."}
        </p>
      </div>
    </section>
  );
}
