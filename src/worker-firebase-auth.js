const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export class TokenVerificationUnavailable extends Error {
  constructor() {
    super("Firebase sign-in could not be verified right now.");
    this.name = "TokenVerificationUnavailable";
  }
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid base64url data.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function cacheDuration(response) {
  const header = response.headers?.get?.("Cache-Control") ?? "";
  const seconds = Number(header.match(/(?:^|,\s*)max-age=(\d+)/i)?.[1]);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 60 * 60) * 1000
    : 5 * 60 * 1000;
}

export function createFirebaseTokenVerifier({
  fetcher = fetch,
  clock = () => Date.now(),
} = {}) {
  let keys = [];
  let expiresAt = 0;
  let pendingKeys = null;
  let lastUnknownKeyRefreshAt = Number.NEGATIVE_INFINITY;

  async function loadKeys(force = false) {
    if (!force && keys.length && clock() < expiresAt) return keys;
    if (!pendingKeys) {
      pendingKeys = (async () => {
        let response;
        try {
          response = await fetcher(FIREBASE_JWKS_URL, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          throw new TokenVerificationUnavailable();
        }
        if (!response.ok) throw new TokenVerificationUnavailable();
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new TokenVerificationUnavailable();
        }
        if (!Array.isArray(payload?.keys))
          throw new TokenVerificationUnavailable();
        keys = payload.keys.filter(
          (key) =>
            key &&
            key.kty === "RSA" &&
            key.use !== "enc" &&
            typeof key.kid === "string" &&
            typeof key.n === "string" &&
            typeof key.e === "string",
        );
        expiresAt = clock() + cacheDuration(response);
        return keys;
      })().finally(() => {
        pendingKeys = null;
      });
    }
    return pendingKeys;
  }

  return async function verifyFirebaseIdToken(token, projectId) {
    if (
      typeof token !== "string" ||
      token.length > 16_384 ||
      typeof projectId !== "string" ||
      !projectId
    )
      return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let header;
    let claims;
    let signature;
    try {
      header = decodeJsonPart(parts[0]);
      claims = decodeJsonPart(parts[1]);
      signature = decodeBase64Url(parts[2]);
    } catch {
      return null;
    }
    if (
      !header ||
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      header.kid.length > 128 ||
      claims?.aud !== projectId ||
      claims?.iss !== `https://securetoken.google.com/${projectId}` ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.sub.length > 128
    )
      return null;

    const nowSeconds = Math.floor(clock() / 1000);
    if (
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= nowSeconds ||
      !Number.isSafeInteger(claims.iat) ||
      claims.iat > nowSeconds + 60 ||
      claims.exp <= claims.iat ||
      !Number.isSafeInteger(claims.auth_time) ||
      claims.auth_time > nowSeconds + 60 ||
      claims.auth_time > claims.iat + 60 ||
      ("nbf" in claims &&
        (!Number.isSafeInteger(claims.nbf) || claims.nbf > nowSeconds + 60))
    )
      return null;

    let jwk = (await loadKeys()).find((key) => key.kid === header.kid);
    if (!jwk && clock() - lastUnknownKeyRefreshAt >= 60_000) {
      lastUnknownKeyRefreshAt = clock();
      jwk = (await loadKeys(true)).find((key) => key.kid === header.kid);
    }
    if (!jwk) return null;

    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        key,
        signature,
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      return valid ? claims : null;
    } catch {
      return null;
    }
  };
}
