# Firebase setup for RNGdle Infinite

Everything the online backup and the two-factor sign-in need, in order. Steps 1–2
need the Firebase console; step 3 can be run from this repository.

Project id: `rngdle-infinite-jg` (see `.firebaserc` and `.env.production`).

## 1. Firestore database

1. Firebase console → **Build → Firestore Database → Create database**.
2. Location: any `eur` region. Start in **production mode** (this repository
   ships its own rules, so the default locked rules are fine).
3. Publish the rules from this repository:

   ```bash
   npm run deploy:rules
   ```

   This deploys `firestore.rules`, which covers `player_saves`,
   `cloud_profile_settings`, `cloud_profile_names`, `cloud_save_write_limits`,
   `cloud_public_profile_write_limits`, `public_profiles`,
   `public_profile_owners` and `account_security` (two-factor settings).

## 2. Authentication

1. **Sign-in method → Email/Password → Enable.** Required for the email link
   flow too.
2. **Sign-in method → Email link (passwordless sign-in) → Enable.** This is the
   second factor: the app sends a sign-in link instead of a numeric code.
3. **Settings → Authorised domains → add** `rngdle-infinite.jaime-gaming.com`
   (`localhost` is authorised by default, which is what local development uses).
4. Google sign-in stays as it is; nothing extra is needed for it.

## 3. Verify without opening the console

```bash
npm run check:firebase
```

Reads the public web API key from `.env.production`, queries the Identity
Toolkit config endpoint and reports the authorised domains and enabled
sign-in options. Exit code `0` means the two-factor flow is ready; otherwise it
names exactly what is missing.

Hosting lives on a Cloudflare Worker; see [`DEPLOYMENT.md`](DEPLOYMENT.md) for
the deploy, the custom-domain attachment and the checks to run afterwards.

The rules are the only Firebase change this release needs:
`npm run deploy:rules` publishes `firestore.rules`. Until it runs, public
profiles stay broken, because the previous rules compared the game profile id
with the public name key inside `profileIsPublic` / `profileIsPublicAfter`.

## 4. App Check (optional but recommended)

The app sends a reCAPTCHA Enterprise attestation when
`VITE_FIREBASE_APPCHECK_SITE_KEY` is set. Enforcement is a separate switch:

- Firestore → **App Check → APIs → enforce for Cloud Firestore**, only after
  every real client sends attestations. Enforcing too early makes writes fail
  with `failed-precondition`.

## Reading the in-app error codes

The Cloud Account status shows the Firebase error code in parentheses:

| Code                  | Meaning                                                        |
| --------------------- | -------------------------------------------------------------- |
| `permission-denied`   | Rules not deployed, or App Check rejecting the request.        |
| `unavailable`         | Database not created, or the network blocked Firestore.        |
| `failed-precondition` | App Check enforcement is on and this domain is not registered. |
| `unauthenticated`     | Session expired; sign in again.                                |

## Two-factor behaviour (as implemented)

- Registration always sends a **confirmation email**; the Cloud Account page
  offers _Send again_ and _I have confirmed it_. It does not block play, so a
  message landing in spam cannot lock anybody out.
- With **two-factor on** (Cloud Account → Security), a device that is not
  remembered signs in with its password, is signed straight back out, and
  receives a **sign-in link**. Opening the link on that device completes the
  sign-in and remembers the device (up to 12).
- If the link is opened on a device that does not know the address it was sent
  to, the app asks for that address before completing the sign-in — the
  documented protection against session fixation. The address is never carried
  in the link URL.
- Trusted devices live in `account_security/{uid}`; the owner is the only one
  who can read or change them.

### Known limitation

Firebase completes the password sign-in before the link check, so a modified
client could skip the email step. This is genuine protection against phishing
and password reuse, not cryptographic two-factor. Closing that gap needs a
backend (Cloud Functions or a Worker route issuing custom tokens).

## Public profile fixes (November 7, 2026)

Publish the updated `firestore.rules` with `npm run deploy:rules` before testing public sharing. Owner reads are evaluated before public-consent checks, reducing rule evaluation for transactional publication. Pinned-roll summaries now permit an optional boolean `dejaVu`; older documents without it remain valid. Name claims, consent, ownership, listing denial and transactional cleanup remain enforced. No production Firebase deployment was performed by this code change. Verify publish, signed-out direct read, unpublish and denied direct read against the deployed project.

A verified name claim can also repair an orphaned UID-free public summary when its owner pointer is absent. An explicit pointer or legacy UID belonging to someone else always takes priority; the claimant must match the current settings and game profile ID. The cloud simulation includes a private-to-public recovery of this state.
