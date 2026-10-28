import { useCallback, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { firebaseAuth, firebaseConfigured } from "./firebase.js";

export function authMessage(error, fallback) {
  const messages = {
    "auth/account-exists-with-different-credential":
      "That email already has a different sign-in method. Sign in with it first, then connect Google from this profile to keep one save.",
    "auth/cancelled-popup-request":
      "Another sign-in window is already open. Finish it or try again.",
    "auth/credential-already-in-use":
      "That sign-in method belongs to a different game account. Sign in there instead; saves are never merged.",
    "auth/email-already-in-use":
      "An account with this email already exists. Sign in with that method first, then connect Google from the same profile.",
    "auth/invalid-login-credentials":
      "That email/password is incorrect. Check it and try again.",
    "auth/user-not-found":
      "No account was found for this email. Check the address or create an account.",
    "auth/wrong-password":
      "That email/password is incorrect. Check it and try again.",
    "auth/missing-email":
      "Google sign-in did not provide an email address. Try another sign-in option.",
    "auth/missing-password": "Enter your password to continue.",
    "auth/invalid-credential":
      "The email or password is incorrect or expired. Check it and try again.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/user-mismatch":
      "That credential does not match the signed-in account. Check it and try again.",
    "auth/user-token-expired":
      "Your sign-in expired. Sign in again and retry this change.",
    "auth/requires-recent-login":
      "For security, verify your sign-in again and retry this change.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed":
      "Could not connect. Check your internet connection and try again.",
    "auth/operation-not-allowed":
      "This sign-in option isn’t available right now. Try another option or continue locally.",
    "auth/operation-not-supported-in-this-environment":
      "Google sign-in could not open. Allow pop-ups or try another browser.",
    "auth/popup-blocked":
      "Your device blocked Google sign-in. Allow pop-ups and try again.",
    "auth/popup-closed-by-user":
      "The Google sign-in window was closed before it finished.",
    "auth/provider-already-linked":
      "That sign-in method is already connected to this game account.",
    "auth/unauthorized-domain":
      "Online sign-in isn’t available on this site yet. Try again later or continue locally.",
    "auth/user-disabled":
      "This account cannot sign in right now. Contact support for help.",
    "auth/weak-password":
      "Choose a stronger password with at least 6 characters.",
  };
  return (
    messages[error?.code] ??
    fallback ??
    "Something went wrong. Please try again."
  );
}

function providerIds(user) {
  const ids = Array.isArray(user?.providers)
    ? user.providers
    : (user?.providerData ?? []).map((provider) => provider.providerId);
  return new Set(ids.filter((provider) => typeof provider === "string"));
}

export function requiresPasswordSetup(user) {
  const providers = providerIds(user);
  return providers.has("google.com") && !providers.has("password");
}

export function isEmailPasswordOnlyUser(user) {
  const providers = providerIds(user);
  return providers.has("password") && !providers.has("google.com");
}

export function isAuthReadyForCloud(auth) {
  return Boolean(auth?.ready && !auth.user?.passwordRequired);
}

function publicUser(user) {
  if (!user) return null;
  const providers = (user.providerData ?? []).map(
    (provider) => provider.providerId,
  );
  return {
    id: user.uid,
    email: user.email ?? "",
    providers,
    passwordRequired: requiresPasswordSetup(user),
  };
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
        message:
          "Online sign-in is unavailable right now. You can continue locally.",
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
        message:
          "Online sign-up is unavailable right now. You can continue locally.",
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
        message:
          "Online sign-in is unavailable right now. You can continue locally.",
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

  const setPassword = useCallback(async (password, expectedUid) => {
    const user = firebaseAuth?.currentUser;
    if (!user || (expectedUid && user.uid !== expectedUid))
      return {
        ok: false,
        message:
          "The signed-in account changed. Sign in with Google again before adding a password.",
      };
    if (!user.email)
      return {
        ok: false,
        message: authMessage(
          { code: "auth/missing-email" },
          "A verified email is required to add a password.",
        ),
      };
    if (typeof password !== "string" || password.length < 6)
      return {
        ok: false,
        message: authMessage(
          { code: "auth/weak-password" },
          "Choose a stronger password with at least 6 characters.",
        ),
      };

    if (!requiresPasswordSetup(user)) {
      const currentUser = publicUser(user);
      setState({ ready: true, user: currentUser, error: "" });
      return { ok: true, user: currentUser };
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      const result = await linkWithCredential(user, credential);
      const linkedUser = publicUser(result.user);
      const passwordUser = {
        ...linkedUser,
        providers: linkedUser.providers.includes("password")
          ? linkedUser.providers
          : [...linkedUser.providers, "password"],
        passwordRequired: false,
      };
      setState({ ready: true, user: passwordUser, error: "" });
      return { ok: true, user: passwordUser };
    } catch (error) {
      if (error?.code === "auth/provider-already-linked") {
        try {
          await user.reload();
          const refreshedUser = publicUser(user);
          if (!refreshedUser.passwordRequired) {
            setState({ ready: true, user: refreshedUser, error: "" });
            return { ok: true, user: refreshedUser };
          }
        } catch {}
      }
      return {
        ok: false,
        message: authMessage(error, "The password could not be added."),
      };
    }
  }, []);

  const connectGoogle = useCallback(async (expectedUid) => {
    const user = firebaseAuth?.currentUser;
    if (!user || (expectedUid && user.uid !== expectedUid))
      return {
        ok: false,
        message:
          "The signed-in account changed. Sign in to this game account before connecting Google.",
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

  const reauthenticateWithPassword = useCallback(
    async (password, expectedUid) => {
      const user = firebaseAuth?.currentUser;
      if (!user || (expectedUid && user.uid !== expectedUid))
        return {
          ok: false,
          message:
            "The signed-in account changed. Sign in again before continuing.",
        };
      if (!providerIds(user).has("password") || !user.email)
        return {
          ok: false,
          message: "This account does not have an email-and-password sign-in.",
        };
      if (typeof password !== "string" || !password)
        return {
          ok: false,
          message: "Enter your current password to continue.",
        };

      try {
        const credential = EmailAuthProvider.credential(user.email, password);
        const result = await reauthenticateWithCredential(user, credential);
        const refreshedUser = publicUser(result.user);
        setState({ ready: true, user: refreshedUser, error: "" });
        return { ok: true, user: refreshedUser };
      } catch (error) {
        return {
          ok: false,
          message: authMessage(error, "Your password could not be verified."),
        };
      }
    },
    [],
  );

  const reauthenticateWithGoogle = useCallback(async (expectedUid) => {
    const user = firebaseAuth?.currentUser;
    if (!user || (expectedUid && user.uid !== expectedUid))
      return {
        ok: false,
        message:
          "The signed-in account changed. Sign in again before continuing.",
      };
    if (!providerIds(user).has("google.com"))
      return {
        ok: false,
        message: "Google is not connected to this account.",
      };

    try {
      const credential = await reauthenticateWithPopup(user, googleProvider());
      const refreshedUser = publicUser(credential.user);
      setState({ ready: true, user: refreshedUser, error: "" });
      return { ok: true, user: refreshedUser };
    } catch (error) {
      return {
        ok: false,
        message: authMessage(
          error,
          "Google could not verify this account. Sign out and sign in again, then retry.",
        ),
      };
    }
  }, []);

  const changeEmail = useCallback(
    async (email, currentPassword, expectedUid) => {
      const user = firebaseAuth?.currentUser;
      if (
        !user ||
        (expectedUid && user.uid !== expectedUid) ||
        !isEmailPasswordOnlyUser(user)
      )
        return {
          ok: false,
          message:
            "Email changes are available only for email-and-password accounts that are not connected to Google.",
        };
      const nextEmail = typeof email === "string" ? email.trim() : "";
      if (!nextEmail)
        return { ok: false, message: "Enter the new email address." };
      if (nextEmail.toLowerCase() === user.email?.toLowerCase())
        return {
          ok: false,
          message: "Enter a different email address from the one you use now.",
        };
      if (typeof currentPassword !== "string" || !currentPassword)
        return {
          ok: false,
          message: "Enter your current password to continue.",
        };

      try {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword,
        );
        await reauthenticateWithCredential(user, credential);
        await verifyBeforeUpdateEmail(user, nextEmail);
        return { ok: true, email: nextEmail, needsVerification: true };
      } catch (error) {
        return {
          ok: false,
          message: authMessage(
            error,
            "The email address could not be changed.",
          ),
        };
      }
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword, nextPassword, expectedUid) => {
      const user = firebaseAuth?.currentUser;
      if (
        !user ||
        (expectedUid && user.uid !== expectedUid) ||
        !isEmailPasswordOnlyUser(user)
      )
        return {
          ok: false,
          message:
            "Password changes are available only for email-and-password accounts that are not connected to Google.",
        };
      if (typeof currentPassword !== "string" || !currentPassword)
        return {
          ok: false,
          message: "Enter your current password to continue.",
        };
      if (typeof nextPassword !== "string" || nextPassword.length < 6)
        return {
          ok: false,
          message: authMessage(
            { code: "auth/weak-password" },
            "Choose a stronger password with at least 6 characters.",
          ),
        };
      if (nextPassword === currentPassword)
        return {
          ok: false,
          message: "Choose a different password from your current one.",
        };

      try {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword,
        );
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, nextPassword);
        const refreshedUser = publicUser(user);
        setState({ ready: true, user: refreshedUser, error: "" });
        return { ok: true, user: refreshedUser };
      } catch (error) {
        return {
          ok: false,
          message: authMessage(error, "The password could not be changed."),
        };
      }
    },
    [],
  );

  const deleteAccount = useCallback(async (expectedUid) => {
    const user = firebaseAuth?.currentUser;
    if (!user || (expectedUid && user.uid !== expectedUid))
      return {
        ok: false,
        message:
          "The signed-in account changed. Sign in again before deleting it.",
      };
    try {
      await deleteUser(user);
      setState({ ready: true, user: null, error: "" });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: authMessage(error, "The cloud account could not be deleted."),
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
    setPassword,
    connectGoogle,
    reauthenticateWithPassword,
    reauthenticateWithGoogle,
    changeEmail,
    changePassword,
    deleteAccount,
    signOut,
  };
}
