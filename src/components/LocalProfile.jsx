import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ArrowRight,
  Trash2,
  ShieldCheck,
  X,
  Dices,
  Download,
  ImagePlus,
  Link2,
  Share2,
  UserRound,
} from "lucide-react";
import { validUsername } from "../progress.js";
import { AVATAR_ACCEPT, fileToAvatar } from "../avatar.js";
import { exportFileName, renderExportPngBlob } from "../profile-stats.js";
import { shareCardData, shareCardUrl } from "../profile-card.js";
import ProfileRecord from "./ProfileRecord.jsx";
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
  const [shareNote, setShareNote] = useState("");
  // The link is the profile address with the card in it. Copying is the
  // happy path; when the clipboard is off limits the link is shown to copy
  // by hand instead of failing quietly.
  const [shareLink, setShareLink] = useState("");
  async function copyProfileLink() {
    const url = shareCardUrl(progress, location.origin);
    try {
      await navigator.clipboard.writeText(url);
      setShareLink("");
      setShareNote("Link copied. Anyone who opens it sees this record.");
    } catch {
      setShareLink(url);
      setShareNote("Copy the link below.");
    }
  }
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
          // The logo is its own control: click it to add or replace the
          // picture. No separate upload section.
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
            title={
              avatar ? "Click to replace your logo" : "Click to add a logo"
            }
            onClick={() => fileInput.current?.click()}
          >
            <AvatarMark avatar={avatar} size={52} label="" />
            <span className="profile-logo-overlay" aria-hidden="true">
              <ImagePlus size={16} />
            </span>
          </button>
        )}
        {profile
          ? `Your profile, ${profile.username}`
          : "Start saving your progress"}
      </h2>
      {profile && (
        <input
          ref={fileInput}
          className="profile-logo-input"
          type="file"
          accept={AVATAR_ACCEPT}
          data-testid="avatar-input"
          onChange={chooseLogo}
          aria-label="Upload a logo"
        />
      )}
      {profile && (avatar || logoNote) && (
        <p className="profile-logo-line">
          {logoNote && <span role="status">{logoNote}</span>}
          {avatar && (
            <button
              type="button"
              className="profile-logo-remove"
              data-testid="avatar-remove"
              onClick={removeLogo}
            >
              <Trash2 size={12} aria-hidden="true" /> Remove logo
            </button>
          )}
        </p>
      )}
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
            <button
              type="button"
              className="secondary-button"
              data-testid="profile-share"
              onClick={copyProfileLink}
            >
              <Share2 size={15} aria-hidden="true" /> Copy profile link
            </button>
          </div>
          {shareNote && (
            <p className="profile-share-note" role="status">
              {shareNote}
              {shareLink && (
                <input
                  readOnly
                  value={shareLink}
                  aria-label="Profile link"
                  onFocus={(event) => event.target.select()}
                />
              )}
            </p>
          )}
          <p className="profile-export-note">
            One-way export: a sharp PNG card with your name, your biggest roll,
            your pinned rolls and your key figures. The profile link carries the
            same record inside the address, so it opens anywhere without an
            account. Nothing in the game reads a card or a link back, so neither
            can overwrite the game in this browser.
          </p>
          {progress && <ProfileRecord record={shareCardData(progress)} />}
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
