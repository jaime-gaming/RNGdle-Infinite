import React, { useRef, useState } from "react";
import {
  UserRound,
  Check,
  ArrowRight,
  Trash2,
  ShieldCheck,
  X,
  Dices,
} from "lucide-react";
import { validUsername } from "../progress.js";

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

export default function LocalProfile({ profile, onAction, onClose }) {
  const [username, setUsername] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const busy = useRef(false);
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
      if (result.ok) onClose();
      else setError(result.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (profile && deleting)
    return (
      <>
        <div className="modal-symbol">
          <Trash2 size={28} />
        </div>
        <h2 id="modal-title">Delete account &amp; progress</h2>{" "}
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
      <div className="modal-symbol">
        {profile ? <Check size={28} /> : <UserRound size={28} />}
      </div>
      <h2 id="modal-title">
        {profile
          ? `Your profile, ${profile.username}`
          : "Start saving your progress"}
      </h2>
      {profile ? (
        <>
          <p>
            Your EP, discoveries, upgrades, cosmetics, and activity are saved
            automatically.
          </p>
          <div className="info-box">
            This is a local profile on this browser only—not an online account.
            There is no password, cloud backup, or cross-device login. Clearing
            site data removes the profile and its progress.
          </div>
          <button className="primary-button" onClick={onClose}>
            Continue playing <ArrowRight size={16} />
          </button>
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
        </form>
      )}
    </>
  );
}
