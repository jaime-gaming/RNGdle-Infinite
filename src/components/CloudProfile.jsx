import React, { useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { getPublicProfile } from "../public-profile.js";
import SharedProfile from "./SharedProfile.jsx";
import "../profile.css";

export default function CloudProfile({ username, onContinue, onOwnProfile }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    status: "loading",
    card: null,
    error: "",
  });

  useEffect(() => {
    let active = true;
    setResult({ status: "loading", card: null, error: "" });
    getPublicProfile(username).then(
      (card) => {
        if (!active) return;
        setResult(
          card
            ? { status: "ready", card, error: "" }
            : { status: "missing", card: null, error: "" },
        );
      },
      (failure) => {
        if (!active) return;
        setResult({
          status: "error",
          card: null,
          error:
            failure?.code === "permission-denied"
              ? "The public-profile Firestore rules may not be published yet."
              : failure?.message || "The public profile could not be loaded.",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [username, attempt]);

  if (result.status === "ready")
    return (
      <SharedProfile
        card={result.card}
        live
        onContinue={onContinue}
        onOwnProfile={onOwnProfile}
      />
    );

  return (
    <section className="cloud-profile-state" aria-live="polite">
      <h2 className="profile-title">{username}</h2>
      {result.status === "loading" ? (
        <p className="cloud-profile-message" role="status">
          <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
          Loading public profile…
        </p>
      ) : result.status === "missing" ? (
        <p className="cloud-profile-message" role="status">
          No public profile was found for this name. Check the address or ask
          the player to sign in and publish their cloud profile.
        </p>
      ) : (
        <div className="cloud-profile-error" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <strong>Public profile unavailable</strong>
            <p>{result.error}</p>
          </div>
        </div>
      )}
      {result.status !== "loading" && (
        <div className="profile-actions">
          {result.status === "error" && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" /> Try again
            </button>
          )}
          <button className="primary-button" onClick={onContinue}>
            Play RNGdle <span aria-hidden="true">→</span>
          </button>
          {onOwnProfile && (
            <button
              type="button"
              className="secondary-button"
              onClick={onOwnProfile}
            >
              My profile
            </button>
          )}
        </div>
      )}
    </section>
  );
}
