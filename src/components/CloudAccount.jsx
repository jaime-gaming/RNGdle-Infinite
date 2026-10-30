import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogIn,
  LogOut,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { isEmailPasswordOnlyUser } from "../use-firebase-auth.js";
import { firebaseAppCheckStatus } from "../firebase.js";
import { pathForPage } from "../router.js";
import { publicProfileId } from "../public-profile.js";
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
  "checking-auth": "Checking your account…",
  loading: "Loading your progress…",
  saving: "Saving progress online…",
  offline: "Offline · saved on this device",
  synced: "Progress backed up",
  "name-required": "Choose a unique Cloud profile name",
  "needs-choice": "Choose which progress to keep",
  empty: "No online backup yet",
  error: "Online backup needs attention",
  "signed-out": "Not signed in",
  unconfigured: "Online sign-in unavailable",
};

const APPCHECK_STATUS_COPY = {
  "client-ready":
    "Extra request checks are configured for this app. Their enforcement is controlled by the cloud service.",
  "initialization-failed":
    "Extra request checks could not be started for this app.",
  "site-key-required": "Extra request checks are not configured in this build.",
  "test-disabled": "Extra request checks are disabled in test mode.",
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
  localPlay = false,
  onContinueLocal,
  onAction,
  onRetryCloud,
  onResolveCloudConflict,
}) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [changeEmail, setChangeEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [passwordCurrentPassword, setPasswordCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmNextPassword, setConfirmNextPassword] = useState("");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] =
    useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const accountUserId = auth.user?.id ?? null;
  const previousAccountUserId = useRef(accountUserId);
  useEffect(() => {
    if (previousAccountUserId.current === accountUserId) return;
    previousAccountUserId.current = accountUserId;
    setPassword("");
    setConfirmPassword("");
    setChangeEmail("");
    setError("");
    setNotice("");
    setEmailCurrentPassword("");
    setPasswordCurrentPassword("");
    setNextPassword("");
    setConfirmNextPassword("");
    setDeleteAccountPassword("");
    setDeleteAccountConfirmation("");
    setDeleteAccountOpen(false);
  }, [accountUserId]);
  const usernameReady = Boolean(publicProfileId(username));
  const passwordMatches = password === confirmPassword;
  const cloudIsLoading = cloud.status === "loading" || !cloud.ready;
  const googleLinked = auth.user?.providers?.includes("google.com") ?? false;
  const passwordLinked = auth.user?.providers?.includes("password") ?? false;
  const emailPasswordOnly = isEmailPasswordOnlyUser(auth.user);
  const securityPasswordMatches = nextPassword === confirmNextPassword;
  const statusLabel = auth.user?.passwordRequired
    ? "Password required"
    : auth.configured
      ? (STATUS_LABELS[cloud.status] ?? "Progress status unavailable")
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
        setNotice("Signed in. Loading your progress…");
      }
    } catch {
      setError("Sign-in failed. Please try again.");
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
      else setNotice("Signed in with Google. Loading your progress…");
    } catch {
      setError("Google sign-in failed. Please try again.");
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
    } catch {
      setError("The password could not be added. Please try again.");
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
    } catch {
      setError("Google could not be connected. Please try again.");
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
        setNotice("Signed out. Your progress on this device has been kept.");
      }
    } catch {
      setError("Sign-out failed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function changeAccountEmail(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await auth.changeEmail(
        changeEmail,
        emailCurrentPassword,
        auth.user?.id,
      );
      if (!result.ok) setError(result.message);
      else {
        setChangeEmail("");
        setEmailCurrentPassword("");
        setPasswordCurrentPassword("");
        setNotice(
          `A verification link was sent to ${result.email}. Your sign-in email changes after you verify it.`,
        );
      }
    } catch {
      setError("The email address could not be changed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function changeAccountPassword(event) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    setNotice("");
    if (!securityPasswordMatches) {
      setError("The new passwords do not match.");
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const result = await auth.changePassword(
        passwordCurrentPassword,
        nextPassword,
        auth.user?.id,
      );
      if (!result.ok) setError(result.message);
      else {
        setEmailCurrentPassword("");
        setPasswordCurrentPassword("");
        setNextPassword("");
        setConfirmNextPassword("");
        setNotice("Your password has been changed.");
      }
    } catch {
      setError("The password could not be changed. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function deleteCloudAccount(event) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    setNotice("");
    if (deleteAccountConfirmation !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const verification = passwordLinked
        ? await auth.reauthenticateWithPassword(
            deleteAccountPassword,
            auth.user?.id,
          )
        : googleLinked
          ? await auth.reauthenticateWithGoogle(auth.user?.id)
          : {
              ok: false,
              message:
                "This account has no supported sign-in method to verify its deletion.",
            };
      if (!verification.ok) {
        setError(verification.message);
        return;
      }
      if (!onAction) {
        setError("Cloud account deletion is unavailable right now.");
        return;
      }
      const result = await onAction({
        type: "delete",
        deleteCloudAccount: true,
      });
      if (!result?.ok) {
        setError(result?.message || "The cloud account could not be deleted.");
        return;
      }
      setDeleteAccountOpen(false);
      setDeleteAccountPassword("");
      setDeleteAccountConfirmation("");
      setNotice(
        result.notice || "The cloud account and its online save were deleted.",
      );
    } catch {
      setError("The cloud account could not be deleted. Please try again.");
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
    } catch {
      setError("The save choice could not be applied. Please try again.");
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
      const normalizedUsername = username
        .trim()
        .normalize("NFKC")
        .toLowerCase();
      const result = await onAction({
        type: "register-cloud",
        username: normalizedUsername,
        id: crypto.randomUUID(),
        createdAt: Math.ceil(Date.now()),
      });
      if (!result.ok) setError(result.message);
      else
        setNotice(
          "Profile created. Your Cloud name is reserved and progress is saved online.",
        );
    } catch (failure) {
      setError(
        failure?.code === "permission-denied"
          ? "Online profiles are unavailable right now. Try again later."
          : "The profile could not be created. Please try again.",
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
          <h2 id="cloud-account-title">Cloud Account</h2>
          <p>
            {auth.user
              ? `Signed in${auth.user.email ? ` as ${auth.user.email}` : ""}.`
              : profile
                ? `Local profile: ${profile.username}.`
                : localPlay
                  ? "Choose an alias to save progress on this device."
                  : "Choose how to play."}
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

      <section
        className="cloud-security-overview"
        aria-labelledby="cloud-security-overview-title"
        data-testid="cloud-security-overview"
      >
        <span className="cloud-security-overview-icon" aria-hidden="true">
          <ShieldCheck size={19} />
        </span>
        <div className="cloud-security-overview-copy">
          <div className="cloud-security-overview-heading">
            <h3 id="cloud-security-overview-title">
              Your account and progress
            </h3>
            <span>
              <LockKeyhole size={11} aria-hidden="true" />
              {auth.user
                ? cloud.status === "synced"
                  ? "Online backup is current"
                  : "Cloud Account connected"
                : profile
                  ? "Saved on this device"
                  : "Cloud is optional"}
            </span>
          </div>
          <ul>
            <li>
              When you use a Cloud Account, your online save belongs to your
              signed-in account and stays separate from other players’ saves.
            </li>
            <li>
              Public sharing is your choice. A profile logo appears only on a
              public profile.
            </li>
          </ul>
          <p className="cloud-app-check-note">
            <strong>App Check:</strong>{" "}
            {APPCHECK_STATUS_COPY[firebaseAppCheckStatus] ??
              APPCHECK_STATUS_COPY["site-key-required"]}
          </p>
          <p className="cloud-security-availability">
            Online features depend on your connection and service availability;
            they may occasionally be unavailable.
          </p>
        </div>
      </section>

      {profile && !auth.user && (
        <p className="cloud-migration-note" data-testid="cloud-migration-note">
          {auth.configured
            ? "Your profile is saved on this device. Link a Cloud Account to back it up. If it already has different progress, you’ll choose which copy to keep."
            : "Your profile is saved on this device."}
        </p>
      )}

      {!auth.configured ? (
        <>
          <p className="cloud-account-note">
            Online sign-in isn’t available here. You can still play locally.
          </p>
          {!localPlay && (
            <button
              type="button"
              className="secondary-button"
              data-testid="continue-locally"
              onClick={onContinueLocal}
            >
              Continue locally
            </button>
          )}
        </>
      ) : !auth.ready ? (
        <>
          <p className="cloud-account-note">Checking your sign-in…</p>
          {!localPlay && (
            <button
              type="button"
              className="secondary-button"
              data-testid="continue-locally"
              onClick={onContinueLocal}
            >
              Continue locally
            </button>
          )}
        </>
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
                password too. Your game and online progress stay paused until
                you finish.
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
                Your Google password is never shared with the game.
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
                    <h3>Choose which progress to keep</h3>
                    <p>{cloud.conflict.message}</p>
                  </div>
                  <div className="cloud-save-options">
                    <SaveSummary
                      title="This device"
                      summary={cloud.conflict.local}
                    />
                    <SaveSummary
                      title="Online account"
                      summary={cloud.conflict.cloud}
                    />
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
                      {cloud.resolving
                        ? "Applying…"
                        : "Keep the online progress"}
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
                        <RefreshCw size={14} aria-hidden="true" /> Check again
                      </button>
                    )}
                  <p className="cloud-account-note">
                    The copy you don’t choose stays on this device. Find it
                    later in Settings → Restore save.
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
                  <RefreshCw size={14} aria-hidden="true" /> Try again
                </button>
              )}
              {!profile && cloud.ready && (
                <form className="cloud-profile-form" onSubmit={createProfile}>
                  <p>
                    This account has no game profile yet. Choose a display name
                    to start one. Any guest progress on this device will be kept
                    with it.
                  </p>
                  <p className="cloud-account-note">
                    Cloud names are unique across public and private accounts,
                    case-insensitive, and stored in lowercase. A private name
                    reservation is not searchable.
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
                      aria-invalid={Boolean(username.trim()) && !usernameReady}
                      aria-describedby="cloud-profile-username-hint"
                    />
                  </div>
                  <p
                    id="cloud-profile-username-hint"
                    className="cloud-account-note"
                  >
                    Use 3–20 letters, numbers, underscores, or hyphens. Spaces
                    are not allowed; the reserved name is stored in lowercase.
                  </p>
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
                        ? " Wait until your progress is ready before playing."
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
              {emailPasswordOnly && (
                <section
                  className="cloud-account-security"
                  aria-labelledby="cloud-account-security-title"
                  data-testid="cloud-account-security"
                >
                  <h3 id="cloud-account-security-title">Account security</h3>
                  <p>
                    Change the email or password for this email-only account.
                    Enter your current password to verify each change.
                  </p>
                  <form
                    className="cloud-account-security-form"
                    onSubmit={changeAccountEmail}
                    data-testid="change-account-email"
                  >
                    <label htmlFor="cloud-security-email-password">
                      Current password
                    </label>
                    <input
                      id="cloud-security-email-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={emailCurrentPassword}
                      onChange={(event) =>
                        setEmailCurrentPassword(event.target.value)
                      }
                      disabled={pending}
                    />
                    <label htmlFor="cloud-security-new-email">New email</label>
                    <input
                      id="cloud-security-new-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={changeEmail}
                      onChange={(event) => setChangeEmail(event.target.value)}
                      disabled={pending}
                    />
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={
                        pending || !emailCurrentPassword || !changeEmail.trim()
                      }
                    >
                      {pending ? "Sending…" : "Send email verification"}
                    </button>
                  </form>
                  <form
                    className="cloud-account-security-form"
                    onSubmit={changeAccountPassword}
                    data-testid="change-account-password"
                  >
                    <label htmlFor="cloud-security-password-current">
                      Current password
                    </label>
                    <input
                      id="cloud-security-password-current"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={passwordCurrentPassword}
                      onChange={(event) =>
                        setPasswordCurrentPassword(event.target.value)
                      }
                      disabled={pending}
                    />
                    <label htmlFor="cloud-security-password-new">
                      New password
                    </label>
                    <input
                      id="cloud-security-password-new"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      value={nextPassword}
                      onChange={(event) => setNextPassword(event.target.value)}
                      disabled={pending}
                    />
                    <label htmlFor="cloud-security-password-confirm">
                      Confirm new password
                    </label>
                    <input
                      id="cloud-security-password-confirm"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      value={confirmNextPassword}
                      onChange={(event) =>
                        setConfirmNextPassword(event.target.value)
                      }
                      disabled={pending}
                    />
                    {confirmNextPassword && !securityPasswordMatches && (
                      <p className="cloud-password-hint" role="status">
                        The new passwords do not match yet.
                      </p>
                    )}
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={
                        pending ||
                        !passwordCurrentPassword ||
                        nextPassword.length < 6 ||
                        !securityPasswordMatches
                      }
                    >
                      {pending ? "Changing…" : "Change password"}
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
          <section
            className="cloud-account-danger"
            aria-labelledby="cloud-account-delete-title"
            data-testid="cloud-account-delete"
          >
            <h3 id="cloud-account-delete-title">Delete cloud account</h3>
            {!deleteAccountOpen ? (
              <button
                type="button"
                className="danger-button cloud-account-danger-toggle"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setDeleteAccountOpen(true);
                }}
                disabled={pending}
              >
                Delete cloud account and progress
              </button>
            ) : (
              <form
                className="cloud-account-delete-form"
                onSubmit={deleteCloudAccount}
                data-testid="delete-cloud-account-form"
              >
                <p>
                  This permanently deletes this Firebase account, its online
                  game save, and its public profile. A local save owned by a
                  different account, or not linked to a cloud account, is kept.
                  This cannot be undone.
                </p>
                {passwordLinked ? (
                  <>
                    <label htmlFor="delete-cloud-current-password">
                      Current password
                    </label>
                    <input
                      id="delete-cloud-current-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={deleteAccountPassword}
                      onChange={(event) =>
                        setDeleteAccountPassword(event.target.value)
                      }
                      disabled={pending}
                    />
                    {googleLinked && (
                      <p className="cloud-account-footnote">
                        Verify with this account’s password before deletion.
                      </p>
                    )}
                  </>
                ) : googleLinked ? (
                  <p className="cloud-account-footnote">
                    You will verify this account with Google before deletion.
                  </p>
                ) : (
                  <p className="cloud-account-footnote">
                    Sign in again with this account to verify deletion.
                  </p>
                )}
                <label htmlFor="delete-cloud-confirmation">
                  Type DELETE to confirm
                </label>
                <input
                  id="delete-cloud-confirmation"
                  type="text"
                  autoComplete="off"
                  required
                  value={deleteAccountConfirmation}
                  onChange={(event) =>
                    setDeleteAccountConfirmation(event.target.value)
                  }
                  disabled={pending}
                />
                <div className="cloud-account-delete-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => {
                      setDeleteAccountOpen(false);
                      setDeleteAccountPassword("");
                      setDeleteAccountConfirmation("");
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="danger-button"
                    disabled={
                      pending ||
                      deleteAccountConfirmation !== "DELETE" ||
                      (!googleLinked && !passwordLinked) ||
                      (passwordLinked && !deleteAccountPassword)
                    }
                  >
                    {pending ? "Deleting…" : "Permanently delete cloud account"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      ) : (
        <>
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
              : "Need an online account?"}{" "}
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
          <div className="cloud-local-option">
            {localPlay ? (
              <p role="status">
                {profile
                  ? "Playing locally."
                  : "Your local session is ready. Choose a profile name to continue with a saved local profile."}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  data-testid="continue-locally"
                  onClick={onContinueLocal}
                  disabled={pending}
                >
                  Continue locally
                </button>
                <p>
                  Choose a profile name before playing. Your existing local
                  progress is kept, and you can link a Cloud Account later.
                </p>
              </>
            )}
          </div>
          <p className="cloud-account-footnote">
            Google accounts need a password before play. You can then use Google
            or email and password to sign in.
          </p>
        </>
      )}
      <p className="cloud-legal-links">
        <a href={pathForPage("privacy")}>Privacy &amp; Rights</a>
        <span aria-hidden="true"> · </span>
        <a href={pathForPage("tos")}>Terms of Service</a>
      </p>
    </section>
  );
}
