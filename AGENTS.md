# AGENTS.md

Context for coding agents working on RNGdle Infinite. Read this before changing
anything. The player-facing overview and cloud setup are in `README.md`.

## Project overview

A React + Vite browser game. Players roll a uniformly random whole number from
0 to 1,000,000, score EP from its digit patterns, collect badges, and spend EP
on companions, skills, tasks, rebirths and cosmetics. A Cloudflare Worker with
static assets serves the Vite build from `dist/` at the custom-domain root.

Gameplay remains available without an online account. Local profiles live in
browser storage. When a build is configured, Firebase Authentication provides
Google and email/password sign-in, and Cloud Firestore stores one compressed
progress snapshot at `player_saves/{uid}`. The Cloudflare Worker serves the
root-domain build from `dist/`; legacy GitHub Pages serves the repository-path
build from `docs/`. The configured Firebase project is
`rngdle-infinite-jg`; its public Web config is in `.env.production` for
production builds and `.env.example` for local setup. Firestore rules—not API-key
secrecy—protect each user's save. The old Supabase project and
its data are not used or migrated by this app; leave them untouched. Do not use
or change the connected “Better Discovery” project, and never put a Firebase
service-account key in client code or a `VITE_` variable.

RNGween 2026 gameplay and its seasonal interface have retired. Old permanent
aura ownership, Hexbound, attendance timestamps and `rngween-*` history are
still part of the save contract. Do not remove those records or reintroduce
event progression/UI. The old RNGween changelog entry is historical and stays.

Black Friday 2026 is retired. `src/black-friday.js` keeps only the limited
`blackout-2026` aura, its family and the `progress.blackFriday` save record
(`{ id, spent, stamps, skinEarned }`); there is no sale UI, pricing or branding
left. `sale-reward` history rows stay parseable and visible.

RNGmas 2026 and the Battle Pass are the live event exceptions. RNGmas runs from
1 December 2026 to 2 January 2027 (UTC) in `src/rngmas.js`: the temporary
Frostfall theme in the Appearance menu (December 1–January 2, after First Light), a 24-door advent calendar on
`/shop/rngmas`, and five weekly activities. A door is claimable only on its December UTC day; door 24 pays the Gingerbread aura and the
Christmas Day-only star pays the RNGmas Star aura. Golem Smash uses the next normal online roll as damage after preparing a paid strike.
`progress.rngmas` (`{ id, claimed, finale, golems, snowcoins, snowcoinsEarned, snowcoinsExchanged, marketPurchases }`) is part of the save
contract and survives every reset, like permanent cosmetics.

RNGmas combines RNGween mission/aura art with Black Friday-style offer cards and a stall-visit passport; neither retired event is reactivated. The page
decoration is `src/components/RngmasDecor.jsx`: a fixed, `aria-hidden`,
`pointer-events: none` layer behind `#root` (which gets `isolation: isolate`),
aligned under the header, that sets `data-season="rngmas"` while the season is
live and takes it away afterwards. It draws snow banks, pines, gifts, bells,
garlands and a 22-flake snowfall; `is-reduced-motion` keeps the picture and
drops every animation. The eight actively offered event auras and three winter pass auras use
`src/components/RngmasAura.jsx` plus `src/rngmas-auras.css`, which reuse the
shared `.aura-*` ornament rules from `rngween-auras.css` (seal, filigree,
crest, guardians, motes) instead of Black Friday's flat box paint. Keep new
event art in that shape: hand-drawn marks in `game-icons.jsx`, SVG ornaments,
CSS keyframes, and a reduced-motion path for each.

Dev builds honour
`VITE_GAME_PREVIEW_AT` (a UTC epoch in milliseconds) to shift the shared game
clock for previews; production ignores that variable, and Playwright forces it
off so date-sensitive tests remain deterministic. Special & Limiteds banners
and wardrobe filters appear only when the save owns an event aura. Aura cards
have a rarity preview. Moving reveal digits are lighter than landed digits
using opacity only, without adding backgrounds, borders, underlines or other
decorations.

The Battle Pass (`src/battle-pass.js`) uses individually configured season
end dates or durations. Only launched seasons are listed; a successor requires
an explicit code update, and the interface must not reveal its name or date in
advance. First Light
starts on 2026-11-18. Its accent is shared by `/pass`, the temporary theme and
the active Pass navigation animation. Every pass mission — daily, weekly and
season milestones — is listed on the Tasks page in its own section; `/pass`
keeps the reward track. BPEP advances the pass but is not a shop wallet. Once
the 15,000-BPEP track is complete, every additional BPEP earned from an online
roll or mission automatically converts to 100 EP; BPEP left over from the
reward that completes the track converts too. The optional premium track is
bought with EP, never real money. Levels 5, 15 and
25 add a consumable boost charge (the premium track pays two) without touching
their EP, the season milestone `pass-season-boost` pays one more, and one charge
a day can be bought for `PASS_BOOST_PRICE` EP; one boost runs at a time and
multiplies banked roll EP for a few minutes through
`walletMultiplier(progress, skills, at)`. Charges survive a
season change, Rebirth, Prestige, Rollback and Fresh Start. Reward tracks are visible,
each reward claims once, and earned rewards are delivered automatically when a
season closes. `progress.battlePass` survives Rebirth, Prestige, Rollback and
Fresh Start. The pass and other dated gameplay use the shared
`VITE_GAME_PREVIEW_AT` dev clock; production ignores it, and Playwright overrides
it to keep tests on the real fixture time. Pass auras and the Prism Axolotl
variant are permanent cosmetics once
claimed. `rebirthKeptPurchases` in `src/rebirth.js` mirrors the reducer's keep
rule (aura or `passReward`); the Rebirth page and Fresh Start read it instead of
guessing from product kinds, so a `pet-variant` is never listed as handed back.
Badge gates round up over `BADGE_TOTAL`, so each rung prints the exact badge
count beside the round share (`badgeGatePercent`) and never the nominal slice.
Only rolls fund a cycle gate.

## Architecture

- **One reducer owns progress.** `applyProgress(state, action)` in
  `src/progress.js` validates and returns save changes. Components dispatch
  actions through `src/use-progress.js`; do not mutate progress in a component.
- **A roll is committed before animation.** The reducer stores `pendingRoll`
  before the UI reveals it, then `complete` settles it. Reloading during a
  reveal resumes the same result; it must never reroll or credit twice.
- **Scoring is data, not UI code.** Badge values and ranks come from prepared
  tables in `public/data/` (generated by `tools/prepare-game-data.mjs`). Do not
  hand-edit those tables.
- **Repair saves instead of losing them.** `parseAndRepairProgress` keeps valid
  data, records repairs and backs up original bytes. New fields need a default
  in `emptyProgress()`, defensive parsing, and a malformed-save test.
- **Compressed primary saves.** `writeDeviceSave` always writes the bounded
  gzip envelope (plain JSON only when gzip is unavailable); a failed write
  leaves the previous save untouched. Old JSON saves stay readable. Always read
  via `parseProgress`/`parseAndRepairProgress` (or decode with
  `unpackVaultSave` for raw JSON consumers). Never delete history, recovery
  slots or owner markers to fit a new save. The activity log keeps 10,000
  entries and warns at 7,500.
- **Cloud save precedence is deliberate.** On first Firebase sign-in, import an
  unowned local save only when that user's Firestore document is missing. Never
  copy a save marked as belonging to another auth user. Reconcile durable game
  progress, not file size, log length, timestamps, preferences or auxiliary
  records:
  - **Same game-profile ID: resolve automatically.** A later reset generation
    wins first (`freshStarts`, `rollbacks`, `ultraRebirths`, then `rebirths`).
    Within the same generation, strict durable-progress dominance wins; mixed
    progress uses `saveProgressScore` across EP, rolls, unlocks/cosmetics, Pass
    progress, event rewards and other retained game progress. For an exact score
    tie, keep local-only preferences when durable progress is equal; when the
    durable progress is mixed, keep the current online copy for a stable
    cross-device result. Never ask the player to choose between same-profile
    copies solely because the values are mixed or reset generations differ.
  - **Different game-profile IDs: ask.** When both copies have profile IDs and
    they differ, require confirmation even if one looks empty or has less
    progress. Never merge profiles or transfer one profile's cosmetics to the
    other. A candidate with no profile ID is not a competing profile.
  - **A copy this device already synced continues automatically.** After every
    successful reconciliation, `writeCloudSyncMark` stores that account's
    document fingerprint, profile ID and alias in local storage. An unchanged
    online document is a known continuation, not a competing branch; the local
    copy can upload normal progress or adopt the online copy when it is ahead.
    A local authoritative restore still takes precedence. Without a matching
    mark, apply the same profile-ID, reset-generation and progress-score rules.
  - **An unsettled roll is not missing progress.** A roll still pending online
    that this device has already settled must not count as the online copy being
    ahead.
  - **Invalidate stale profile choices.** A changed _online_ copy invalidates
    a pending cross-profile choice; a local copy that merely advanced during the
    review may still be selected if it remains the same profile. Preserve an
    explicit player's selection when they confirm which different profile to
    keep.
  - **`profile_id` has two scopes.** The owner pointer (`public_profile_owners`)
    and the name claim are keyed by the public name, and the owner's
    `profile_id` repeats that key; the settings document and the claim's
    `profile_id` hold the game profile id. Rules tie the two scopes together by
    comparing the claim with the settings, never with the owner. Comparing them
    made every public publish and public read fail with `permission-denied`.
  - **Rebinding a profile unpublishes its alias.** Rules require the private
    save, the name claim and the owner pointer to describe one game profile, so
    a resolution that switches the account to a different game profile must
    clear `public_profile_id`/`public_profile_enabled` and delete the alias
    documents in the same transaction. Never point an existing public alias at
    different progress.

  Reconcile in a Firestore transaction. Before a competing copy is displaced,
  persist it to the separate local cloud-recovery slot; routine continuation of
  the same sync-marked save is not a conflict. Keep the rolling local save and
  vault active. Signing out keeps local progress; deleting the game save removes
  its Firestore document, not the Firebase auth identity.

- **Link sign-in providers, don't fork saves.** Email/password users can sign
  in directly. Google users must add a password after Google authentication;
  link Email/Password to the same Firebase UID before enabling gameplay or cloud
  sync. Use Firebase credential linking, never create another UID or merge its
  save. If an email account already exists, the player signs in with that method
  first and connects Google from the same authenticated account.
- **Cloud security is database-enforced.** `firestore.rules` restricts each
  private save to its Firebase UID. Public profile summaries contain no UID and
  exist only after explicit opt-in; a private ownership map ties each alias to
  its save, and direct reads are allowed only while consent remains enabled.
  Collection listing is denied, and opt-out, rename and account deletion remove
  the summary and ownership map with the corresponding save update. Publish
  those rules in the configured Firebase project before enabling cloud play.
  Browser config in `.env.production` and `.env.example` is public; never put
  service-account credentials in source or build output.
- **UTC for calendar labels.** Daily/weekly task periods use UTC (`Date.UTC`,
  `getUTC*`, `timeZone: "UTC"`). Gameplay timers use `gameNow()` in
  `src/game-clock.js`; `Date.now()` is for non-gating timestamps. The event-gated
  systems are RNGmas (`src/rngmas.js`) and the individually scheduled Battle
  Pass seasons (`src/battle-pass.js`). Nothing else gates gameplay by calendar
  date.
- **Routes are client paths.** `src/router.js` owns paths such as `/shop/auras`
  and `/profile/<username>`. The Worker serves the app at the domain root; its `assets.not_found_handling: single-page-application` serves
  `index.html` for direct route loads, and `public/_headers` keeps HTML and the
  update manifest fresh while allowing long-lived caching for hashed bundles.

## Legacy save data that must remain readable

- `tasks.rngween` is parsed only to restore aura receipts; it is not an active
  task collection.
- `rngweenLimited` keeps the permanent aura and Hexbound ownership receipts;
  currency, temporary purchases and retired gameplay state are discarded.
- `events` attendance stamps are parse-only historical data. The game does not
  create new attendance records.
- `rngween-*` activity rows stay parseable, visible in history and included in
  historical totals. Their event modules, shops and actions are retired.
- `preservePermanentCosmetics` protects owned cosmetics when same-profile
  local/cloud snapshots are reconciled. Different profiles never inherit each
  other's cosmetics.
- `blackFriday` records (`{ id, spent, stamps, skinEarned }`) keep the sale-day
  EP total; stamps are always derived from it (`stampsForSpend`), so a
  hand-edited card cannot invent any. The limited skin also lives in `owned`
  like any permanent cosmetic. Junk or foreign records are repaired to an
  empty one.
- `sale-reward` activity rows stay parseable and visible in history; they carry
  no EP and never count as spending.
- `rngmas` records (`{ id, claimed, finale, golems, snowcoins, snowcoinsEarned, snowcoinsExchanged, marketPurchases }`) keep the advent doors
  opened, the Christmas Day star and each golem's damage, strikes and defeat.
  Rewards are always re-derived from the record (`rngmasRewardIds`), so a
  hand-edited save cannot invent a calendar aura. Junk or foreign records are
  repaired to an empty one.
- `advent-claim`, `golem-smash` and `golem-reward` activity rows stay parseable
  and visible in history.
- `battlePass` keeps the current season, BPEP, premium flag, claimed rewards,
  mission tallies and a bounded archive. `pass-reward`, `pass-mission` and
  `pass-upgrade` activity rows stay parseable and visible in history.

## Firebase setup and implementation

- Copy `.env.example` to ignored `.env.local` for local development. Production
  builds use the public Web config in `.env.production`. The four
  `VITE_FIREBASE_*` values are not secrets; never put a service-account JSON/key
  in the browser build.
- Enable Email/Password and Google in Firebase Authentication; Google is
  already enabled for `rngdle-infinite-jg`. Add
  `rngdle-infinite.jaime-gaming.com` and `localhost` to authorized domains.
  This Firebase Console change is required before cloud sign-in works on the
  custom host; it is separate from the Cloudflare Worker/DNS setup. Create
  Firestore in a European location and publish `firestore.rules` before testing
  cloud saves.
- App Check and reCAPTCHA Enterprise are intentionally disabled in the
  client to protect the free quota. `.env.production` carries no site key and
  `src/firebase.js` never imports `firebase/app-check`. Firestore rules remain
  the security boundary. Do not reintroduce per-request attestation; a visible
  CAPTCHA, if ever needed, must be limited to sign-in only.
- Saves use one Firestore document per UID at `player_saves/{uid}`. The JSON
  snapshot is compressed with the existing vault codec to stay below Firestore's
  1 MiB document limit. Rules are the security boundary.
- `src/firebase.js` creates the app/Auth/Firestore clients;
  `src/use-firebase-auth.js` handles email/password, Google popup/redirect and
  required password linking after Google sign-in; `src/cloud-save.js` owns
  Firestore CRUD, progress comparison, and ownership/cache/recovery markers;
  `src/use-progress.js` coordinates the local save with transactional
  reconciliation. Do not initialize Analytics unless explicitly requested.
- **The loading screen stays quiet until a wait becomes long.**
  `src/components/LoadingScreen.jsx` renders one small grey circle; after six
  seconds it adds only `wait for it...`. Header, status notice and footer stay
  visible, while roll controls and banners do not appear. States that need a
  player decision (conflict, load error, offline, maintenance) still show the
  normal interface. The local save is read and persisted before any cloud
  request, and written again on a failed load, so waiting never costs local
  progress.
- Cloud loading gates progress actions for an authenticated user. On a load
  error, retain local data and require an explicit retry before changing the
  save. On sync failure, retain local progress, mark it dirty and offer retry.
  Never replace a conflicted version unless its recovery copy was persisted.
- The app starts with Firebase as a new provider; it does not migrate accounts
  or saves from the archived Supabase project. Never merge different game
  profile IDs that both hold progress; surface the mismatch and let the player
  choose one complete save. For the same profile, compare durable game
  progress—not file size, timestamps, history length or preferences. A device's
  own already-synced copy continues automatically (see the sync mark), and
  equal or empty copies never ask; an untrusted different reset generation or
  mixed progress still requires the player's choice. Unowned local progress may
  be imported when the cloud document is missing, and a save owned by another
  auth user is never a candidate.

## Security and UI baseline

- `public/_headers` sets `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy` and HSTS. Do not add frame-ancestor or
  `X-Frame-Options` denial headers: the game is shown in preview iframes.
- Every `target="_blank"` link uses `rel="noopener noreferrer"`.
- The loader is a small, grey circle inside `<main aria-busy>`; the header,
  status notice and footer stay visible. A long wait adds only `wait for it...`.
- `src/cloud-quota.js` pauses Firestore reads and writes for 15 minutes after
  `resource-exhausted` or another quota signal. Local play stays available, the
  save stays dirty, and cloud work resumes automatically after the cooldown or
  on an explicit retry. The reconcile debounce is 10 seconds, not a tight loop.
- Status notices poll every 60 seconds and also on focus, visibility and
  reconnection. The banner is a normal-flow sibling between the header and
  `main`, so the interface shifts down instead of being covered.

## Tool-call budget

- Tool calls are a limited per-turn resource. Arena.ai does not publish an
  exact per-turn figure in this repository; do not invent one. Treat every
  call as part of a small budget.
- Batch related work: one read that collects the needed context, one script
  that applies several file edits, one validation command that covers the
  affected specs, and one multi-tool response for independent calls. Avoid a
  separate tool call for each file or each tiny edit.
- Prefer targeted validation over a long full-suite run when a batch touches a
  known area; record the exact specs and results in a QA note.

## Source map

| Path                                             | Responsibility                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `src/main.jsx`                                   | App shell, routes, roll wiring and account/profile presentation.            |
| `src/progress.js`                                | Save format, migrations, repair, reducer and legacy receipt parsing.        |
| `src/use-progress.js`                            | Local persistence and transactional cloud reconciliation.                   |
| `src/firebase.js`, `src/use-firebase-auth.js`    | Firebase clients, email/Google auth and provider linking.                   |
| `src/cloud-save.js`                              | Firestore CRUD, save comparison and browser ownership/cache/recovery.       |
| `firestore.rules`                                | Per-UID Firestore access policy.                                            |
| `src/roll.worker.js`, `src/random.js`            | Worker-based roll scoring and random source.                                |
| `src/badges.js`, `src/infinite-badges.js`        | Badge definitions, families and metadata.                                   |
| `src/pets.js`, `src/skills.js`, `src/rebirth.js` | Companions, skills, rebirth, prestige and rollback rules.                   |
| `src/tasks.js`, `src/history-tally.js`           | Daily/weekly tasks and historical profile totals.                           |
| `src/shop-data.js`                               | Products, shelves, aura families and timing upgrades.                       |
| `src/rngmas.js`, `src/use-rngmas.js`             | RNGmas schedule, advent calendar, golems and rewards.                       |
| `src/rngmas.css`, `src/rngmas-auras.css`         | RNGmas shelf, snow decoration and winter aura art.                          |
| `src/changelog.js`, `src/app-update.js`          | Release notes, unseen-version marker and update identity.                   |
| `src/components/`                                | Game, account and profile UI.                                               |
| `src/*.css`                                      | Feature styles; `src/mobile.css` is loaded last.                            |
| `tests/`                                         | Playwright specs; `tests/helpers/` contains shared test setup.              |
| `tools/`                                         | Worker/GitHub Pages builds and smoke tests, data preparation and audits.    |
| `wrangler.jsonc`                                 | Cloudflare Worker name, `dist/` static assets, SPA fallback, custom domain. |
| `public/_headers`                                | Update-safe static caching and security headers on the Worker.              |
| `archive/DEPLOYMENT.md`                          | Worker deploy, custom-domain setup, verification and rollback.              |
| `media/`                                         | README screenshots generated by `tools/screenshots.mjs`.                    |

## Commands

```sh
npm install
npm run dev              # configured Firebase dev build on 0.0.0.0:5173
npm run dev:test -- --port 5174 # local-only mode for tests/screenshots
npm test                 # Playwright suite (starts dev:test on port 5174)
npx playwright test tests/roll.spec.js
npm run build            # production build into dist/ for Cloudflare Workers
npm run build:github-pages # production build into docs/ for legacy GitHub Pages
npm run test:worker      # smoke-test the Worker artifact and SPA routes locally
npm run verify:cloud     # Cloud Accounts simulation against firestore.rules
npm run test:render      # mount the app shell plus offline overlay and profile privacy in Node
npm run test:github-pages # smoke-test the GitHub Pages base path and SPA fallback
npm run deploy:worker    # build and deploy the Worker (production is guarded)
npm run audit:economy    # price ladder and roll-distribution audit
npm run format           # Prettier over src, tests, root configs and README
```

For local cloud development, copy `.env.example` to `.env.local`. Local
gameplay and tests should also work with no Firebase development variables;
the checked-in `.env.production` is used only for production builds.

`npm run verify:cloud` needs no Firebase: it runs real app sessions on simulated
devices that share a fake Firestore which evaluates every commit against a model
of `firestore.rules`. The model must be kept in sync; it is not an emulator or
proof that a deployed Firebase project accepts a write.
It covers the first upload, a second device adopting the online save, both-way
sync, a stale device never overwriting newer progress, publishing, unpublishing
and the two-profile conflict. `tools/cloud-sync-sim/public-profile.mjs` then
checks the enable path alone: a healthy account, a full 25-bookmark profile
(without truncation), an account whose name was never reserved (it must be claimed before publishing) and a name another account
owns (it must stay private and report a conflict).

`npm run test:render` bundles the app shell, the offline overlay and the profile
privacy control with esbuild and renders them over `happy-dom`, so a component
that fails to render (an undefined identifier in a hook, for example) fails
without a downloaded browser. Playwright stays the end-to-end check, but it
cannot catch an error that only appears at runtime, so run `test:render` after
touching `src/main.jsx`, `src/use-progress.js` or the overlay.

Re-run `verify:cloud` after changing `src/cloud-save.js`,
`src/use-progress.js` or `firestore.rules`; it is the only automated check of the
rules/contract pair, because Firebase itself is never reached from CI.

Playwright uses `CHROMIUM_PATH` when provided. Some environments need
`--no-sandbox`; `playwright.config.js` already passes the flag for a supplied
Chromium binary. Keep realistic reveal/cooldown timing in tests; set a longer
test timeout rather than changing game timers.

RNGmas gates calendar doors and golem weeks by date. Specs that assert exact
advent windows, golem HP or rewards pin the virtual clock — `page.clock.install()`
with a fixed time, or `pauseClockAt` inside `tests/rngmas.spec.js` — and must
never depend on the real calendar date.

## Product rules

- **Honest rolls.** Skills may change draw count or the kept number, but never
  the scoring table, badge values or rank. Wallet multipliers affect banked EP
  only.
- **Companions do not alter the roll.** They multiply EP. Trail and Drift use
  their own independent random sample.
- **Rollback** stays hidden until three prestiges, starts from 0 EP and can be
  repeated. Prestige and Rollback reset the ladder; only the documented
  permanent bonuses and surplus bank survive.
- **Fresh start** is offered after three prestiges. It keeps the profile,
  permanent auras and a keepsake row; run-bound progress resets.
- **Profile cards are one-way exports.** `src/profile-card.js` reads old token
  formats and encodes the current format. A card/link must never overwrite a
  game save.
- **Aura finish.** New aura definitions need a `swatch`; the shared finish in
  `src/number-box.css` uses it. Keep bespoke aura art intact.
- **Tiers** come from `src/data/game-index.json` and the generator in
  `tools/prepare-game-data.mjs`. Updating tiers touches progress/history
  validation, presentation and pinned tests.
- **Profile URLs** use `/profile/<username>`; bare `/profile` is the guest or
  account setup page. The profile logo is uploaded by clicking its picture.
- **History remains valuable.** Bulk deletion honors bookmarks and preserves
  archived totals. Legacy event rows are read-only historical records.
- **Presentation settings do not affect odds, EP, prices or timings.** Offline
  rolls pay EP and enter history; skills charge online only.
- **Offline Roller pays on its own screen.** `src/components/OfflineRewards.jsx`
  is a full-screen modal `<dialog>` (portal + `useModalDialog`); it must not go
  back to an in-page card, because the roll view and ads kept painting
  underneath it. Its accessible name stays `Offline rewards`, a running batch
  cannot be dismissed halfway, and closing it dispatches `offline-dismiss`
  (`status.retry()` when that fails).
- **Public sharing never fails silently.** `reserveCloudProfileName` repairs an
  account whose settings never claimed its name; `setPublicProfileVisibility`
  reports the conflict, the publish failure and the rules/network error as text.
  Do not disable the privacy button for an unreserved name: that state is
  recoverable and the player must see the result of the click.
- **English copy and formatting.** Use `formatEP`/`toLocaleString("en-US")`;
  do not let browser locale leak into player-facing numbers.

If a request conflicts with one of these save/security contracts, stop and ask
rather than guessing.

## Economy and content

- Companion prices/multipliers: `src/pets.js`; skills and stall rotation:
  `src/skills.js`; rebirth rules: `src/rebirth.js`; products/timing upgrades:
  `src/shop-data.js`; tasks: `src/tasks.js`; Battle Pass: `src/battle-pass.js`.
- Run `npm run audit:economy` after changing economy values. Check that nothing
  becomes free or unreachable and the ladder still climbs.
- Badge data comes from `src/badges.js` and `src/infinite-badges.js`; artwork
  is vendored by `tools/vendor-emoji.mjs`.
- Mobile Playwright specs use 390×844; the phone breakpoint is 760px.

## Publishing and versioning

- Cloudflare **Workers** (static assets, no script) serves the root-domain Vite
  build from `dist/`. `wrangler.jsonc` holds the Worker name, the assets
  directory, the `single-page-application` fallback and the
  `rngdle-infinite.jaime-gaming.com` custom domain; `npm run deploy:worker`
  builds and deploys it. A hostname can belong to only one Cloudflare service,
  so the old Pages project must not keep that custom domain. Never claim the
  live domain is updated until the deploy, DNS and HTTPS are verified
  independently; see `archive/DEPLOYMENT.md`.
- GitHub Pages currently uses the legacy `main` branch `/docs` source at
  `jaime-gaming.github.io/RNGdle-Infinite`. Run
  `npm run build:github-pages` before the release PR so `docs/` contains the
  `/RNGdle-Infinite/` base-path build, SPA `404.html`, and `.nojekyll` file.
  A squash-merge to `main` causes GitHub Pages to publish those committed files.
  GitHub Pages is a mirror whose base path is `/RNGdle-Infinite/`; it is not the
  custom domain.
- `npm run deploy:worker` builds and deploys the Worker `rngdle-infinite` with
  `wrangler deploy`, which also claims the custom domain. Deploying the
  production branch `main` requires the explicit `CF_ALLOW_PRODUCTION=true`
  opt-in. `-- --dry-run` builds and validates without uploading. Do not run a
  live deploy without the user's instruction.
- After a hosting change, run `npm run build` and `npm run test:worker`. The
  Worker smoke test exercises root assets, headers, direct client routes, the
  version manifest and (when Chromium is available) local gameplay; it does not
  verify Cloudflare settings, DNS, Firebase authorized domains, or a production
  deployment.
- `src/app-update.js` tracks the internal label for the reload-until-updated
  flow. The current label is exactly `v0.6.1fix1`; do not change it
  until the next session or an explicit user request. Public release notes
  live in `src/changelog.js` and keep historical entries.
- Work on the session branch; do not push to `main` directly. Do not open a PR
  until the user asks. Use `gh` for PRs and checks.
- **Merge with GitHub's squash merge, never a merge commit or a rebase**, and
  name the squashed commit after the release it publishes: `v0.5.2 bug fix 2`
  when the merge carries bug fixes (the number matches the internal `fixN`
  label), otherwise just `v0.5.2` or, for a new minor line, `v0.6`. Merge only
  when the branch is verified: `npm run build`, `npm run test:worker`,
  `npm run verify:cloud`, the Playwright suite and `prettier --check`.
- A change to `firestore.rules` only takes effect after
  `npm run deploy:rules`. Say so explicitly in the merge summary; the app cannot
  deploy rules for the user, and the client must stay compatible with the rules
  that are actually deployed.

## Style

- Prettier is the formatter. Format files changed by a task.
- Source, tests, comments and generated output are English only; leave no
  Spanish strings or copy.
- Only event-retirement markers such as `RETIREMENT` or `DELETE EVENT` may
  remain as comments. Remove comments that narrate or describe code, CSS or
  markup; keep the code self-explanatory.
- Player-facing copy should be plain and friendly.

## Required Git workflow

- Always finish completed changes with a commit and push to the session branch.
- After a requested merge succeeds, delete the merged remote branch (use `gh pr merge <number> --squash --delete-branch`). Never switch branches or delete the active checkout; respect session branch restrictions.

- **Bug fixes never rewrite release notes.** Preserve all existing `src/changelog.js` entries verbatim during a bug fix. Record implementation/QA notes separately. Presentation-only capitalization is fine; add release notes only for an explicitly requested new release.

Christmas decorations respect the persisted `christmasMode` setting in Themes.
Weekly activities use the retired RNGween main-roll tally rules and mission card
layout recovered from commit `d131975`. Legacy `golems` IDs remain save receipts;
new `count`, `armed`, and `lastNumber` fields are parsed defensively. Only the
December 1–8 chapter is Golem Smash. Prepare a strike for 100,000 EP; the next
online committed result deals its numeric value as damage, once. Offline and
extra skill rolls do not add progress. Weekly claims grant their permanent aura,
modest EP (the last two weeks), Snowcoins and chapter-specific boost bundles. RNGmas 2026 is pass
season 2, December 1–January 2 UTC. The local dev preview is December 17 UTC.

Pass reward definitions are resolved by saved `seasonId` through `passRewardsFor`.
Never use the First Light `BATTLE_PASS_REWARDS` constant directly for live claims,
receipt repair, rollover delivery or the Pass page. RNGmas uses Snowglobe (free
10), Midnight Carillon (premium 20) and Polar Crown (premium 30), with a smaller
EP budget retained from its original schedule. Existing First Light ownership stays intact.
The Cloud verification outage fixes from upstream `d513747` are integrated;
the event branch retains version `v0.6.1` rather than the main patch label.

## Integrated Cloud fallback patch

Upstream `3b8d4fa` (bug fix 5) is integrated without changing the event's
`v0.6.1` label. Vite reads `currentInternalVersion()` rather than a separate
hard-coded label. `release:check` supports both the release label and fixN labels.
No deployment is implied by a successful local build or a pushed branch.

Transient Cloud outages may use normal local rolls automatically. The allowlist
in `allowsLocalFallback` accepts actual numeric HTTP 0 or 500–599 only. Server
restrictions, account changes, insecure requests and cooldown decisions must not
activate the fallback. Outage marks are account/profile scoped, defensively
parsed, and written only after the replacement roll is saved. Retire the old
Cloud request ID only after that local commit; failed saves retain their retry ID.

Recovery probes stop at 40 attempts. A fresh validated status check (including
on reload or explicit retry) can heal an exhausted session. Failed HTTP responses
and unknown security states cannot mark Cloud recovered. Requests have 15-second
fetch timeouts. Late responses from an old account cannot update the active
account's security or commit a draw. Keep the ordinary Cloud-save reconciliation;
never merge two different profiles to hide a conflict.

`tools/render-sim/cloud-fallback-integrity.mjs` covers quota failure, restrictions,
exhausted-budget recovery and the actual hook timer boundary. Client tests reject
invalid timing, skills and error-envelope security changes while preserving the
request ID. Live binding/secret availability still needs a production check;
local tests cannot certify it.

## December 1 launch and weekly economy

First Light ends and the RNGmas pass/Frostfall begin on December 1 UTC. RNGmas
ends January 2 UTC; the dev preview stays December 17. Weeks: Golem Smash,
Christmas market, Snowcoin exchange, Gift workshop and Midnight countdown.
The market opens December 8 and the exchange December 15; both stay available
until the event ends, independently of their chapter's expiring aura claim.

One primary settled online roll earns one Snowcoin; Auto-Roll counts, offline
and extra skill results do not. The wallet caps at 1,000,000. Exchange is one-way,
10,000 EP per coin, maximum 200 converted per event. Each market offer grants
boost charges once; three distinct purchases complete the market chapter and
100 converted coins complete the exchange chapter. These two chapters grant
no EP. `snowcoinsEarned`, `snowcoinsExchanged` and distinct `marketPurchases`
are durable reconciliation dimensions; the decreasing wallet is not. Never
merge currencies from different profiles. Retain legacy chapter IDs, counts,
auras and historical rows. Currency and receipts survive resets and reloads.
New `winter-exchange` and `winter-market` history rows are parsed defensively.

An ended maintenance window overrides stale provider flags. While maintenance
is active, the normal draw path commits locally without first requesting a Cloud
roll or activating an outage marker; backup/publishing/deletion remain paused.
Keep account ownership and known server restrictions intact. The render integrity
suite exercises the real status store and progress hook for this path.

## Winter zones and universal Christmas mode

Appearance always exposes Christmas mode under its TEMPORAL group, alongside
available temporary themes. It is a `menuitemcheckbox` with an independent visual
switch, persistent device setting, accessible description and existing menu
keyboard support. It does not change the selected color theme. Decoration is
still event-gated; the preference is configurable outside the event. Never hide
all seasonal scenery at the phone/tablet breakpoint: scale ornaments and keep
snow banks and lights behind the content without intercepting input.

`WinterChapters` renders five native details/summary zones. The current chapter
opens automatically; other chapters can be explored, but only the live chapter
can award its aura. The market and exchange live inside their zones and remain
usable after their chapter ends until January 2. Summaries distinguish collected,
ready, live, upcoming and closed states. The stall passport derives its marks
from existing purchase receipts, not a new stamp currency.

Chapter rewards now use `week.coins`, `week.boost` and `week.charges`: Golem
50 coins + 2 Overdrive; market 15 + 2 Spark; exchange 25 + 2 Surge; workshop
35 + 2 Surge; countdown 50 + 3 Overdrive. Existing auras and EP amounts remain.
Currency/boosts are granted atomically with the completion receipt. Legacy claims
are never replayed for extra bonuses, and parser repairs never mint those bonuses.
No new save fields, odds changes, price discounts on base products or cooldown
changes were introduced. All new scene, expansion and switch motion has a
reduced-motion path. Keep source/release changelog history untouched.

## Launch preparation: festival and Legacy deadline

Christmas mode now shows only its name and the activation switch under TEMPORAL:
a snowflake icon, with no status subtitle or explanatory paragraph. Keep its existing
accessible checkbox state, persistence and responsive decoration behavior.

`src/winter-festival.js` defines three season-long tasks, four explicitly timed
live activities. RNGmas offers eight event auras and five companion skins,
plus three separate pass auras. Historical aura identities stay parseable but
are not offered by new missions or the market. The saved `rngmas.festival` record has bounded roll/
7-containing counters, distinct final digits, task claims and per-live-window
count/digit/claim receipts. Default, parse and compare all dimensions. Main online
settlement updates it once; extra skill/offline rolls never count. The gift drive
is four paid 5-Snowcoin in-game parcels, not a real-world donation. All tasks and
live claims validate their UTC window in the reducer. Market companion-skin offers grant
permanent ownership without boost charges. Preserve all old receipts and resets.

The Legacy shutdown is December 1, 2026 at 00:00 Europe/Madrid, November 30 at
23:00 UTC. `LegacyGate` wraps App only on repository-base builds. At the deadline
it unmounts the game and its status/sync effects; the information/archival backup
utility stays available. Never apply this gate to the root-domain current game.
The countdown uses wall time, not seasonal `gameNow()`. Dev-only
`VITE_LEGACY_PREVIEW_AT` previews before/after; production ignores it. Do not erase
local saves, silently migrate profiles or claim automatic cross-origin import.
See `docs-source/legacy-shutdown.md` for cached-client and deployment limitations.

### Event Tasks and seasonal settings

All season missions, live activities and weekly chapter claims live in
`Tasks → RNGmas`, implemented by `WinterTasks`. The shop only renders calendar,
collection and Snowcoin services; do not duplicate mission claims there.
`?event=rngmas` opens the event tab (hash fragments are canonicalized away).
WinterChapters accepts `showServices={false}` in Tasks; market and exchange stay
in Shop. Content surfaces and disabled event controls are opaque in every theme.

Five permanent winter companion skins share the secure registry in
`winter-companions.js`. Lantern Moth and Parcel Kit have revised artwork; Holly
Corvid and Snow Owl come from Meteor watch and Bell relay. Base companions remain
required to equip, with no stat changes. Existing ownership/receipts stay intact.

Christmas mode is effective only in [December 1, 2026, January 2, 2027) UTC.
SettingsProvider masks the saved preference outside this window and rejects
out-of-season toggle updates; Appearance disables the switch and shows it off.
The shared seasonal hook schedules the exact boundary and refreshes on focus,
so decoration disappears without a reload. Keep stored opt-outs intact.

### Expanded winter village rotation

`winter-rotation.js` defines seven additional gatherings and eight contiguous
four-day commissions. They append to WINTER_LIVE_EVENTS after the original four;
never reorder/reuse those receipt IDs. There are now 11 gatherings and eight
commissions, each calendar covering Dec 1–Jan 2 without gaps or overlap.
`festival.live` stores all bounded counts/ingredient or digit sets/claim receipts;
no daily reset deletes progress. The kitchen maps final digit modulo four to
Sugar/Spice/Cocoa/Ginger. Adjacent pairs use unpadded decimal strings; zero is
not a repeated pair. Only primary settled online rolls progress these rules.
All new windows award banked boosts and Snowcoins once, no automatic activation.
The gift drive now refunds 10 of the 20 donated Snowcoins when claimed.

`winter-village.css` adds opaque evergreen/cranberry/brass surfaces, warm string
lights, swaying reward ornaments, stamped ingredient slots and ready-state trim.
All new motion has a reduced-motion override. `winterReadyCount` drives Tasks
and its global ready indicator and excludes expired claims. Full calendars are
opt-in; Now & next shows current plus the next window. Keep missions in Tasks.

Market Surge/Overdrive triples now cost 40/55; `legacyPrice` preserves old 60/90
history receipts without refunding or enabling another purchase. Historical
receipt coin amounts and cosmetic IDs must not be silently rewritten.
Run `npm run audit:winter` for deterministic 2,000-player-per-activity demand
samples, calendar coverage and hard bonus-budget assertions. Added windows cap
at 128 Snowcoins, 13 Spark charges and 2 Surge charges over the entire season.
No new cosmetic IDs, scoring/odds/cooldown changes or unlimited farms.

### November 28 release preparation

Read `docs-source/november-28-readiness.md`. Release day is Nov 28; the event still
opens Dec 1 00:00 UTC, an hour after the Legacy mirror's Madrid-midnight closure.
Tasks and Shop expose read-only previews in the announcement period; claims and
Christmas mode remain season-gated. `WinterEventHeader`, `WinterEventGuide` and
`WinterCountdown` unify the announcement/modal/Tasks/Shop presentation; winter
pass and RNGmas aura previews use the same `.winter-event` visual contract.
Countdowns tick in leaves only, have no per-second aria-live announcements and
reject invalid target times without crashing the page. `nextRngmasBoundary`
wakes both seasonal status and the global game clock at daily and 18:00 handovers.
Default Advent/chapter action timestamps use `gameNow`, like other event actions.

Starter calendar EP is now 10k/12.5k/15k/17.5k/20k/22.5k for doors 1–6; total
calendar EP is 1,547,500. The 37,500 increase cannot be claimed again from an old
receipt and does not pay into cycle-earned EP. Source-labelled collection cards
clarify exact acquisition windows and base-companion requirements. Preserve all
old earned amounts, cosmetic IDs, receipts and opt-outs. Firestore's 25-pin rules
still need an explicit operator deployment; tests do not imply it happened.
