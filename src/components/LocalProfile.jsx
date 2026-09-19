import React, { useRef, useState } from "react";
import { UserRound, Check, ArrowRight, Trash2 } from "lucide-react";

export default function LocalProfile({ profile, onAction, onClose }) {
  const [username, setUsername] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const busy = useRef(false);
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
        {profile ? `Your profile, ${profile.username}` : "Sign up to save"}
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
            Choose a name to start a saved account. Nothing you rolled as a
            guest carries over — guest play is not saved, so your new account
            starts clean at 0 EP with an empty collection.
          </p>
          <label>
            Username
            <input
              autoComplete="nickname"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your lucky alias"
              disabled={pending}
            />
          </label>
          <p className="profile-input-hint">
            3–20 letters, numbers, underscores, or hyphens.
          </p>
          <div className="info-box">
            Local sign-up only. No email or password is needed, and nothing is
            sent to a server. Saves stay on this browser; clearing site data
            deletes them.
          </div>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Creating profile…" : "Create local profile"}{" "}
            <ArrowRight size={16} />
          </button>
        </form>
      )}
    </>
  );
}
