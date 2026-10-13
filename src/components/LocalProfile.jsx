import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ArrowRight,
  Trash2,
  ShieldCheck,
  X,
  Dices,
  Download,
  History,
  ImagePlus,
  Bookmark,
  Sparkles,
  Link2,
  UserRound,
} from "lucide-react";
import { BOOKMARK_LIMIT, validUsername } from "../progress.js";
import { prestigeShown } from "../rebirth.js";
import { AVATAR_ACCEPT, fileToAvatar } from "../avatar.js";
import {
  accountStats,
  exportFileName,
  profileHighlights,
  renderExportPngBlob,
} from "../profile-stats.js";
import NumberBox from "./NumberBox.jsx";
import "../profile.css";

// A one-way export: the browser saves a PNG card with the account name,
// biggest roll and key stats. Nothing in the game reads a card back — a card
// you downloaded can never overwrite the game you are playing.
async function downloadExport(progress) {
  const blob = await renderExportPngBlob(progress);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(progress);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatStatEP(value) {
  return `${Math.round(value).toLocaleString("en-US")} EP`;
}

function when(at) {
  if (!at) return "—";
  return new Date(at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The account's face: the logo it uploaded, or the neutral icon every new
// account starts with. Used by the profile page, the header button and the
// sign-up preview, so all three can never disagree.
export function AvatarMark({
  avatar,
  size = 40,
  label = "",
  syncState = "",
  syncLabel = "",
}) {
  return (
    <span
      className={`avatar-mark ${avatar ? "has-logo" : ""}`}
      style={{ "--avatar-size": `${size}px` }}
      data-avatar={avatar ? "logo" : "icon"}
      data-sync-status={syncState || undefined}
      data-testid={syncState ? "profile-sync-indicator" : undefined}
      title={syncLabel || undefined}
      aria-label={label || undefined}
      role={label ? "img" : undefined}
    >
      {avatar ? (
        <img src={avatar} alt="" draggable="false" />
      ) : (
        <UserRound size={Math.round(size * 0.55)} aria-hidden="true" />
      )}
    </span>
  );
}

// The record: the best roll, the pinned rolls, four figures, and what the
// account is wearing. Short on purpose; the activity log has the rest.
function ProfileHistory({ progress }) {
  const stats = accountStats(progress);
  const highlights = profileHighlights(progress);
  const best = highlights.bestRoll;
  const items = [
    ["Rolls completed", stats.rolls.toLocaleString("en-US")],
    ["EP earned all-time", formatStatEP(stats.totalEarned)],
    ["Badges discovered", `${stats.uniqueBadges} of ${stats.badgesTotal}`],
    prestigeShown(stats)
      ? ["Rebirths · prestiges", `${stats.rebirths} · ${stats.ultraRebirths}`]
      : ["Rebirths", `${stats.rebirths}`],
  ];
  return (
    <section className="profile-history" aria-label="Your record">
      <h3>
        <History size={15} aria-hidden="true" /> Your record
      </h3>
      <div className="profile-best" data-best-roll={best?.number ?? ""}>
        <NumberBox
          compact
          value={best?.number ?? "??????"}
          tier={best?.tier ?? "neutral"}
          aria-label={best ? `Best roll ${best.number}` : "No best roll yet"}
        />
        <div className="profile-best-copy">
          <span className="profile-kicker">Best roll</span>
          {best ? (
            <>
              <strong>+{formatStatEP(best.ep)}</strong>
              <small>
                {best.tier.toUpperCase()} · {when(best.at)}
              </small>
            </>
          ) : (
            <small>Your biggest roll will sit here.</small>
          )}
        </div>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="profile-pins">
        <span className="profile-kicker">
          <Bookmark size={12} aria-hidden="true" /> Pinned rolls
        </span>
        {highlights.pinned.length ? (
          <ul aria-label="Pinned rolls">
            {highlights.pinned.map((roll) => (
              <li key={roll.id}>
                <NumberBox
                  compact
                  value={roll.number}
                  tier={roll.tier}
                  aria-label={`Pinned roll ${roll.number}`}
                />
                <small>+{formatStatEP(roll.ep)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <small className="profile-pins-empty">
            Bookmark up to {BOOKMARK_LIMIT} rolls in History and they show here.
          </small>
        )}
      </div>
      <p className="profile-wearing">
        <Sparkles size={12} aria-hidden="true" />
        <span>
          Wearing{" "}
          <strong>{highlights.aura?.name ?? "the original look"}</strong>
          {highlights.companion ? (
            <>
              {" "}
              with <strong>{highlights.companion.name}</strong>
            </>
          ) : null}
          {stats.favoriteTier ? (
            <>
              {" "}
              · most rolls land <strong>{stats.favoriteTier}</strong>
            </>
          ) : null}
          .
        </span>
      </p>
      <p className="profile-history-note">
        Read from your activity log and your save. The log keeps every cycle,
        and clearing history never lowers these figures.
      </p>
    </section>
  );
}

// Suggestions are cosmetic only: a starting point for the name field.
const NAME_PARTS = [
  ["Lucky", "Golden", "Cosmic", "Quiet", "Feral", "Velvet", "Neon", "Humble"],
  ["Comet", "Otter", "Pigeon", "Cipher", "Marble", "Falcon", "Ember", "Badger"],
];
function suggestName() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(NAME_PARTS[0])}${pick(NAME_PARTS[1])}${Math.floor(
    Math.random() * 90 + 10,
  )}`;
}

export default function LocalProfile({
  profile,
  progress,
  onAction,
  onContinue,
  navigate,
}) {
  const [username, setUsername] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const busy = useRef(false);
  const fileInput = useRef(null);
  const [logoNote, setLogoNote] = useState("");
  const [choosing, setChoosing] = useState(false);
  const avatar = profile?.avatar ?? "";
  async function chooseLogo(event) {
    const file = event.target.files?.[0];
    // Reset first: choosing the same file twice must work.
    event.target.value = "";
    if (!file) return;
    setChoosing(true);
    setLogoNote("");
    try {
      const data = await fileToAvatar(file);
      const outcome = await onAction({ type: "avatar", avatar: data });
      setLogoNote(
        outcome.ok
          ? "Logo saved — it travels with your account and its device link."
          : outcome.message,
      );
    } catch (failure) {
      setLogoNote(failure.message);
    } finally {
      setChoosing(false);
    }
  }
  async function removeLogo() {
    const outcome = await onAction({ type: "avatar", avatar: "" });
    setLogoNote(
      outcome.ok ? "Logo removed. The account icon is back." : outcome.message,
    );
  }
  // Live feedback: say what is wrong while typing rather than only on submit.
  const trimmed = username.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;
  const badCharacters =
    trimmed.length >= 3 && !validUsername(trimmed.normalize("NFKC"));
  const ready = validUsername(trimmed.normalize("NFKC"));
  const hint = tooShort
    ? "A little longer — at least 3 characters."
    : badCharacters
      ? "Letters, numbers, underscores and hyphens only."
      : "3–20 letters, numbers, underscores, or hyphens.";
  async function register(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const outcome = await onAction({
        type: "register",
        username,
        id: crypto.randomUUID(),
        createdAt: Math.ceil(Date.now()),
      });
      if (!outcome.ok) setError(outcome.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function deleteAccount(event) {
    event.preventDefault();
    if (busy.current || confirmation !== "DELETE") return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onAction({ type: "delete", profileId: profile.id });
      if (result.ok) {
        // The page stays: with the profile gone, the sign-up form returns.
        setDeleting(false);
        setConfirmation("");
      } else setError(result.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (profile && deleting)
    return (
      <>
        <h2>Delete account &amp; progress</h2>{" "}
        <form className="delete-confirm" onSubmit={deleteAccount}>
          <p>
            Delete <strong>{profile.username}</strong> and start over?
          </p>
          <p>
            This removes your local profile, EP, badges, items, cooldown, and
            entire activity history from this browser. Active rolls are
            cancelled in all tabs using this profile. This cannot be undone.
            Your theme preference is kept.
          </p>
          <label>
            Type DELETE to confirm
            <input
              autoFocus
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              disabled={pending}
            />
          </label>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <div className="delete-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => {
                setDeleting(false);
                setConfirmation("");
              }}
            >
              Cancel
            </button>
            <button
              className="danger-button"
              type="submit"
              disabled={pending || confirmation !== "DELETE"}
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </form>
      </>
    );
  return (
    <>
      <h2 className="profile-title">
        {profile && (
          <AvatarMark
            avatar={avatar}
            size={46}
            label={`${profile.username}'s logo`}
          />
        )}
        {profile
          ? `Your profile, ${profile.username}`
          : "Start saving your progress"}
      </h2>
      {profile && (progress?.ultraRebirths ?? 0) > 0 && (
        <p className="profile-prestige">
          <span aria-hidden="true">✦</span>{" "}
          {progress.rollbacks > 0
            ? `Rollback ×${progress.rollbacks}`
            : "Prestige"}{" "}
          · {progress.ultraRebirths} prestige
          {progress.ultraRebirths === 1 ? "" : "s"} beyond the ladder
        </p>
      )}
      {profile && (progress?.freshStarts ?? 0) > 0 && (
        <p className="profile-prestige">
          <span aria-hidden="true">↺</span> Fresh start ×{progress.freshStarts}{" "}
          · this run began from zero by choice
        </p>
      )}
      {profile ? (
        <>
          <p>
            Your EP, discoveries, upgrades, cosmetics, and activity are saved
            automatically.
          </p>
          <div className="info-box">
            This is a local profile on this browser—not an online account. There
            is no password and no cloud backup: a device link can carry the
            profile to other browsers you own, and nothing is stored on a
            server. Clearing site data removes the profile and its progress.
          </div>
          <div className="profile-actions">
            <button className="primary-button" onClick={onContinue}>
              Continue playing <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => downloadExport(progress)}
            >
              <Download size={15} aria-hidden="true" /> Export my data
            </button>
          </div>
          <section className="profile-logo" aria-label="Account logo">
            {/* The picture is the control: click it to pick a file. */}
            <button
              type="button"
              className="profile-logo-button"
              data-testid="avatar-upload"
              data-state={choosing ? "busy" : avatar ? "logo" : "empty"}
              disabled={choosing}
              aria-label={
                choosing
                  ? "Shrinking the logo"
                  : avatar
                    ? "Replace logo"
                    : "Upload logo"
              }
              title={avatar ? "Replace logo" : "Upload logo"}
              onClick={() => fileInput.current?.click()}
            >
              <AvatarMark avatar={avatar} size={64} label="" />
              <span className="profile-logo-overlay" aria-hidden="true">
                <ImagePlus size={18} />
                <small>
                  {choosing ? "Shrinking…" : avatar ? "Replace" : "Upload"}
                </small>
              </span>
            </button>
            <input
              ref={fileInput}
              className="profile-logo-input"
              type="file"
              accept={AVATAR_ACCEPT}
              data-testid="avatar-input"
              onChange={chooseLogo}
              aria-label="Upload a logo"
            />
            <div className="profile-logo-copy">
              <strong>Your logo</strong>
              <p>
                Click the picture to {avatar ? "replace" : "add"} it. It shows
                in the header and on your profile, is saved inside the account
                on this browser and rides along in a device link. Nothing is
                uploaded anywhere.
              </p>
              {avatar && (
                <div className="profile-logo-actions">
                  <button
                    type="button"
                    className="profile-logo-remove"
                    data-testid="avatar-remove"
                    onClick={removeLogo}
                  >
                    <Trash2 size={13} aria-hidden="true" /> Remove logo
                  </button>
                </div>
              )}
              {logoNote && (
                <p className="profile-logo-note" role="status">
                  {logoNote}
                </p>
              )}
            </div>
          </section>
          <p className="profile-export-note">
            One-way export: a sharp PNG card with your name, your biggest roll,
            your pinned rolls and your key figures. Nothing in the game reads a
            card back, so a downloaded file can never overwrite the game in this
            browser.
          </p>
          {progress && <ProfileHistory progress={progress} />}
          <div className="account-danger">
            <button
              className="danger-button"
              onClick={() => {
                setDeleting(true);
                setError("");
              }}
            >
              Delete account &amp; progress
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={register}>
          <p>
            Pick a name and your progress starts saving from this moment on.
          </p>
          <ul className="signup-points">
            <li>
              <ShieldCheck size={15} aria-hidden="true" />
              <span>
                <strong>No email, no password, no server.</strong> The name is
                just a label for a save file in this browser.
              </span>
            </li>
            <li>
              <Check size={15} aria-hidden="true" />
              <span>
                <strong>Saved from here on:</strong> your EP, badges, purchases,
                companions and history.
              </span>
            </li>
            <li>
              <X size={15} aria-hidden="true" />
              <span>
                <strong>Not carried over:</strong> anything you rolled as a
                guest. Guest play is never saved, so you start at 0 EP with an
                empty collection.
              </span>
            </li>
          </ul>
          <label>
            Username
            <span className="signup-field">
              <input
                autoComplete="nickname"
                required
                minLength={3}
                maxLength={20}
                aria-label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your lucky alias"
                disabled={pending}
                aria-invalid={tooShort || badCharacters || undefined}
                aria-describedby="signup-hint"
              />
              <button
                type="button"
                className="signup-suggest"
                onClick={() => {
                  setUsername(suggestName());
                  setError("");
                }}
                disabled={pending}
                aria-label="Suggest a name"
                title="Suggest a name"
              >
                <Dices size={15} />
              </button>
            </span>
          </label>
          <p
            className={`profile-input-hint ${
              tooShort || badCharacters ? "is-invalid" : ""
            } ${ready ? "is-valid" : ""}`}
            id="signup-hint"
          >
            {ready ? (
              <>
                <Check size={12} aria-hidden="true" /> {trimmed} looks good.
              </>
            ) : (
              hint
            )}
          </p>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={pending || !ready}
          >
            {pending ? "Creating profile…" : "Start saving my progress"}{" "}
            <ArrowRight size={16} />
          </button>
          <p className="signup-footnote">
            Clearing your browser's site data deletes the save. You can delete
            it yourself at any time.
          </p>
          {/* Signing up is not the only way in: an account living on another
              device joins this browser through the device link instead of
              starting over. */}
          <div className="signup-link">
            <p>
              <strong>Already play on another device?</strong> Link that account
              here instead — both devices will play the same save.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate?.("settings", "link")}
            >
              <Link2 size={15} aria-hidden="true" /> Link an existing account
            </button>
          </div>
        </form>
      )}
    </>
  );
}
