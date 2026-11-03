import React, { useEffect, useRef, useState } from "react";
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
import { publicProfileId, publicProfileUrl } from "../public-profile.js";
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
const PUBLIC_PROFILE_FIELDS =
  "your username and avatar; profile creation and update dates; your best roll (number, tier, EP and date); up to ten pinned rolls (number, tier and EP); total rolls and all-time EP; badges discovered (out of the total); rebirth and prestige counts; your favorite roll tier, aura and companion.";
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
  publicProfileEnabled = false,
  cloudProfileIdentity = null,
  onSetPublicProfile,
}) {
  const [username, setUsername] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [renaming, setRenaming] = useState(false),
    [renameUsername, setRenameUsername] = useState(""),
    [renamePending, setRenamePending] = useState(false),
    [renameMessage, setRenameMessage] = useState("");
  const [publishingProfile, setPublishingProfile] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const busy = useRef(false);
  const fileInput = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const nameChangeAvailableAt = cloudAccount
    ? Date.parse(cloudProfileIdentity?.nameChangeAvailableAt ?? "")
    : NaN;
  const avatarChangeAvailableAt =
    cloudAccount && cloudProfileIdentity?.reserved
      ? Date.parse(cloudProfileIdentity.avatarChangeAvailableAt ?? "")
      : NaN;
  const nameCooldownActive =
    Boolean(cloudAccount) &&
    Number.isFinite(nameChangeAvailableAt) &&
    clockNow < nameChangeAvailableAt;
  const nameCoolingDown =
    nameCooldownActive && cloudProfileIdentity?.reserved === true;
  const logoNeedsNameReservation =
    Boolean(cloudAccount) && cloudProfileIdentity?.reserved !== true;
  const logoCoolingDown =
    cloudAccount &&
    Number.isFinite(avatarChangeAvailableAt) &&
    clockNow < avatarChangeAvailableAt;
  const logoLocked = logoNeedsNameReservation || logoCoolingDown;
  const nameChangeLabel = Number.isFinite(nameChangeAvailableAt)
    ? new Date(nameChangeAvailableAt).toLocaleString()
    : "";
  const avatarChangeLabel = Number.isFinite(avatarChangeAvailableAt)
    ? new Date(avatarChangeAvailableAt).toLocaleString()
    : "";
  const [logoNote, setLogoNote] = useState("");
  const [shareNote, setShareNote] = useState("");
  // Cloud profiles use a clean /profile/<username> URL only after the owner
  // explicitly enables public visibility. Local-only cards stay one-way
  // snapshots carried by their own read-only links.
  const [shareLink, setShareLink] = useState("");
  async function copyProfileLink() {
    let url;
    if (cloudAccount) {
      if (!profileLinkAvailable) {
        setShareLink("");
        setShareNote(
          publicProfileEnabled
            ? "Your profile is not public right now. Check the online profile status or choose a different name before sharing it."
            : "Your profile is private. Choose Make profile public before copying a public link.",
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

  async function changePublicVisibility(enabled) {
    if (publishingProfile || typeof onSetPublicProfile !== "function") return;
    setPublishingProfile(true);
    setShareLink("");
    setShareNote("");
    try {
      const result = await onSetPublicProfile(enabled);
      setShareNote(
        result?.message ??
          (result?.ok
            ? enabled
              ? "Your public profile is enabled."
              : "Your public profile was removed."
            : "Profile privacy could not be changed. Try again."),
      );
    } catch {
      setShareNote("Profile privacy could not be changed. Try again.");
    } finally {
      setPublishingProfile(false);
    }
  }

  const [choosing, setChoosing] = useState(false);
  const avatar = profile?.avatar ?? "";
  async function chooseLogo(event) {
    const file = event.target.files?.[0];
    // Reset first: choosing the same file twice must work.
    event.target.value = "";
    if (!file) return;
    if (logoLocked) {
      setLogoNote(
        logoNeedsNameReservation
          ? "Choose a unique Cloud profile name before changing its logo."
          : `You can change the Cloud logo again after ${avatarChangeLabel}.`,
      );
      return;
    }
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
    if (logoLocked) {
      setLogoNote(
        logoNeedsNameReservation
          ? "Choose a unique Cloud profile name before changing its logo."
          : `You can change the Cloud logo again after ${avatarChangeLabel}.`,
      );
      return;
    }
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
  const normalizedRenameUsername = renameUsername.trim().normalize("NFKC");
  const savedRenameUsername = cloudAccount
    ? normalizedRenameUsername.toLowerCase()
    : normalizedRenameUsername;
  const currentProfileName = cloudAccount
    ? profile?.username?.toLowerCase()
    : profile?.username;
  const nameTargetCoolingDown =
    Boolean(cloudAccount) &&
    nameCooldownActive &&
    cloudProfileIdentity?.reserved !== true &&
    savedRenameUsername !== cloudProfileIdentity?.usernameKey;
  const validRenameUsername = cloudAccount
    ? Boolean(publicProfileId(savedRenameUsername))
    : validUsername(savedRenameUsername);
  const renameReady =
    validRenameUsername &&
    savedRenameUsername !== currentProfileName &&
    !nameCoolingDown &&
    !nameTargetCoolingDown;
  async function saveProfileName(event) {
    event.preventDefault();
    if (renamePending || !renameReady) return;
    setRenamePending(true);
    setRenameMessage("");
    try {
      const outcome = await onAction({
        type: "rename-profile",
        username: savedRenameUsername,
      });
      if (outcome.ok) {
        setRenaming(false);
        setRenameUsername(savedRenameUsername);
        setRenameMessage(outcome.message || "Profile name updated.");
        setShareLink("");
        setShareNote("");
      } else
        setRenameMessage(
          outcome.message || "Profile name could not be changed.",
        );
    } catch {
      setRenameMessage("Profile name could not be changed. Try again.");
    } finally {
      setRenamePending(false);
    }
  }
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
              ? "Your Firebase sign-in and appearance settings remain. Use Cloud Account above to delete that account and its online data too."
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
            disabled={choosing || logoLocked}
            aria-label={
              choosing
                ? "Shrinking the logo"
                : logoNeedsNameReservation
                  ? "Choose a unique Cloud name before changing the logo"
                  : logoCoolingDown
                    ? `Logo changes available after ${avatarChangeLabel}`
                    : avatar
                      ? "Replace logo"
                      : "Upload logo"
            }
            title={
              logoNeedsNameReservation
                ? "Choose a unique Cloud profile name before changing the logo"
                : logoCoolingDown
                  ? `You can change this logo after ${avatarChangeLabel}`
                  : avatar
                    ? "Click to replace your logo"
                    : "Click to add a logo"
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
          disabled={logoLocked || choosing}
          aria-label="Upload a logo"
        />
      )}
      {profile && canEdit && (avatar || logoNote || logoLocked) && (
        <p className="profile-logo-line">
          {logoNote && <span role="status">{logoNote}</span>}
          {cloudAccount && logoNeedsNameReservation && (
            <span role="status">
              Reserve a unique Cloud profile name before changing its logo.
            </span>
          )}
          {cloudAccount && !logoNeedsNameReservation && logoCoolingDown && (
            <span role="status">
              Cloud logos can change once every 7 days. Available after{" "}
              {avatarChangeLabel}.
            </span>
          )}
          {avatar && (
            <button
              type="button"
              className="profile-logo-remove"
              data-testid="avatar-remove"
              disabled={logoLocked}
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
              {profileLinkAvailable
                ? `Your public profile is enabled. Anyone who knows your name or link can see ${PUBLIC_PROFILE_FIELDS} Your email, Firebase UID, wallet, detailed history and full save stay private. You can make it private here any time.`
                : publicProfileEnabled
                  ? `Public sharing is enabled, but the profile is not currently listed. If a summary is published, anyone who knows your name or link can see ${PUBLIC_PROFILE_FIELDS} Your email, Firebase UID, wallet, detailed history and full save stay private.`
                  : `Public sharing is off by default. If enabled, anyone who knows your name or link can see ${PUBLIC_PROFILE_FIELDS} Your email, Firebase UID, wallet, detailed history and full save stay private. You can turn it off here any time.`}
            </div>
          )}
          {cloudAccount && cloudProfileIdentity?.reserved === false && (
            <p className="profile-rename-note" role="status">
              This profile name is not reserved for this Cloud account. Your
              progress remains private and safe; choose a free name before
              enabling public sharing.
            </p>
          )}
          {canEdit && (
            <div className="profile-rename">
              {renaming ? (
                <form
                  className="profile-rename-form"
                  onSubmit={saveProfileName}
                >
                  <label htmlFor="profile-rename-input">
                    Change profile name
                  </label>
                  <input
                    id="profile-rename-input"
                    autoComplete="nickname"
                    minLength={3}
                    maxLength={20}
                    value={renameUsername}
                    onChange={(event) => setRenameUsername(event.target.value)}
                    disabled={renamePending}
                    aria-describedby="profile-rename-hint"
                  />
                  <p id="profile-rename-hint">
                    3–20 letters, numbers, underscores, or hyphens. Your game
                    progress and profile ID stay the same.
                    {cloudAccount &&
                      " Cloud names are unique across public and private accounts, case-insensitive, and stored in lowercase. After choosing the initial name, you can rename it once every 30 days."}
                    {cloudAccount &&
                      nameCooldownActive &&
                      (cloudProfileIdentity?.reserved === true
                        ? ` You can next change it after ${nameChangeLabel}.`
                        : cloudProfileIdentity?.usernameKey
                          ? ` This Cloud account has a name-change cooldown until ${nameChangeLabel}; the previously assigned name may still be available to reclaim.`
                          : ` No Cloud name is reserved yet. You can choose a Cloud name after ${nameChangeLabel}.`)}
                    {cloudAccount &&
                      " A public profile link changes with the name; old links do not redirect."}
                  </p>
                  <div className="profile-rename-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={renamePending}
                      onClick={() => {
                        setRenaming(false);
                        setRenameMessage("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={renamePending || !renameReady}
                    >
                      {renamePending ? "Changing name…" : "Save name"}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={nameCoolingDown}
                  onClick={() => {
                    setRenameUsername(profile.username);
                    setRenameMessage("");
                    setRenaming(true);
                  }}
                >
                  Change profile name
                </button>
              )}
              {cloudAccount && nameCooldownActive && (
                <p className="profile-rename-note" role="status">
                  {cloudProfileIdentity?.reserved === true
                    ? `Cloud names can be changed once every 30 days. You can next rename after ${nameChangeLabel}.`
                    : cloudProfileIdentity?.usernameKey
                      ? `This Cloud account has a name-change cooldown until ${nameChangeLabel}. If its previous name is still free, you can reclaim it now; other names are available after the cooldown.`
                      : `No Cloud name is reserved yet. You can choose a Cloud name after ${nameChangeLabel}.`}
                </p>
              )}
              {renameMessage && (
                <p className="profile-rename-note" role="status">
                  {renameMessage}
                </p>
              )}
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
            {canEdit && cloudAccount && (
              <button
                type="button"
                className="secondary-button"
                data-testid="profile-visibility"
                aria-pressed={Boolean(publicProfileEnabled)}
                disabled={
                  publishingProfile ||
                  typeof onSetPublicProfile !== "function" ||
                  (!publicProfileEnabled &&
                    cloudProfileIdentity?.reserved === false)
                }
                onClick={() => changePublicVisibility(!publicProfileEnabled)}
              >
                <Share2 size={15} aria-hidden="true" />
                {publishingProfile
                  ? "Updating privacy…"
                  : publicProfileEnabled
                    ? "Make profile private"
                    : "Make profile public"}
              </button>
            )}
            {canEdit && (!cloudAccount || profileLinkAvailable) && (
              <button
                type="button"
                className="secondary-button"
                data-testid="profile-share"
                onClick={copyProfileLink}
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
              ? "Export a profile card, or enable public sharing before copying a cloud profile link."
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
