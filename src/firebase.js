import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const env = import.meta.env ?? {};

const config = {
  apiKey: String(env.VITE_FIREBASE_API_KEY ?? "").trim(),
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN ?? "").trim(),
  projectId: String(env.VITE_FIREBASE_PROJECT_ID ?? "").trim(),
  appId: String(env.VITE_FIREBASE_APP_ID ?? "").trim(),
};

export const firebaseConfigured = Object.values(config).every(Boolean);

const app = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;

export const firebaseAuth = app ? getAuth(app) : null;
export const firestoreDb = app ? getFirestore(app) : null;
