import { unpackVaultSave } from "./save-codec.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const FIRESTORE_API = "https://firestore.googleapis.com/v1";

// The reason travels with the error so the Worker log names the failing
// request (a 403 from Firestore, a rejected service account, a timeout) instead
// of repeating one sentence for every dependency.
export class FirestoreServiceUnavailable extends Error {
  constructor(reason = "Cloud security could not be verified right now.") {
    super(reason);
    this.name = "FirestoreServiceUnavailable";
    this.reason = reason;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeJson(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToBytes(value) {
  if (typeof value !== "string")
    throw new FirestoreServiceUnavailable(
      "the service-account private key is missing",
    );
  const encoded = value
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  try {
    const binary = atob(encoded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new FirestoreServiceUnavailable(
      "the service-account private key is not valid base64",
    );
  }
}

function readServiceAccount(value) {
  if (typeof value !== "string" || !value.trim())
    throw new FirestoreServiceUnavailable(
      "FIREBASE_SERVICE_ACCOUNT_JSON is empty",
    );
  if (value.length > 32_000)
    throw new FirestoreServiceUnavailable(
      "FIREBASE_SERVICE_ACCOUNT_JSON is longer than 32000 characters",
    );
  let account;
  try {
    account = JSON.parse(value);
  } catch {
    throw new FirestoreServiceUnavailable(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON",
    );
  }
  if (
    account?.type !== "service_account" ||
    typeof account.client_email !== "string" ||
    typeof account.private_key !== "string"
  )
    throw new FirestoreServiceUnavailable(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not a service-account key",
    );
  return account;
}

export function createFirebaseAdminTokenProvider({
  fetcher = fetch,
  clock = () => Date.now(),
} = {}) {
  let cached = null;

  return async function getAdminAccessToken(serviceAccountJson) {
    const account = readServiceAccount(serviceAccountJson);
    if (
      cached?.clientEmail === account.client_email &&
      cached.expiresAt > clock() + 60_000
    )
      return cached.token;

    const now = Math.floor(clock() / 1000);
    const assertionHeader = encodeJson({ alg: "RS256", typ: "JWT" });
    const assertionClaims = encodeJson({
      iss: account.client_email,
      scope: FIRESTORE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    });
    const unsigned = `${assertionHeader}.${assertionClaims}`;
    let signed;
    try {
      const key = await crypto.subtle.importKey(
        "pkcs8",
        pemToBytes(account.private_key),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        key,
        new TextEncoder().encode(unsigned),
      );
      signed = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
    } catch {
      throw new FirestoreServiceUnavailable(
        "the service-account private key could not sign a token",
      );
    }

    let response;
    try {
      response = await fetcher(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signed,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new FirestoreServiceUnavailable(
        "the Google token endpoint could not be reached",
      );
    }
    if (!response.ok)
      throw new FirestoreServiceUnavailable(
        `the Google token endpoint answered ${response.status}`,
      );

    let tokenResponse;
    try {
      tokenResponse = await response.json();
    } catch {
      throw new FirestoreServiceUnavailable(
        "the Google token endpoint did not answer with JSON",
      );
    }
    if (
      typeof tokenResponse?.access_token !== "string" ||
      !tokenResponse.access_token
    )
      throw new FirestoreServiceUnavailable(
        "the Google token endpoint returned no access token",
      );
    const expiresIn = Number(tokenResponse.expires_in);
    const expiresAt =
      clock() +
      (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000;
    cached = {
      clientEmail: account.client_email,
      token: tokenResponse.access_token,
      expiresAt,
    };
    return cached.token;
  };
}

function documentUrl(projectId, collection, id) {
  return `${FIRESTORE_API}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

function requestLabel(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.pathname.replace(/^\/v1\/projects\/[^/]+\//, "");
  } catch {
    return "the Firestore request";
  }
}

async function authorizedJson(fetcher, url, token, options = {}) {
  try {
    return await fetcher(url, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new FirestoreServiceUnavailable(
      `${requestLabel(url)} could not be reached`,
    );
  }
}

export async function readCloudRestriction({
  projectId,
  userId,
  serviceAccountJson,
  fetcher = fetch,
  getAdminAccessToken = createFirebaseAdminTokenProvider({ fetcher }),
}) {
  if (!projectId || !userId)
    throw new FirestoreServiceUnavailable(
      "the Cloud security record has no account",
    );
  const token = await getAdminAccessToken(serviceAccountJson);
  const response = await authorizedJson(
    fetcher,
    documentUrl(projectId, "cloud_security_status", userId),
    token,
  );
  if (response.status === 404)
    return {
      restricted: false,
      exists: false,
      cloudAccess: null,
      warningStage: 0,
    };
  if (!response.ok)
    throw new FirestoreServiceUnavailable(
      `reading the Cloud security record answered ${response.status}`,
    );

  let document;
  try {
    document = await response.json();
  } catch {
    throw new FirestoreServiceUnavailable(
      "the Cloud security record was not JSON",
    );
  }
  const fields = document?.fields ?? {};
  const cloudAccess = fields.cloud_access?.booleanValue;
  return {
    restricted: cloudAccess !== true,
    exists: true,
    cloudAccess: cloudAccess === true,
    warningStage: 0,
  };
}

export async function writeCloudRestriction({
  projectId,
  userId,
  serviceAccountJson,
  verifiedEvents,
  clock = () => Date.now(),
  fetcher = fetch,
  getAdminAccessToken = createFirebaseAdminTokenProvider({ fetcher }),
}) {
  if (!projectId || !userId)
    throw new FirestoreServiceUnavailable(
      "the Cloud security record has no account",
    );
  const token = await getAdminAccessToken(serviceAccountJson);
  const path = documentUrl(projectId, "cloud_security_status", userId);
  const existing = await authorizedJson(fetcher, path, token);
  if (!existing.ok && existing.status !== 404)
    throw new FirestoreServiceUnavailable(
      `reading the Cloud security record answered ${existing.status}`,
    );

  const fields = {
    cloud_access: { booleanValue: false },
    status: { stringValue: "restricted" },
    reason: { stringValue: "repeated-early-roll-requests" },
    verified_events: {
      integerValue: String(
        Number.isSafeInteger(verifiedEvents) && verifiedEvents >= 0
          ? verifiedEvents
          : 0,
      ),
    },
    updated_at: { timestampValue: new Date(clock()).toISOString() },
  };
  const body = JSON.stringify({ fields });
  let response;
  if (existing.status === 404) {
    const createUrl = new URL(
      `${FIRESTORE_API}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/cloud_security_status`,
    );
    createUrl.searchParams.set("documentId", userId);
    response = await authorizedJson(fetcher, createUrl, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.status === 409) {
      response = await authorizedJson(fetcher, path, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
    }
  } else {
    const updateUrl = new URL(path);
    for (const key of Object.keys(fields))
      updateUrl.searchParams.append("updateMask.fieldPaths", key);
    response = await authorizedJson(fetcher, updateUrl, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }
  if (!response.ok)
    throw new FirestoreServiceUnavailable(
      `writing the Cloud security record answered ${response.status}`,
    );
  return true;
}

export async function readPlayerSave({
  projectId,
  userId,
  idToken,
  fetcher = fetch,
}) {
  if (!projectId || !userId)
    throw new FirestoreServiceUnavailable("the Cloud save has no owner");
  if (!idToken)
    throw new FirestoreServiceUnavailable(
      "the Cloud save was read without a sign-in token",
    );
  const response = await authorizedJson(
    fetcher,
    documentUrl(projectId, "player_saves", userId),
    idToken,
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new FirestoreServiceUnavailable(
      `reading the Cloud save answered ${response.status}`,
    );

  let document;
  try {
    document = await response.json();
  } catch {
    throw new FirestoreServiceUnavailable("the Cloud save was not JSON");
  }
  const packed = document?.fields?.save_data?.stringValue;
  if (typeof packed !== "string" || !packed)
    throw new FirestoreServiceUnavailable("the Cloud save has no save data");
  try {
    const raw = unpackVaultSave(packed);
    const progress = JSON.parse(raw);
    if (
      !progress ||
      typeof progress !== "object" ||
      Array.isArray(progress) ||
      typeof progress.profile?.id !== "string" ||
      !progress.profile.id
    )
      throw new Error("Invalid Cloud save.");
    return progress;
  } catch {
    throw new FirestoreServiceUnavailable(
      "the Cloud save could not be decoded",
    );
  }
}
