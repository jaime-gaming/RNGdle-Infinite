import { useCallback, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "./firebase.js";

export function authMessage(error, fallback) {
  const messages = {
    "auth/account-exists-with-different-credential":
      "That email already has a different sign-in method. Sign in with it first, then connect Google from this profile to keep one save.",
    "auth/cancelled-popup-request":
      "Another sign-in window is already open. Finish it or try again.",
    "auth/credential-already-in-use":
      "That Google account is already connected to a different game account.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-credential":
      "The email/password or sign-in credential is incorrect or expired. Try again.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/network-request-failed":
      "Firebase could not be reached. Check your connection and try again.",
    "auth/operation-not-allowed":
      "This sign-in provider is not enabled in Firebase Authentication.",
    "auth/operation-not-supported-in-this-environment":
      "This browser cannot open a Google sign-in window. Allow redirects or try another browser.",
    "auth/popup-blocked":
      "The browser blocked the Google sign-in window. Allow pop-ups and try again.",
    "auth/popup-closed-by-user":
      "The Google sign-in window was closed before it finished.",
    "auth/provider-already-linked":
      "Google is already connected to this game account.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/unauthorized-domain":
      "This site is not authorized in Firebase Authentication. Add its domain in Firebase Console.",
    "auth/user-disabled":
      "This Firebase account is disabled. Contact the game administrator.",
    "auth/weak-password":
      "Choose a stronger password with at least 6 characters.",
  };
  return (
    messages[error?.code] ??
    (typeof error?.message === "string" && error.message.trim()
      ? error.message
      : fallback)
  );
}

function publicUser(user) {
  return user
    ? {
        id: user.uid,
        email: user.email ?? "",
        providers: (user.providerData ?? []).map(
          (provider) => provider.providerId,
        ),
      }
    : null;
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function shouldUseRedirect(error) {
  return [
    "auth/popup-blocked",
    "auth/operation-not-supported-in-this-environment",
  ].includes(error?.code);
}

export function useFirebaseAuth() {
  const [state, setState] = useState({
    ready: !firebaseConfigured,
    user: null,
    error: "",
  });

  useEffect(() => {
    if (!firebaseAuth) {
      setState({ ready: true, user: null, error: "" });
      return undefined;
    }

    let active = true;
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          ready: true,
          user: publicUser(user),
          error: "",
        }));
      },
      (error) => {
        if (!active) return;
        setState({
          ready: true,
          user: null,
          error: authMessage(error, "Your sign-in could not be checked."),
        });
      },
    );
    getRedirectResult(firebaseAuth).then(
      (credential) => {
        if (!active || !credential?.user) return;
        setState({ ready: true, user: publicUser(credential.user), error: "" });
      },
      (error) => {
        if (!active || error?.code === "auth/no-auth-event") return;
        setState((current) => ({
          ...current,
          ready: true,
          error: authMessage(error, "Google sign-in could not be completed."),
        }));
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!firebaseAuth)
      return {
        ok: false,
        message: "Cloud sign-in is not configured in this build.",
      };
    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password,
      );
      const user = publicUser(credential.user);
      setState({ ready: true, user, error: "" });
      return { ok: true, user };
    } catch (error) {
      return {
        ok: false,
        message: authMessage(error, "Sign-in failed. Please try again."),
      };
    }
  }, []);

  const signUp = useCallback(async (email, password) => {
    if (!firebaseAuth)
      return {
        ok: false,
        message: "Cloud sign-up is not configured in this build.",
      };
    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password,
      );
      const user = publicUser(credential.user);
      setState({ ready: true, user, error: "" });
      return { ok: true, user, needsEmailConfirmation: false };
    } catch (error) {
      return {
        ok: false,
        message: authMessage(
          error,
          "Account creation failed. Please try again.",
        ),
      };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseAuth)
      return {
        ok: false,
        message: "Cloud sign-in is not configured in this build.",
      };
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider());
      const user = publicUser(credential.user);
      setState({ ready: true, user, error: "" });
      return { ok: true, user };
    } catch (error) {
      if (shouldUseRedirect(error)) {
        try {
          await signInWithRedirect(firebaseAuth, googleProvider());
          return { ok: true, redirecting: true };
        } catch (redirectError) {
          return {
            ok: false,
            message: authMessage(
              redirectError,
              "Google sign-in could not be started. Please try again.",
            ),
          };
        }
      }
      return {
        ok: false,
        message: authMessage(error, "Google sign-in failed. Please try again."),
      };
    }
  }, []);

  const connectGoogle = useCallback(async () => {
    const user = firebaseAuth?.currentUser;
    if (!user)
      return {
        ok: false,
        message: "Sign in to this game account before connecting Google.",
      };
    try {
      const credential = await linkWithPopup(user, googleProvider());
      const linkedUser = publicUser(credential.user);
      setState({ ready: true, user: linkedUser, error: "" });
      return { ok: true, user: linkedUser };
    } catch (error) {
      if (shouldUseRedirect(error)) {
        try {
          await linkWithRedirect(user, googleProvider());
          return { ok: true, redirecting: true };
        } catch (redirectError) {
          return {
            ok: false,
            message: authMessage(
              redirectError,
              "Google could not be connected. Please try again.",
            ),
          };
        }
      }
      return {
        ok: false,
        message: authMessage(
          error,
          "Google could not be connected. Please try again.",
        ),
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!firebaseAuth) return { ok: true };
    try {
      await firebaseSignOut(firebaseAuth);
      setState({ ready: true, user: null, error: "" });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: authMessage(error, "Sign-out failed. Please try again."),
      };
    }
  }, []);

  return {
    configured: firebaseConfigured,
    ready: state.ready,
    user: state.user,
    error: state.error,
    signIn,
    signUp,
    signInWithGoogle,
    connectGoogle,
    signOut,
  };
}
