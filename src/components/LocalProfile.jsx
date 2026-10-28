import React, { useRef, useState } from "react";
import {
  Check,
  ArrowRight,
  Trash2,
  Dices,
  Download,
  ImagePlus,
  Share2,
  UserRound,
} from "lucide-react";
import { validUsername } from "../progress.js";
import { ROLLBACK_AFTER_PRESTIGES } from "../rebirth.js";
import { AVATAR_ACCEPT, compactAvatar, fileToAvatar } from "../avatar.js";
import { exportFileName, renderExportPngBlob } from "../profile-stats.js";
import { shareCardData, shareCardUrl } from "../profile-card.js";
import { publicProfileUrl } from "../public-profile.js";
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

// Every prestige means the six rungs were climbed once more; every Rollback
// means three prestiges and its own climb on top.
function ladderClimbs(progress) {
  const n =
    (progress.ultraRebirths ?? 0) +
    (progress.rollbacks ?? 0) * (ROLLBACK_AFTER_PRESTIGES + 1);
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

export default function LocalProfile({
  profile,
  progress,
  onAction,
  onContinue,
  onProfileDeleted,
  cloudAccount = null,
  preserveGuestProgress = false,
  canContinue = true,
  canEdit = true,
  profileLinkAvailable = false,
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
  // Cloud profiles use a clean /profile/<username> URL and load their latest
  // public summary. A local-only profile keeps the legacy read-only snapshot
  // link until it is migrated to an account.
  const [shareLink, setShareLink] = useState("");
  async function copyProfileLink() {
    let url;
    if (cloudAccount) {
      if (!profileLinkAvailable) {
        setShareLink("");
        setShareNote(
          "Your public profile will be ready once your progress is saved online.",
        );
        return;
      }
      url = publicProfileUrl(profile.username, location.origin);
    } else {
      const avatar = await compactAvatar(profile?.avatar ?? "");
      url = shareCardUrl(
        avatar
          ? { ...progress, profile: { ...progress.profile, avatar } }
          : progress,
        location.origin,
      );
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareLink("");
      setShareNote(
        cloudAccount
          ? "Public profile link copied. Anyone can view your profile summary."
          : "Progress card link copied. Anyone with the link can view this copy.",
      );
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
      setLogoNote(outcome.ok ? "Logo saved." : outcome.message);
    } catch (failure) {
      setLogoNote(
        "That image could not be used. Choose another one and try again.",
      );
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
        preserveGuest: preserveGuestProgress,
        id: crypto.randomUUID(),
        createdAt: Math.ceil(Date.now()),
      });
      if (!outcome.ok) setError(outcome.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function deleteGameSave(event) {
    event.preventDefault();
    if (busy.current || confirmation !== "DELETE") return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onAction({ type: "delete", profileId: profile.id });
      if (result.ok) {
        // The page stays: with the profile gone, the account setup returns.
        setDeleting(false);
        setConfirmation("");
        onProfileDeleted?.();
      } else setError(result.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (profile && deleting && canEdit)
    return (
      <>
        <h2>Delete game profile &amp; progress</h2>
        <form className="delete-confirm" onSubmit={deleteGameSave}>
          <p>
            Delete <strong>{profile.username}</strong>’s profile and all
            progress?
          </p>
          <p>
            This removes the progress saved on this device
            {cloudAccount ? " and its online copy." : "."}{" "}
            {cloudAccount
              ? "Your Firebase sign-in remains; use the Cloud Account section to delete it too."
              : "Your online progress is untouched while you’re signed out. Appearance settings stay."}{" "}
            Rolls in other open games are cancelled. This cannot be undone.
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
              {pending ? "Deleting…" : "Permanently delete game save"}
            </button>
          </div>
        </form>
      </>
    );
  return (
    <>
      <h2 className="profile-title">
        {profile && canEdit && (
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
      {profile && canEdit && (
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
      {profile && canEdit && (avatar || logoNote) && (
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
      {profile &&
        ((progress?.ultraRebirths ?? 0) > 0 ||
          (progress?.rollbacks ?? 0) > 0) && (
          <p className="profile-prestige">
            <span aria-hidden="true">✦</span>{" "}
            {progress.rollbacks > 0 ? `Rollback ×${progress.rollbacks} · ` : ""}
            Prestige ×{progress.ultraRebirths ?? 0} · ladder climbed{" "}
            {ladderClimbs(progress)}
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
          {cloudAccount && (
            <div className="info-box">
              Your profile summary is public; your email and full save are not.
            </div>
          )}
          <div className="profile-actions">
            {canContinue ? (
              <button className="primary-button" onClick={onContinue}>
                Continue playing <ArrowRight size={16} />
              </button>
            ) : (
              <p className="profile-lock-note">
                Sign in for an online backup or choose Continue locally to play.
              </p>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => downloadExport(progress)}
            >
              <Download size={15} aria-hidden="true" /> Export my data
            </button>
            {canEdit && (
              <button
                type="button"
                className="secondary-button"
                data-testid="profile-share"
                onClick={copyProfileLink}
                disabled={Boolean(cloudAccount && !profileLinkAvailable)}
                title={
                  cloudAccount && !profileLinkAvailable
                    ? "Your public profile will be ready once your progress is saved online."
                    : undefined
                }
              >
                <Share2 size={15} aria-hidden="true" />
                {cloudAccount ? "Copy profile link" : "Copy progress card link"}
              </button>
            )}
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
            {cloudAccount
              ? "Export a profile card or share your public profile."
              : "Download or share a copy of your progress card."}
          </p>
          {progress && <ProfileRecord record={shareCardData(progress)} />}
          {canEdit && (
            <div className="account-danger">
              <button
                className="danger-button"
                onClick={() => {
                  setDeleting(true);
                  setError("");
                }}
              >
                Delete profile &amp; game save
              </button>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={register}>
          <p>
            Choose a name to save progress on this device.{" "}
            {preserveGuestProgress
              ? "Your current guest progress will be kept."
              : "Guest progress from this session will not carry over."}{" "}
            An online backup is optional and can be added later.
          </p>
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
            This profile stays on this device. Clearing this game’s saved data
            removes it.
          </p>
        </form>
      )}
    </>
  );
}
