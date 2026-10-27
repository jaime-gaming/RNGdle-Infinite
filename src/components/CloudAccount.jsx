import React, { useRef, useState } from "react";
import {
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { validUsername } from "../progress.js";
import "../profile.css";
import "../cloud-account.css";

function GoogleMark() {
  return (
    <svg
      className="google-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.72-.06-1.41-.18-2.08H12v3.94h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.26c1.91-1.76 2.96-4.35 2.96-7.43Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.74 0 5.04-.91 6.72-2.47l-3.26-2.55c-.9.6-2.05.96-3.46.96-2.66 0-4.92-1.8-5.73-4.22H2.91v2.63A10.14 10.14 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.27 13.72a6.1 6.1 0 0 1 0-3.44V7.65H2.91a10.04 10.04 0 0 0 0 8.7l3.36-2.63Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.06c1.5 0 2.84.52 3.9 1.55l2.92-2.92C17.03 3.07 14.74 2 12 2a10.14 10.14 0 0 0-9.09 5.65l3.36 2.63C7.08 7.86 9.34 6.06 12 6.06Z"
      />
    </svg>
  );
}

const STATUS_LABELS = {
  "checking-auth": "Checking sign-in…",
  loading: "Loading cloud save…",
  saving: "Syncing progress…",
  synced: "Cloud save is up to date",
  empty: "No cloud save yet",
  error: "Cloud sync needs attention",
  "signed-out": "Not signed in",
  unconfigured: "Cloud login is not configured",
};

export default function CloudAccount({
  auth,
  cloud,
  profile,
  onAction,
  onRetryCloud,
}) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const usernameReady = validUsername(username.trim().normalize("NFKC"));
  const cloudIsLoading = cloud.status === "loading" || !cloud.ready;
  const googleLinked = auth.user?.providers?.includes("google.com") ?? false;
  const statusLabel = auth.configured
    ? (STATUS_LABELS[cloud.status] ?? "Cloud save status unknown")
    : STATUS_LABELS.unconfigured;

  async function submitAuth(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result =
        mode === "sign-up"
          ? await auth.signUp(email, password)
          : await auth.signIn(email, password);
      if (!result.ok) {
        setError(result.message);
      } else if (mode === "sign-up" && result.needsEmailConfirmation) {
        setPassword("");
        setNotice(
          "Account created. Check your email to confirm it, then return here and sign in.",
        );
      } else {
        setPassword("");
        setNotice("Signed in. Loading your cloud save…");
      }
    } catch (failure) {
      setError(failure?.message || "Sign-in failed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function signInGoogle() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await auth.signInWithGoogle();
      if (!result.ok) setError(result.message);
      else if (result.redirecting) setNotice("Redirecting to Google…");
      else setNotice("Signed in with Google. Loading your cloud save…");
    } catch (failure) {
      setError(failure?.message || "Google sign-in failed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function connectGoogle() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await auth.connectGoogle();
      if (!result.ok) setError(result.message);
      else if (result.redirecting)
        setNotice("Redirecting to Google to connect it…");
      else setNotice("Google is now connected to this game account.");
    } catch (failure) {
      setError(failure?.message || "Google could not be connected.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await auth.signOut();
      if (!result.ok) setError(result.message);
      else setNotice("Signed out. Your local browser save has been kept.");
    } catch (failure) {
      setError(failure?.message || "Sign-out failed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function createProfile(event) {
    event.preventDefault();
    if (busy.current || !usernameReady || !cloud.ready) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await onAction({
        type: "register-cloud",
        username: username.trim(),
        id: crypto.randomUUID(),
        createdAt: Math.ceil(Date.now()),
      });
      if (!result.ok) setError(result.message);
      else
        setNotice(
          "Profile created. Your progress is being saved to the cloud.",
        );
    } catch (failure) {
      setError(failure?.message || "The profile could not be created.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <section className="cloud-account" aria-labelledby="cloud-account-title">
      <div className="cloud-account-heading">
        <span className="cloud-account-icon" aria-hidden="true">
          {auth.user ? <Cloud size={18} /> : <CloudOff size={18} />}
        </span>
        <div>
          <h2 id="cloud-account-title">Online account &amp; cloud save</h2>
          <p>
            {auth.user
              ? `Signed in${auth.user.email ? ` as ${auth.user.email}` : ""}.`
              : "Sign in to keep one game save across your devices."}
          </p>
        </div>
        <span
          className="cloud-account-status"
          data-status={cloud.status}
          role="status"
          data-testid="cloud-save-status"
        >
          {cloud.status === "loading" || cloud.status === "saving" ? (
            <LoaderCircle
              size={13}
              className="is-spinning"
              aria-hidden="true"
            />
          ) : cloud.status === "synced" ? (
            <Check size={13} aria-hidden="true" />
          ) : null}
          {statusLabel}
        </span>
      </div>

      {!auth.configured ? (
        <p className="cloud-account-note">
          Cloud sign-in is not enabled in this deployment yet. Your existing
          browser save continues to work; it will not be sent anywhere.
        </p>
      ) : !auth.ready ? (
        <p className="cloud-account-note">Checking the current sign-in…</p>
      ) : auth.user ? (
        <>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="cloud-account-note" role="status">
              {notice}
            </p>
          )}
          {cloud.notice && (
            <p className="cloud-account-note" role="status">
              {cloud.notice}
            </p>
          )}
          {cloud.error && (
            <p className="profile-error" role="alert">
              {cloud.error}
            </p>
          )}
          {auth.error && (
            <p className="profile-error" role="alert">
              {auth.error}
            </p>
          )}
          {cloud.status === "error" && (
            <button
              type="button"
              className="secondary-button cloud-retry"
              onClick={onRetryCloud}
              disabled={pending}
            >
              <RefreshCw size={14} aria-hidden="true" /> Retry cloud sync
            </button>
          )}
          {!profile && cloud.ready && (
            <form className="cloud-profile-form" onSubmit={createProfile}>
              <p>
                This login has no game profile yet. Choose a display name to
                start one. Any guest progress currently on this device will be
                kept and saved with it.
              </p>
              <label htmlFor="cloud-profile-username">Display name</label>
              <div className="cloud-profile-input">
                <UserRound size={15} aria-hidden="true" />
                <input
                  id="cloud-profile-username"
                  autoComplete="nickname"
                  required
                  minLength={3}
                  maxLength={20}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="3–20 letters, numbers, _ or -"
                  disabled={pending}
                />
              </div>
              <button
                type="submit"
                className="primary-button"
                disabled={pending || !usernameReady || !cloud.ready}
              >
                {pending ? "Creating…" : "Create game profile"}
              </button>
            </form>
          )}
          <div className="cloud-account-actions">
            {profile && (
              <p>
                Your game profile is <strong>{profile.username}</strong>.
                {cloudIsLoading
                  ? " Wait for the cloud save to finish loading before playing."
                  : ""}
              </p>
            )}
            {!googleLinked && (
              <button
                type="button"
                className="secondary-button google-connect-button"
                onClick={connectGoogle}
                disabled={pending}
              >
                <GoogleMark />
                {pending ? "Connecting…" : "Connect Google"}
              </button>
            )}
            {googleLinked && (
              <p className="cloud-provider-status" role="status">
                <GoogleMark /> Google connected
              </p>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={signOut}
              disabled={pending}
            >
              <LogOut size={14} aria-hidden="true" />
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cloud-account-note">
            {profile
              ? "Local saves stay on this device. An unowned save or this account’s own save is compared with the cloud. A later reset/cycle generation wins; within one generation, local uploads only when it clearly dominates. Cloud wins ties, mixed or different-profile saves. The displaced copy is in Settings. Saves owned by another account are never imported."
              : "Your game can be played without an account. Sign in with Google or email and password to keep a cloud save across devices."}
          </p>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          {auth.error && (
            <p className="profile-error" role="alert">
              {auth.error}
            </p>
          )}
          {notice && (
            <p className="cloud-account-note" role="status">
              {notice}
            </p>
          )}
          <div className="cloud-login-providers">
            <button
              type="button"
              className="google-sign-in-button"
              data-testid="google-sign-in"
              onClick={signInGoogle}
              disabled={pending}
            >
              <GoogleMark />
              {pending ? "Please wait…" : "Continue with Google"}
            </button>
            <div className="cloud-login-divider" aria-hidden="true">
              <span>or continue with email</span>
            </div>
          </div>
          <form className="cloud-login-form" onSubmit={submitAuth}>
            <label htmlFor="cloud-email">Email</label>
            <input
              id="cloud-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
            <label htmlFor="cloud-password">Password</label>
            <input
              id="cloud-password"
              type="password"
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
            <button type="submit" className="primary-button" disabled={pending}>
              <LogIn size={15} aria-hidden="true" />
              {pending
                ? "Please wait…"
                : mode === "sign-up"
                  ? "Create online account"
                  : "Sign in"}
            </button>
          </form>
          <p className="cloud-account-switch">
            {mode === "sign-up"
              ? "Already have an account?"
              : "New to cloud saves?"}{" "}
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={() => {
                setMode(mode === "sign-up" ? "sign-in" : "sign-up");
                setError("");
                setNotice("");
              }}
            >
              {mode === "sign-up" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <p className="cloud-account-footnote">
            Google and email/password authentication are handled by Firebase.
            The game never receives your Google password. Sign into an existing
            email account and connect Google above if both methods should use
            the same cloud save.
          </p>
        </>
      )}
    </section>
  );
}
