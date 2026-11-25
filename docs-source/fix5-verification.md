# Bug fix 5 integration and verification

Upstream patch: `3b8d4fa` (`v0.6 bug fix 5`), applied to the RNGmas development
branch. The event retains its `v0.6.1` version identity and its December 17 UTC
development clock. No release notes or previously earned rewards are removed.

## Additional defects corrected

1. **Retry budget did not actually stop the timer.** The hook used to schedule
   another probe after setting a blocked ref. Scheduling and execution now check
   the persisted budget; attempt 40 is the boundary. A healthy initial status or
   explicit retry can recover an exhausted session rather than leaving it local
   forever. A real hook test drives the last timer and asserts no replacement.
2. **Outage marker could precede durable save.** A quota error could activate
   local fallback even though no replacement roll had committed. The marker is
   now created after successful local persistence. Failed saves expose no number
   and leave both the prior save and Cloud request retry ID available.
3. **An abandoned Cloud request survived a local replacement.** After recovery,
   that request ID could replay an earlier Cloud draw. Successful replacement
   commits retire it; failed commits do not. The pending local roll remains the
   authoritative result until settled.
4. **Recovery trusted arbitrary status envelopes.** Non-success responses and
   unknown states can no longer announce recovery. Explicit restriction responses
   remain decisions. Error bodies cannot clear existing restrictions. Status and
   roll fetches are bounded to 15 seconds.
5. **Cloud roll response validation was incomplete.** Timing must belong to the
   game's supported durations; unknown, duplicated or unarmed skills are rejected.
   Empty roll IDs, invalid numbers and invalid durations never update security or
   consume the retry ID.
6. **Restrictions and account/profile changes needed stronger guards.** An old
   outage marker cannot silently bypass a restriction. Late status callbacks and
   asynchronous draws check their account identity before changing active state.
   Marked fallback is scoped to the profile that experienced the outage.
7. **Malformed local outage data could corrupt retry counters.** Marks now validate
   timestamps, counters and profile metadata. HTTP status coercion no longer
   accepts strings, fractions or out-of-range values as outages.
8. **New release checks needed integration with the event branch.** Build metadata
   uses the existing app version source. Verification accepts this release's plain
   label while rejecting a label belonging to a different release line.

## Checks run

- Complete Playwright suite in three alphabetical blocks: 209 + 232 + 309 =
  **750 passed**; focused Cloud and persistence checks rerun after final changes.
- `npm run test:render`, including the real-hook fallback integrity scenarios.
- `npm run verify:cloud`: save precedence, ownership, restrictions and public
  profile simulation.
- `npm run verify:release`: source/test/tool formatting and label consistency.
- Production and GitHub Pages builds; Worker browser smoke; GitHub Pages smoke.
- npm audit, both production-only and including development dependencies:
  **zero known advisories** at the time of this check.

## Limits

These checks run locally with browser fixtures, injected network failures and
simulated Firebase/Firestore services. They do not prove that production DNS,
Firestore rules, service-account secrets or Durable Object bindings are deployed
correctly. No live deployment, rules deployment, main merge or production data
change was requested or performed. Existing large-bundle warnings remain build
warnings, not verification failures. Zero npm advisories is not a guarantee that
no undiscovered vulnerability exists.
