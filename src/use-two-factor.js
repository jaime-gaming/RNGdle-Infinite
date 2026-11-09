import { useCallback, useEffect, useRef, useState } from "react";
import {
  deviceId,
  readAccountSecurity,
  setTwoFactorEnabled,
  trustDevice,
} from "./account-security.js";

const EMPTY = {
  loading: false,
  enabled: false,
  trusted: false,
  pending: false,
  devices: [],
  message: "",
  pendingEmail: "",
  busy: false,
  lastSentAt: 0,
};

export function useTwoFactor(auth) {
  const [state, setState] = useState(EMPTY);

  const autoSentFor = useRef("");
  const activeUserId = auth?.user?.id ?? null;
  const authEmail = auth?.user?.email ?? "";
  const emailLinkSignIn = auth?.emailLinkSignIn ?? null;
  const startEmailLinkSignIn = auth?.startEmailLinkSignIn;
  const signOutAccount = auth?.signOut;
  const resendVerificationEmail = auth?.resendVerificationEmail;
  const refreshEmailVerification = auth?.refreshEmailVerification;

  const sendLinkAndSignOut = useCallback(
    async (email, { automatic = false } = {}) => {
      if (typeof startEmailLinkSignIn !== "function")
        return {
          ok: false,
          message: "Online sign-in is unavailable right now.",
        };
      setState((current) => ({ ...current, busy: true, message: "" }));
      const sent = await startEmailLinkSignIn(email);
      if (!sent.ok) {
        setState((current) => ({
          ...current,
          busy: false,
          pending: automatic ? current.pending : true,
          message: sent.message,
        }));
        return sent;
      }

      if (typeof signOutAccount === "function") await signOutAccount();
      autoSentFor.current = `${activeUserId ?? ""}:${deviceId()}`;
      setState((current) => ({
        ...current,
        busy: false,
        pending: true,
        trusted: false,
        pendingEmail: sent.email,
        lastSentAt: Date.now(),
        message: `We emailed a sign-in link to ${sent.email}. Open it on this device to finish signing in.`,
      }));
      return sent;
    },
    [startEmailLinkSignIn, signOutAccount, activeUserId],
  );

  useEffect(() => {
    if (!activeUserId) {
      setState((current) =>
        current.loading ||
        current.enabled ||
        current.trusted ||
        (!current.pending && current.devices.length)
          ? {
              ...current,
              loading: false,
              enabled: false,
              trusted: false,
              devices: current.pending ? current.devices : [],
            }
          : current,
      );
      return undefined;
    }
    let active = true;
    setState((current) =>
      current.loading ? current : { ...current, loading: true },
    );
    readAccountSecurity(activeUserId)
      .then((security) => {
        if (!active) return;
        const id = deviceId();
        const trusted = security.trustedDevices.includes(id);
        const required = security.enabled && !trusted;
        setState((current) => ({
          ...current,
          loading: false,
          enabled: security.enabled,
          trusted,
          devices: security.trustedDevices,
          pending: required,
          message: required
            ? "This device is new for your account. Confirm the sign-in link we email you to continue."
            : current.pending
              ? current.message
              : "",
        }));
        if (
          required &&
          authEmail &&
          autoSentFor.current !== `${activeUserId}:${id}`
        )
          sendLinkAndSignOut(authEmail, { automatic: true });
      })
      .catch(() => {
        if (!active) return;

        setState((current) =>
          current.loading ? { ...current, loading: false } : current,
        );
      });
    return () => {
      active = false;
    };
  }, [activeUserId, authEmail, sendLinkAndSignOut]);

  useEffect(() => {
    if (!emailLinkSignIn?.userId) return undefined;
    let active = true;
    trustDevice(emailLinkSignIn.userId).then((result) => {
      if (!active) return;
      setState((current) => ({
        ...current,
        trusted: result.ok ? true : current.trusted,
        devices: result.ok ? result.trustedDevices : current.devices,
        pending: false,
        pendingEmail: "",
        message: result.ok
          ? "Sign-in confirmed. This device is now remembered."
          : "Sign-in confirmed, but this device could not be remembered. You may be asked again.",
      }));
    });
    return () => {
      active = false;
    };
  }, [emailLinkSignIn]);

  const requestLink = useCallback(
    () => sendLinkAndSignOut(authEmail || state.pendingEmail, {}),
    [authEmail, sendLinkAndSignOut, state.pendingEmail],
  );

  const setEnabled = useCallback(
    async (next) => {
      if (!activeUserId)
        return { ok: false, message: "Sign in to change security settings." };
      setState((current) => ({ ...current, busy: true }));

      const trustedFirst =
        next && !state.trusted
          ? await trustDevice(activeUserId)
          : { ok: true, trustedDevices: state.devices };
      const result = await setTwoFactorEnabled(activeUserId, next);
      const rememberedNow = result.ok && next && trustedFirst.ok;
      setState((current) => ({
        ...current,
        busy: false,
        enabled: result.ok ? next === true : current.enabled,
        trusted: rememberedNow ? true : current.trusted,
        devices: rememberedNow
          ? (trustedFirst.trustedDevices ?? current.devices)
          : current.devices,
        message: result.ok
          ? next
            ? "Two-factor is on. New devices will need the emailed sign-in link."
            : "Two-factor is off. New devices can sign in with the password only."
          : (result.message ?? ""),
      }));
      return result;
    },
    [activeUserId, state.trusted, state.devices],
  );

  const resendVerification = useCallback(async () => {
    if (typeof resendVerificationEmail !== "function")
      return { ok: false, message: "Online sign-in is unavailable right now." };
    setState((current) => ({ ...current, busy: true }));
    const result = await resendVerificationEmail();
    setState((current) => ({
      ...current,
      busy: false,
      message: result.ok
        ? "A new confirmation email is on its way."
        : (result.message ?? ""),
    }));
    return result;
  }, [resendVerificationEmail]);

  const recheckVerification = useCallback(async () => {
    if (typeof refreshEmailVerification !== "function")
      return { ok: false, verified: false };
    const result = await refreshEmailVerification();
    if (result.ok && result.verified)
      setState((current) => ({
        ...current,
        message: "Email address confirmed. Thanks!",
      }));
    return result;
  }, [refreshEmailVerification]);

  return {
    ...state,
    emailUnverified: Boolean(auth?.user && auth.user.emailVerified === false),
    required: Boolean(state.enabled && !state.trusted),
    requestLink,
    setEnabled,
    resendVerification,
    recheckVerification,
  };
}
