# Account, aura and surplus validation — 2026-11-07

## Implemented

- Separate `/settings/cloud-account` destination, Settings submenu, correct Profile header destination and account prompts.
- Repair publication of an orphaned UID-free public summary using the verified name reservation. Explicit foreign owners remain protected. Owner reads short-circuit public checks.
- Optional boolean `dejaVu` retained across pinned profile data, public summaries, compressed shared links and PNG exports; legacy cards remain readable.
- Opaque, distinct landed/moving digit inks and markers override cosmetic gradient inheritance during reveals, including Godly and Déjà Vu. Light-mode borders and secondary text have stronger contrast.
- Surplus caps: 10% per Rebirth, 20% per Prestige, 30% per Rollback. The accumulated dividend survives reload beyond 100%. Rollback still starts at zero. Advanced stages remain hidden until unlocked.
- Updated screenshots, documentation, Git workflow guidance and GitHub Pages build.

## Checks

- Production build and GitHub Pages build: passed.
- Cloud simulation: passed, including publish/unpublish and recovery of an orphaned summary after opt-out.
- Economy audit, changed-file Prettier check and `git diff --check`: passed.
- Focused Playwright runs: 47 passed (rebirth/rollback/docs/account); 33 passed (public profile/sharing/changelog/docs/account); final 42 passed (cloud saves/account/aura matrix/rebirth progression). These runs overlap; counts are not additive.
- Full initial Playwright run: 549 passed, 25 failed. It ran concurrently with edits; subsequent focused runs corrected and rechecked aura-test selection, README expectations, changelog style and premature Prestige copy. Remaining failures include old profile/account UI assumptions, timing and external status-network errors; the entire suite is NOT certified green.
- Worker smoke: failed while waiting for roll data to become ready. GitHub Pages smoke reached its network assertion but failed on the external status endpoint blocked by this environment. Neither is claimed successful.
- Chromium was obtained from a temporary, untracked npm package because the normal browser download was blocked. No browser binaries or temporary dependencies were added to the repository.

## Deployment requirement

No production deployment, merge or rule publication was performed. Deploy `firestore.rules` with `npm run deploy:rules` before verifying publication and Déjà Vu summaries against real Firebase. Verify owner publish, anonymous direct read, opt-out, denied anonymous read, and foreign-owner rejection. Offline simulation is not proof of deployed rules or Firebase configuration.

## Continuation — all regression checks green

The subsequent continuation fixed the remaining local-profile flow and test assumptions:

- Restored an explicit Continue locally choice on Profile, preserving temporary progress when a local player names their profile. Cloud controls remain exclusively in Settings → Cloud Account.
- Added a local-save location note and a discoverable Cloud Account link on local profiles.
- Profile-gated shop purchases open Profile rather than cloud sign-in.
- Auto-Roll schedules from the committed deadline instead of waiting for the rendered cooldown tick. Existing cancellation, background, commitment and cadence tests remain in place.
- Hosting/UI smoke tests stub only the external status summary. The Worker smoke ignores only `net::ERR_ABORTED` navigation cancellations; genuine transport and HTTP failures still fail. Updated its Cloud Account route assertions.

Final checks after these changes:

- Complete Playwright suite: **574 passed**, zero retries.
- Cloudflare Worker HTTP and browser smoke: passed.
- GitHub Pages build and direct-route/browser smoke: passed.
- Cloud sync simulation including orphan-summary recovery: passed.
- Production build, GitHub Pages artifact generation, economy audit, refreshed screenshots and changed-file formatting: passed.

These results supersede the initial failing checks above. Production deployment and Firebase rules publication are still pending; no merge or live deployment was performed.
