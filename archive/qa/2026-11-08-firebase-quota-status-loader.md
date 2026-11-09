# 2026-11-08 — Firebase quota safety, slow loader hint and status refresh

## Firebase / CAPTCHA

- App Check and reCAPTCHA Enterprise are removed from the client entirely.
  `src/firebase.js` no longer imports `firebase/app-check`,
  `.env.production` no longer carries `VITE_FIREBASE_APPCHECK_SITE_KEY`, and
  the Cloud Account / Privacy copy no longer describes attestation or a
  CAPTCHA. No Firebase Console change or billing is required for this client;
  Firestore rules remain the security boundary.
- `archive/FIREBASE_SETUP.md` was updated to describe the disabled provider
  and to document `resource-exhausted` as a quota/rate-limit signal.
- The cloud-sync simulation no longer ships an unused App Check fake.
- `src/cloud-quota.js` adds a 15-minute circuit breaker. A
  `resource-exhausted`, quota, rate-limit or 429 response pauses Firestore
  reads and writes, keeps the local save dirty and owned, and leaves local
  play fully available. Cloud work resumes automatically after the cooldown
  or immediately through `Retry now` in the quota notice / Cloud Account.
- The reconcile debounce moved from 2.1s to 10s and `resource-exhausted`
  no longer enters the three-attempt automatic retry loop. This removes the
  tight read/write pattern that could drain the 50,000 free daily reads.
- Note: the Firebase SDK's component registry still contains the literal
  `@firebase/app-check` identifier, but the built output contains no
  `initializeAppCheck`, `ReCaptchaEnterpriseProvider` or site key.

## Loader

- `LoadingScreen` stays a small grey circle for the first six seconds, then
  adds only `wait for it...`. Header, status notice and footer remain visible;
  roll controls and banners still wait for data/cloud readiness.
- AGENTS.md now describes the delayed hint instead of the older strict
  text-free rule.

## Status notices

- `StatusBanner` is now a normal-flow sibling between the header and `main`,
  including during loading, so the interface shifts down instead of being
  covered. A browser test measures the reflow.
- `use-status-issue.js` polls every `STATUS_POLL_INTERVAL_MS` (60,000 ms),
  also refreshes on focus, visibility and reconnection, guards overlapping
  fetches, and stops its timer when the last subscriber unmounts.
- A browser test advances the clock by one minute and verifies a changed
  incident reaches the banner.

## Validation

- `npm run build`: passed (6.43s).
- `npm run build:github-pages`: passed (5.76s), regenerated `docs/`.
- `npm run verify:cloud`: passed.
- `npm run test:github-pages`: passed.
- `npm run test:worker`: passed.
- Targeted Playwright: **31 passed (46.6s)** across `cloud-quota`,
  `status-banner`, `loading-screen`, `probability`, `local-play-ui` and
  `notices` with 2 workers.
- `prettier --check` and `git diff --check`: passed.
- No full-suite run was attempted; the historical 596/599 parallel-load
  caveat still applies.
