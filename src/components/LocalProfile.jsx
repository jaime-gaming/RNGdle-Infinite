import React, { useRef, useState } from "react";
import { UserRound, Check, ArrowRight } from "lucide-react";

export default function LocalProfile({ profile, onAction, onClose }) {
  const [username, setUsername] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
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
            Your EP, discoveries, upgrades, and cosmetics are saved
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
        </>
      ) : (
        <form onSubmit={register}>
          <p>
            Choose a name to keep your current guest progress and save future
            progress.
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
