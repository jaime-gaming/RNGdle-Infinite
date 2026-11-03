import { getApp, getApps, initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const env = import.meta.env ?? {};

const config = {
  apiKey: String(env.VITE_FIREBASE_API_KEY ?? "").trim(),
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN ?? "").trim(),
  projectId: String(env.VITE_FIREBASE_PROJECT_ID ?? "").trim(),
  appId: String(env.VITE_FIREBASE_APP_ID ?? "").trim(),
};

const appCheckSiteKey = String(
  env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? "",
).trim();

export const firebaseConfigured = Object.values(config).every(Boolean);
export const cloudAccountRequired =
  String(env.VITE_REQUIRE_CLOUD_ACCOUNT ?? "true")
    .trim()
    .toLowerCase() !== "false";

const app = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;

// App Check adds an automatically refreshed reCAPTCHA Enterprise attestation
// to Firebase SDK requests. A site key is public client configuration. Firestore
// enforcement is a separate Firebase Console setting and must be enabled there
// before invalid or missing attestations are rejected.
let appCheck = null;
if (app && appCheckSiteKey && env.MODE !== "test") {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    // A missing/invalid provider setup must not make local play unusable. The
    // console and App Check status below make the configuration gap explicit.
  }
}

export const firebaseAppCheck = appCheck;
export const firebaseAppCheckStatus = appCheck
  ? "client-ready"
  : env.MODE === "test"
    ? "test-disabled"
    : appCheckSiteKey
      ? "initialization-failed"
      : "site-key-required";

export const firebaseAuth = app ? getAuth(app) : null;
export const firestoreDb = app ? getFirestore(app) : null;
