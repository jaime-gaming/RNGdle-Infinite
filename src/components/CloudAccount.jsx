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
import { publicProfileNameAvailable } from "../public-profile.js";
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
  "needs-choice": "Choose a save",
  empty: "No cloud save yet",
  error: "Cloud sync needs attention",
  "signed-out": "Not signed in",
  unconfigured: "Cloud login is not configured",
};

function SaveSummary({ title, summary }) {
  const number = (value) => Number(value ?? 0).toLocaleString("en-US");
  const stats = [
    ["Rebirths", summary?.rebirths],
    ["Prestige", summary?.prestiges],
    ["Rollbacks", summary?.rollbacks],
    ["Fresh starts", summary?.freshStarts],
    ["EP earned", summary?.totalEarned],
    ["Cycle EP", summary?.cycleEarnedEP],
    ["Wallet", summary?.balance],
    ["Surplus", summary?.surplusBanked, "percent"],
    ["Rolls", summary?.rolls],
    ["Best roll EP", summary?.bestRollEP],
    ["Badges", summary?.badges],
    ["Upgrades", summary?.upgrades],
    ["Skills", summary?.skills],
    ["Companions", summary?.companions],
    ["Roll in progress", summary?.pendingRoll, "boolean"],
  ];
  return (
    <section className="cloud-save-option">
      <h4>{title}</h4>
      <p className="cloud-save-option-name">{summary?.username ?? "Player"}</p>
      <dl className="cloud-save-summary">
        {stats.map(([label, value, format]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {format === "boolean"
                ? value
                  ? "Yes"
                  : "No"
                : format === "percent"
                  ? `+${number(value)}%`
                  : number(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function CloudAccount({
  auth,
  cloud,
  profile,
  onAction,
  onRetryCloud,
  onResolveCloudConflict,
}) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const usernameReady = validUsername(username.trim().normalize("NFKC"));
  const passwordMatches = password === confirmPassword;
  const cloudIsLoading = cloud.status === "loading" || !cloud.ready;
  const googleLinked = auth.user?.providers?.includes("google.com") ?? false;
  const passwordLinked = auth.user?.providers?.includes("password") ?? false;
  const statusLabel = auth.user?.passwordRequired
    ? "Password required"
    : auth.configured
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
    setPassword("");
    setConfirmPassword("");
    try {
      const result = await auth.signInWithGoogle();
      if (!result.ok) setError(result.message);
      else if (result.redirecting) setNotice("Redirecting to Google…");
      else if (result.user?.passwordRequired)
        setNotice("Google sign-in complete. Add a password to finish setup.");
      else setNotice("Signed in with Google. Loading your cloud save…");
    } catch (failure) {
      setError(failure?.message || "Google sign-in failed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    setNotice("");
    if (!passwordMatches) {
      setError("The passwords do not match.");
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const result = await auth.setPassword(password, auth.user?.id);
      if (!result.ok) setError(result.message);
      else {
        setPassword("");
        setConfirmPassword("");
        setNotice(
          "Password added. You can now use Google or email and password to sign in.",
        );
      }
    } catch (failure) {
      setError(failure?.message || "The password could not be added.");
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
      const result = await auth.connectGoogle(auth.user?.id);
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
      else {
        setPassword("");
        setConfirmPassword("");
        setNotice("Signed out. Your local browser save has been kept.");
      }
    } catch (failure) {
      setError(failure?.message || "Sign-out failed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function chooseConflictSave(decision) {
    if (busy.current || !onResolveCloudConflict) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await onResolveCloudConflict(decision);
      if (result?.needsChoice)
        setNotice(
          result.message || "Review the updated saves and choose again.",
        );
      else if (!result?.ok)
        setError(result?.message || "The save choice could not be applied.");
      else
        setNotice(
          result.notice ||
            "Your save choice was applied and the other copy was preserved.",
        );
    } catch (failure) {
      setError(failure?.message || "The save choice could not be applied.");
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
      const normalizedUsername = username.trim().normalize("NFKC");
      const available = await publicProfileNameAvailable(
        normalizedUsername,
        auth.user?.id,
      );
      if (!available) {
        setError(
          "That profile name is already in use. Choose another name for your public profile.",
        );
        return;
      }
      const result = await onAction({
        type: "register-cloud",
        username: normalizedUsername,
        id: crypto.randomUUID(),
        createdAt: Math.ceil(Date.now()),
      });
      if (!result.ok) setError(result.message);
      else
        setNotice(
          "Profile created. Your progress is being saved to the cloud.",
        );
    } catch (failure) {
      setError(
        failure?.code === "permission-denied"
          ? "The public-profile Firestore rules may not be published yet. Publish firestore.rules and try again."
          : failure?.message || "The profile could not be created.",
      );
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

      <div className="cloud-migration-note" data-testid="cloud-migration-note">
        <strong>Migration to Cloud</strong>
        <p>
          {auth.user
            ? profile
              ? "Your profile is being matched with this Firebase account. If it has no cloud save, the unowned browser save can be imported; when both saves exist, conflicts are resolved by your choice and the displaced copy is kept in recovery."
              : "Create your game profile here to start a Firebase cloud save."
            : profile
              ? "Sign in to migrate this browser profile to Firebase. An empty cloud account can import it; if both saves exist, progress is compared and any ambiguous conflict requires your choice."
              : "Create or sign in to a Cloud Account before playing. Your game progress will be saved to Firebase."}{" "}
          This migrates only this browser save to Firebase; Supabase accounts
          and saves are not imported. Your public profile shows a summary, not
          your private save or login details.
        </p>
      </div>

      {!auth.configured ? (
        <p className="cloud-account-note">
          Cloud sign-in is not configured in this build, so play is paused. Your
          existing browser save is preserved and will not be sent anywhere.
        </p>
      ) : !auth.ready ? (
        <p className="cloud-account-note">Checking the current sign-in…</p>
      ) : auth.user ? (
        <>
          {auth.user.passwordRequired ? (
            <div
              className="cloud-password-setup"
              data-testid="google-password-setup"
            >
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
              <h3>Finish setting up your account</h3>
              <p>
                Google signed you in
                {auth.user.email ? ` as ${auth.user.email}` : ""}. Add a
                password to keep this same account accessible with email and
                password too. Your game and cloud save stay paused until you
                finish.
              </p>
              <form className="cloud-password-form" onSubmit={submitPassword}>
                <label htmlFor="cloud-new-password">Create a password</label>
                <input
                  id="cloud-new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={pending}
                />
                <label htmlFor="cloud-confirm-password">Confirm password</label>
                <input
                  id="cloud-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={pending}
                />
                {confirmPassword && !passwordMatches && (
                  <p className="cloud-password-hint" role="status">
                    The passwords do not match yet.
                  </p>
                )}
                <button
                  type="submit"
                  className="primary-button"
                  disabled={pending || password.length < 6 || !passwordMatches}
                >
                  {pending ? "Setting password…" : "Set password & continue"}
                </button>
              </form>
              <p className="cloud-account-footnote">
                Firebase stores the password securely. The game never sees your
                Google password.
              </p>
              <button
                type="button"
                className="secondary-button cloud-password-signout"
                onClick={signOut}
                disabled={pending}
              >
                <LogOut size={14} aria-hidden="true" />
                {pending ? "Please wait…" : "Sign out instead"}
              </button>
            </div>
          ) : (
            <>
              {error && (
                <p className="profile-error" role="alert">
                  {error}
                </p>
              )}
              {notice && !cloud.conflict && (
                <p className="cloud-account-note" role="status">
                  {notice}
                </p>
              )}
              {cloud.notice && !cloud.conflict && cloud.notice !== notice && (
                <p className="cloud-account-note" role="status">
                  {cloud.notice}
                </p>
              )}
              {cloud.error && cloud.error !== error && (
                <p className="profile-error" role="alert">
                  {cloud.error}
                </p>
              )}
              {auth.error && (
                <p className="profile-error" role="alert">
                  {auth.error}
                </p>
              )}
              {cloud.conflict && (
                <div
                  className="cloud-save-conflict"
                  role="alert"
                  data-testid="cloud-save-conflict"
                >
                  <div className="cloud-save-conflict-copy">
                    <h3>Choose which save to keep</h3>
                    <p>{cloud.conflict.message}</p>
                  </div>
                  <div className="cloud-save-options">
                    <SaveSummary
                      title="This device"
                      summary={cloud.conflict.local}
                    />
                    <SaveSummary title="Cloud" summary={cloud.conflict.cloud} />
                  </div>
                  <div className="cloud-save-choice-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid="keep-device-save"
                      onClick={() => chooseConflictSave("local")}
                      disabled={
                        pending ||
                        cloud.resolving ||
                        !onResolveCloudConflict ||
                        cloud.conflict.canChooseLocal === false
                      }
                    >
                      {cloud.resolving
                        ? "Applying…"
                        : "Keep this device's save"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid="keep-cloud-save"
                      onClick={() => chooseConflictSave("cloud")}
                      disabled={
                        pending ||
                        cloud.resolving ||
                        !onResolveCloudConflict ||
                        cloud.conflict.canChooseCloud === false
                      }
                    >
                      {cloud.resolving ? "Applying…" : "Use the cloud save"}
                    </button>
                  </div>
                  {!cloud.conflict.canChooseLocal &&
                    !cloud.conflict.canChooseCloud && (
                      <button
                        type="button"
                        className="secondary-button cloud-retry"
                        onClick={onRetryCloud}
                        disabled={pending}
                      >
                        <RefreshCw size={14} aria-hidden="true" /> Refresh
                        comparison
                      </button>
                    )}
                  <p className="cloud-account-note">
                    The save you do not choose is copied to Cloud conflict
                    recovery in Settings before the selected save replaces it.
                    You can sign out to continue with the browser save without
                    syncing.
                  </p>
                </div>
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
                    start one. Any guest progress currently on this device will
                    be kept and saved with it.
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
                    {cloud.conflict
                      ? " Resolve the save choice above before playing."
                      : cloudIsLoading
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
                {passwordLinked && (
                  <p className="cloud-provider-status" role="status">
                    <Check size={14} aria-hidden="true" /> Email + password
                    ready
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
          )}
        </>
      ) : (
        <>
          <p className="cloud-account-note">
            {profile
              ? "Local saves stay on this device. An unowned save or this account’s own save is compared with the cloud. Different reset generations always need your choice. Within one generation, only clear dominance in measured game progress is automatic; ties and mixed progress also need your choice. Different game profiles are never merged; when both copies are eligible, choose one complete save. Saves owned by another Firebase account are never imported. Any displaced save is kept in Settings → Cloud conflict recovery."
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
                setPassword("");
                setConfirmPassword("");
                setError("");
                setNotice("");
              }}
            >
              {mode === "sign-up" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <p className="cloud-account-footnote">
            Google sign-in requires you to add a password before playing online;
            then both methods open the same Firebase account and cloud save.
            Email-and-password accounts can sign in directly. If this email
            already has a password account, sign in with it first and connect
            Google from that profile. The game never receives your Google
            password.
          </p>
        </>
      )}
    </section>
  );
}
