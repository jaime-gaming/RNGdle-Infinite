# November 28 update readiness

## Release and event are different dates

- **Planned update:** November 28, 2026. This is not an automatic deployment.
- **RNGmas opens:** December 1, 2026 at 00:00 UTC.
- **RNGmas closes:** January 2, 2027 at 00:00 UTC, end-exclusive.
- **Legacy retires:** December 1 at 00:00 Madrid, which is **November 30 at 23:00 UTC**. This is an hour before the event opens, and affects only the Pages mirror.

The November 28 build shows a read-only preview: Tasks has its RNGmas tab,
Shop shows the calendar, all 13 collectible rewards and market prices. Claims,
stalls, exchange and Christmas mode stay locked until their own published
windows. Previewing does not grant currency, boosts, attendance or a reward.
The December 17 sandbox remains a development-only preview, not production time.

## One event interface

The notice, explanation dialog, Tasks, event Shop, winter-pass panels and RNGmas
aura previews share evergreen/cranberry/brass styling and opaque surfaces.
Shared headers and an expandable guide explain where everything belongs:

- **Tasks → RNGmas:** three season missions, eleven gatherings, eight four-day
  commissions and five weekly chapters. All mission claims are here.
- **Shop → RNGmas:** daily Advent doors, Christmas star, source-labelled reward
  gallery, one-time market purchases and the one-way Snowcoin exchange.
- **Pass:** banked consumables are activated by the player; they do not activate
  when earned. Winter pass rewards remain separate from the event collection.

Countdowns show days/hours/minutes/seconds for opening, closure, daily reset,
chapters, mini-events and services. Their leaf components tick without rerendering
the whole game. Shared clocks wake at exact UTC boundaries, including 18:00
mini-event handovers; the Tasks-ready badge cannot retain an expired reward.
No per-second live-region announcements. Reduced motion removes event animation.

## Reward and data safety

The first six calendar doors now pay 10,000 / 12,500 / 15,000 / 17,500 / 20,000 /
22,500 EP. This adds only 37,500 EP to the fixed calendar budget, now 1,547,500 EP.
It is a starter improvement, not an uncapped multiplier or rebirth requirement
shortcut. Existing claimed-door receipts keep their historical EP and cannot be
reclaimed. Later doors, all cosmetic IDs, chapter rewards and rotation budgets
remain unchanged.

The gallery names each reward's source and UTC window, and distinguishes a
permanent aura from a skin that needs its base companion. Consumable cards state
their multiplier, duration and manual activation location. Existing saves get
bounded defaults; no retired RNGween/Black Friday content or historical receipt
is deleted. Both market price generations remain parseable.

## Operator release checklist (not executed automatically)

1. Publish the reviewed branch through the normal main/release workflow only
   after approval. Do not publish `VITE_GAME_PREVIEW_AT` or Legacy preview flags.
2. Build and deploy the Worker and its matching client together; verify version
   manifest, direct routes, scoring-data integrity and roll authority health.
3. **Deploy the reviewed Firestore rules** accepting up to 25 public-profile
   pins. These source rules were prepared earlier but are not deployed by this
   coding session. Test a 25-pin public profile against the actual production
   project after release; local rule-text tests are not a production proof.
4. Cold-load the real domain on November 28, sign in, verify one successful Cloud
   sync and a private local backup. Check read-only event preview and disabled
   Christmas mode. Never include credentials or private saves in screenshots.
5. Verify the Legacy notice on the Pages build, including Madrid/UTC wording,
   then its closure page and exact archival backup. Keep the current root-domain
   site working. Do not erase browser storage or old records.
6. On December 1 verify the first door pays once, its saved receipt survives
   refresh, the correct gathering/commission opens, Christmas mode can toggle,
   and a second device reconciles the new receipt without duplicate rewards.
7. Verify Dec 8 market, Dec 15 exchange, Dec 25 star and Jan 2 expiry. No grace
   periods, automatic imports, hidden staging clock or infinite reward loop.

Tests, simulations and local browser smokes reduce release risk; they do not
prove a live Firebase rules deployment, remote credentials/bindings or production
hosting availability. Those require the operator checks above.

## Verification performed for this change

- Production build and release-label/format checks passed (v0.6.1).
- Render simulations, including Cloud recovery/fallback integrity, passed.
- Cloud save/public-profile simulations against the checked-in rules passed.
- Economy and winter audits passed; winter audit asserts the fixed Advent budget.
- Local Worker browser smoke and GitHub Pages base-path/SPA smoke passed.
- Initial whole-suite run: 736/797 passed, 61 failed while development changes
  were being hot-reloaded. A stale Vite Shop module was reproduced and the server
  restarted. This is **not** recorded as a clean whole-suite run.
- Stable event run: 70/72 passed; the remaining two were new tests accidentally
  matching the hidden dialog header as well as the visible Shop header. Selectors
  now target the visible header. Both passed in the subsequent run.
- Follow-up: all 43 selected regressions passed (the remaining initial failures
  outside the event run, including mobile overflow, plus the two new selectors).
  All initial failure cases passed in those follow-up runs. No known failing
  case remains, but the complete suite was not rerun as a single final invocation.
- Synthetic December 17 screenshots refreshed: itinerary, live gatherings,
  commissions and source-labelled reward collection. Nov 28 Shop widths checked
  at 768, 390, 360 and 320px with no horizontal overflow.

No production deploy, main-branch change, Firebase rule publish or live Cloud
account operation was performed. The evidence above describes local verification.

## Follow-up: release notes and Cloud bookmark verification

The in-game v0.6.1 changelog now carries **November 28**, not November 22, and
no longer advertises five golems, seven auras or a three-day Advent grace period.
Only the publication date changed; event opening, theme activation, doors and
all activity windows remain in December as requested.

A missed test-model mismatch was found: the fake Firestore validator still
accepted at most ten pins. It now models the checked-in 25-pin rules. A separate
Cloud session creates a full 25-bookmark private save, enables sharing, checks
that all 25 distinct pins reach the public summary, and disables sharing again.
A regression test ties the client limit, rules indices and simulation limit
together. These checks do not contact Firebase or imply rules were deployed.

For the production operator, in an authenticated environment with Firebase API
access, inspect the project selection (`.firebaserc`: `rngdle-infinite-jg`), then
run `npm run deploy:rules -- --project rngdle-infinite-jg`. The script publishes
only Firestore rules, not a site build. Confirm successful CLI output and test
publishing/reading all 25 bookmarks with an owned test account on the real domain.
Disable public sharing afterward and verify the private save remains. Do not
truncate a user's bookmarks to ten as a workaround for stale rules.

This Arena environment cannot reach Firebase's APIs. No service account, token,
password or private player save is needed in chat. A production permission error
still requires that operator publish and live verification; code-only tests
cannot remove a stale deployed-rule restriction.
