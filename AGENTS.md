# AGENTS.md

Context for coding agents working on RNGdle Infinite. Read this before you
change anything. The player-facing overview is in `README.md`.

## What this project is

A React + Vite browser game. The player rolls a uniformly random whole number
from 0 to 1,000,000, scores EP from its digit patterns (badges), and spends EP on
companions, skills, tasks, rebirths and prestige. It is an independent
recreation of RNGdle; the scoring and rank data come from RNGdle Tools.

There is no backend. The game runs in the browser and saves to `localStorage`.
GitHub Pages serves the prebuilt `docs/` folder; there is no server code in
production, which shapes most decisions below (device linking is peer-to-peer,
calendar events verify the date against the website's own HTTP headers, and so
on).

## How the game is put together

- **One reducer owns the save.** `applyProgress(state, action)` in
  `src/progress.js` is the only way the save changes. Every button in the UI
  dispatches an action (`buy`, `equip-pet`, `claim-task`, `rebirth`,
  `rngween-world-reveal`…); the reducer validates it, throws a readable
  `Error` for the toast when it is not allowed, and returns the next state.
  `src/use-progress.js` wraps that in a React hook, writes to `localStorage`
  and broadcasts the new save to a linked device. New features add actions
  there rather than mutating state in a component.
- **A roll is a two-step commitment.** The UI asks the worker for a number, the
  reducer stores it as `pendingRoll` with its reveal time _before_ anything is
  animated, and `complete` settles it afterwards. A reload during the reveal
  therefore resumes the same number; nothing can be re-rolled by refreshing.
  World rolls follow the same pattern with `rngweenLimited.world.pending`.
- **Scoring is data, not code.** Badge values and ranks come from the prepared
  tables in `public/data/` (built by `tools/prepare-game-data.mjs` from RNGdle
  Tools). `src/roll.worker.js` loads them and scores off the UI thread. Do not
  hand-edit numbers in those tables.
- **Save repair instead of save loss.** `parseAndRepairProgress` accepts any
  JSON, fixes what it can, keeps a pre-repair backup under
  `PRE_REPAIR_BACKUP_KEY` and lists the repairs it made so the UI can tell the
  player. Receipts (`receipts`, task claims, mission `earned` lists) are the
  source of truth for restoring ownership. When you add a field to the save,
  add it to `emptyProgress()`, parse it defensively, and write a spec that
  feeds it garbage.
- **Everything is UTC.** Daily and weekly task periods, event boundaries and
  every date shown in the UI use UTC (`Date.UTC`, `getUTC*`, `timeZone: "UTC"`).
  Never use local-date getters for anything a player can see or that gates a
  reward.
- **Time has three clocks.** `gameNow()` (`src/game-clock.js`) paces reveals,
  cooldowns and tasks and can be driven by Playwright's fake clock.
  `seasonNow()` (`src/season-clock.js`) is the verified website date used only
  by calendar events and is `null` until verified. `Date.now()` is for
  timestamps that nothing is gated on. Never gate a reward on the device date.
- **Pages are client routes.** `src/router.js` maps `/shop/auras/...`,
  `/tasks`, `/rngween-world/`… to pages. The build copies `index.html` to
  `404.html` (and to `rngween-world/index.html`) so deep links work on Pages.

## Map of the repo

| Path                                      | What lives there                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `src/main.jsx`                            | The app shell: routes, roll screen wiring, device-link start-up.                |
| `src/roll.worker.js`                      | Roll and scoring in a worker. Keep the RNG and scoring out of the UI thread.    |
| `src/random.js`                           | The random source. Do not replace it with `Math.random` for rolls.              |
| `src/badges.js`, `src/infinite-badges.js` | Badge definitions, families, EP values.                                         |
| `src/pets.js`                             | Companions: prices, bonuses, skills.                                            |
| `src/rack.js`, `src/draw-plan.js`         | Skill rack and how draw skills plan their draws.                                |
| `src/rebirth.js`                          | Rebirth ladder, prestige, Rollback.                                             |
| `src/progress.js`                         | Save format, migrations, and the `PROGRESS_KEY` storage key.                    |
| `src/rngween*.js`, `src/season-clock.js`  | RNGween 2026: calendar, tasks, limited shop, World. See the event section.      |
| `src/sync.js`                             | Device linking (relay or PeerJS/WebRTC), heartbeat, reconnects.                 |
| `src/tasks.js`, `src/history-tally.js`    | Daily/weekly tasks and the per-roll tally that feeds them.                      |
| `src/offline.js`                          | Offline roll batches and their replay protection.                               |
| `src/shop-data.js`                        | Every product, shelf and aura family. The shop UI reads this; it owns nothing.  |
| `src/settings.js`                         | Presentation and convenience settings (never odds, prices or timings).          |
| `src/changelog.js`                        | Release notes shown in-game; also the "unseen version" marker.                  |
| `src/components/`                         | Shared UI components and game icons (`game-icons.jsx` is the hand-drawn set).   |
| `src/*.css`                               | One stylesheet per area. Mobile rules live at the bottom of each file.          |
| `src/data/`                               | Prepared game data (`README.md` there has provenance and the pinned source).    |
| `tests/`                                  | Playwright specs. `tests/helpers/` has the shared seeding and clock helpers.    |
| `tools/`                                  | Node scripts: relay, Pages publishing, data preparation, screenshots, audits.   |
| `vite.config.js`                          | Dev server. Serves the device-sync relay at `/__sync/*` in development.         |
| `docs/`                                   | Built site for GitHub Pages. **Generated. Do not edit by hand.**                |
| `media/`                                  | README screenshots, generated from the running game by `tools/screenshots.mjs`. |

## Commands

```sh
npm install
npm run dev              # dev server on 0.0.0.0:5173, relay included
npm run dev:rngween      # same, with the season clock pinned to 2026-10-26 (event live)
npm run dev:rngween:unlocked -- --port 5176   # plus a seeded save with every event reward
RNGDLE_SANDBOX_DATE=2026-10-22T12:00:00Z npm run dev:rngween   # any other date (hourly tasks here)
RNGDLE_SANDBOX_PRESTIGES=3 npm run dev:rngween:unlocked   # seeded save with 3 prestiges (fresh-start offer)
npm test                 # full Playwright suite (starts `npm run dev` itself)
npx playwright test tests/roll.spec.js   # one spec
npm run build            # production build into dist/
npm run pages:publish    # rebuild docs/ (run after changes that ship to Pages)
npm run test:pages       # checks on the committed docs/
npm run audit:economy    # price and roll-distribution audit
npm run format           # prettier over src, tests, root configs, README
```

Chromium: Playwright's own download is often blocked. If you have a Chromium
binary, export `CHROMIUM_PATH=/path/to/chromium` before running tests. Some
sandboxes also need `--no-sandbox`, which `playwright.config.js` already passes
when `CHROMIUM_PATH` is set.

Some specs are slow on purpose (the 45-second reveal and 60-second cooldown).
Set `test.setTimeout` for long flows rather than shortening the game's timers.

## Rules that are not negotiable

These are design decisions the owner has made. Do not change them as a side
effect of other work.

- **Honest roll.** A skill may change how many numbers are drawn or which one is
  kept, but it must never change the scoring table, the badge values or the rank
  of a number. Wallet multipliers only multiply banked EP.
- **Companions never change the roll.** They multiply EP that lands in the
  wallet. Trail and Drift are the only exceptions, and they use their own random
  sample.
- **Rollback** stays hidden until the player has three prestiges. It is hidden,
  not disabled. It starts from 0 EP (no starting bonus) and can be repeated.
- **Fresh start** (`fresh-start` action, `src/components/FreshStart.jsx`) is
  offered once an account has three prestiges. The dialog opens by itself once
  per profile (a localStorage flag), then lives behind the "!" in the header.
  It keeps the profile and every aura, and resets everything else, including
  rebirths, prestiges and Rollbacks; a `fresh-start` history row keeps the old
  figures and counts as a cycle marker.
- **RNGween World** layout: compact heading, a four-step phase strip, the
  stage (scene, number, roll button) always on screen, then four tabs under it:
  Objectives (collection, aura trial, default), Key & prize, Commissions,
  Rules. Tests that need the key forge switch to its tab first.
- **Aura finish**: every aura gets a shared layer (`.box-finish` in
  `src/number-box.css`): a turning two-tone rim and a breathing glow in the
  aura's `swatch` colours, which `NumberBox` passes as `--aura-a`/`--aura-b`.
  Bespoke aura layers stay untouched; new auras only need a `swatch`.
- **Tiers** come from `src/data/game-index.json`, generated by
  `npm run prepare:data` from the floors in `tools/prepare-game-data.mjs`.
  Eight tiers: trash, common, uncommon, rare, epic, anomaly, mythic, godly.
  Adding one touches the floor in the tool, `src/number-box-palettes.css`,
  the rarity variables in `src/styles.css` and `src/roll.css`, the tier lists
  in `src/progress.js`, `src/history-tally.js`, `NumberBox`, `ActivityFeed`,
  `AuraWardrobe`, `Shop`, `chip-motion.js`, `profile-stats.js`,
  `roll-data.js`, and the pinned lists in `tests/number-box.spec.js`,
  `tests/settings-notifications.spec.js` and `tests/pace-economy.spec.js`.
- **Profile record** (`src/profile-stats.js`): `accountStats` is the full
  figure set (kept for tests and other pages); the profile page and the PNG
  card show a short cut of it plus `profileHighlights` (best roll, pinned
  rolls resolved from `bookmarks`, equipped aura and companion). The card is
  painted at 2× (`EXPORT_CARD_SIZE`) with the dark number-box palette copied
  into `CARD_TIERS`; keep those colours in step with
  `src/number-box-palettes.css`.
- **Déjà vu** (`src/deja-vu.js`): a roll whose exact number already sits in
  the history wears the "Exactnium" Box Lab look (`data-deja-vu` on
  `NumberBox`, CSS at the end of `src/number-box.css`) and a one-line note
  under the rank. It is purely cosmetic: no EP, multiplier, badge or tier
  change, and it is computed from the history at render time, never stored.
- **Running the suite without a system Chromium**: `playwright.config.js`
  honours `CHROMIUM_PATH`. In a sandbox with no browser download, the
  `@sparticuz/chromium` npm package plus NSPR built from source and the NSS
  libs from `chrome-aws-lambda`'s `aws.tar.br` give a working binary; run it
  with `--no-sandbox --no-zygote --disable-gpu` (not `--single-process`, which
  crashes multi-page tests).
- **Task metrics**: besides the original eleven, rolls also count `anomaly`,
  `trash`, `high` (≥ 900,000), `low` (≤ 10,000), `low1k` (≤ 1,000) and
  `badges` (every badge on every paid number). Missing metrics in old saves
  parse as 0. The Tasks page never states the size of a pool; tests pin the
  pool sizes (`tests/task-list.spec.js`, `tests/tasks.spec.js`), so update
  both when adding tasks.
- **Bookmarks** are capped at 3. The README, the "Bookmarks (n/3)" chip and the
  tests all state that cap.
- **Companion signatures** ("firmas") take a slot on the rack, like any other
  circle.
- **Logos.** The favicon and the mobile app icon are a flat wordmark derived
  from the original RNGdle look. The in-game logo is the original header
  wordmark; do not invent a new brand mark.
- **Stored numbers.** Every number saved from one roll pays the wallet skill
  multipliers, not only the last one.
- **Presentation settings** never change odds, EP, prices or timings.
- **Offline.** Offline rolls pay EP and go into history. Skill charging is
  online-only.

If a request seems to conflict with one of these, stop and ask instead of
guessing.

## Economy and content: where the numbers live

- Companion prices and multipliers: `src/pets.js`. Skill definitions and the
  stall rotation: `src/skills.js` and `src/rack.js`. Rebirth rungs, prestige and
  rollback thresholds: `src/rebirth.js`. Shop products and timing upgrades:
  `src/shop-data.js`. Task goals and payouts: `src/tasks.js`.
- `npm run audit:economy` prints price ladders and a roll-distribution sample.
  Run it after touching any of the files above and sanity-check that nothing is
  free, nothing is unreachable, and the ladder still climbs.
- Badge names, families and EP come from `src/badges.js` and
  `src/infinite-badges.js`; artwork is Twemoji vendored by
  `tools/vendor-emoji.mjs`. Adding a badge means adding its glyph there too.
- Player-facing numbers are formatted with `formatEP` (`src/roll-data.js`) and
  `toLocaleString("en-US")`; the game is English-only, so never let a browser
  locale leak into copy.

## RNGween 2026 (seasonal, October 21 – November 4 UTC)

- Every boundary is a fixed `Date.UTC(...)` in `src/rngween.js`. Nothing
  seasonal reads the device clock: `src/season-clock.js` verifies the date with
  a same-origin `HEAD` request and `seasonNow()` returns `null` until it has.
  `null` means "unavailable", never "active".
- Hourly commissions (`src/rngween-hourly.js`): a finished slot is marked
  `completedAt` and waits for `claim-rngween-hourly`. Claiming pays Pumpkoins,
  writes one history row and deals a replacement that keeps the old slot's
  `expiresAt`. An unclaimed slot expires with its hour; nothing is paid
  automatically.
- The Reaper (`src/rngween-reaper.js`, `components/ReaperDialog.jsx`) is a
  short scripted dialogue with button choices only. There is no free-text
  input; keep his lines to one or two sentences with a bit of dry humour.
- Event state lives in two save slots: `tasks.rngween` (the four aura missions)
  and `rngweenLimited` (Pumpkoins, purchases, hourly board, World). Both are
  parsed defensively; foreign IDs and over-cap counts are repaired to zero.
- Event auras are `eventOnly`: never in the EP catalogue, never a random drop,
  and only owned ones appear in the wardrobe. They survive Rebirth, Prestige and
  Rollback like every other owned aura.
- World rolls pay no ordinary EP, charges, drops or task credit. Pending World
  outcomes are committed to the save before the animation starts.
- The dev previews (`dev:rngween*`, `tools/sandbox-*.mjs`) are `apply: "serve"`
  Vite plugins. Nothing from them reaches a production build; keep it so.
- **Cleanup.** The code is marked with `CLEANUP Nov 1/Nov 4, 2026` comments.
  After November 4 remove the seasonal UI, shop, World and the season clock, but
  keep the aura registry, art, receipts and the save parsing so collected
  cosmetics still restore.

## Device linking (`src/sync.js`)

- Two transports. In development (and anywhere a relay is configured) the link
  goes through the relay: a memory-only or on-disk store that holds the latest
  save blob. On a static host (GitHub Pages) there is no relay, so the devices
  use PeerJS over WebRTC; a public broker only does the handshake.
- The device that created the link is the **main** device (slot `a`). It dials;
  the other device (`b`) listens. While both are connected, actions started on
  `b` are sent to `a` to run once.
- The PeerJS broker can be overridden with the localStorage key
  `rng-infinite-peer-broker` (`{host, port, path, secure}`). The WebRTC spec uses
  this to run a local `peer` server on port 9000. Port 9123 is blocked by
  Chromium (`ERR_UNSAFE_PORT`), so do not use it. Dev-only relay URLs can be
  overridden with `rng-infinite-sync-endpoint-v1`.
- Timers: heartbeat 3 s, pong timeout 12 s, reconnect backoff starting at 1 s
  and capped at 30 s. A regained network, a focused window or a visible tab
  retries at once (`retryPeerNow`) and, if the channel is still open, sends one
  immediate probe ping with a fresh grace period (`probeConnection`).
- Phones freeze timers in the background. The heartbeat notices a tick that
  arrives more than 9 s late and resets the pong deadline before judging the
  link, so a healthy channel is never dropped for a silence the browser caused.
- Outbox semantics: `broadcastSync` marks the save `pending` and keeps
  re-sending it on every heartbeat until the other side answers with a
  `state-ack` whose id matches. A `state` message without an `id` is never
  acknowledged; always send through `sendPeerState()`.
- Receiving a save is vetoable: `use-progress.js` must set
  `event.progressSaved = true` on the `SYNC_EVENT` or the sender retries later
  instead of acknowledging. That protects a device whose storage is full or
  whose save is mid-repair.
- The save never has to pass through the broker. Keep it that way.
- `tests/device-link.spec.js` covers the relay path; `device-link-webrtc.spec.js`
  needs a local `peer` server and is the one to run after touching reconnects.

## Tests: notes that save time

- `tests/helpers/progress.js` seeds the save. Use it instead of hand-writing
  `localStorage` for `PROGRESS_KEY`. `tests/helpers/season-clock.js` pins the
  verified season date for event specs.
- The changelog has a house style enforced by `tests/pets-changelog.spec.js`:
  one finished sentence per line, lowercase opening unless it starts with a name
  or a figure, at most 140 characters and 8 lines per release.
- A page that reads `?sync=` does so in an effect after mount. Wait for the
  stored link before navigating away, or the join races the navigation.
- `tests/device-link-webrtc.spec.js` needs the `peer` dev dependency. Keep that
  dependency in `devDependencies`.
- Timing-sensitive specs (`roll`, `auto-originals`) can be flaky under heavy
  parallel load. Re-run them alone before you assume a regression.
- Many specs assert copy verbatim (button names, headings, README section
  titles, changelog style). When you reword something, grep `tests/` for the
  old string before you run the suite.
- Commissions pay on a manual claim (`claim-rngween-hourly`). Specs that
  finish a commission must claim it (`claimDone` / `claimOnPage` in
  `tests/rngween-adventure.spec.js`) before expecting Pumpkoins or a
  replacement slot. The replacement inherits the claimed slot's `expiresAt`,
  so its `startedAt`-to-`expiresAt` span is shorter than an hour by design.
- The fresh-start suggestion opens on load for any profile with three
  prestiges (`tests/fresh-start.spec.js`). Specs seeding such a save must close
  it first or clicks underneath are blocked.
- The Reaper only offers buttons (`REAPER_TOPICS` in `src/rngween-reaper.js`),
  never a text box; assert on those labels and on `reaperDialogue()` lines.
- Pure modules (`rngween*.js`, `tasks.js`, `progress.js`, `sync-policy.js`)
  import cleanly in Node. `node --input-type=module -e "import ..."` is a fast
  way to check data tables and calendar math without a browser.
- Mobile specs use a 390×844 viewport (`tests/mobile-bar.spec.js`). The phone
  breakpoint is 760px; 480px and 420px tighten the header further.

## Publishing

- GitHub Pages serves `docs/` from `main`. After a change that ships, run
  `npm run pages:publish` and commit the regenerated `docs/`.
- `docs/` is built with the base path `/RNGdle-Infinite/`.

## Git and PRs

- Work on the branch the session names, commit with clear messages, and push
  to that same branch. Do not push to `main` directly.
- `node_modules/`, `dist/`, `test-results/`, `playwright-report/` and `.cache/`
  are ignored. Do not commit them.
- Use `gh` for pull requests and checks.

## Style

- Prettier is the formatter. Run `npm run format` on the files you touched.
- Keep code comments short and about why, not what.
- Player-facing copy should be plain and friendly. Avoid jargon in the UI.
- All copy is English. No Spanish in strings, regexes or comments, even for
  matching player input (the Reaper's free-text replies are English-only).
- Write release notes and dialogs the way a person would explain the game to a
  friend: short sentences, one idea each, no feature-list dumps.
- CSS: keep the phone rules next to the desktop rules for the same component,
  use `env(safe-area-inset-*)` for anything pinned to an edge, keep tap targets
  at 40px or more, and prefer `dvh` over `vh` for anything full-height.
- Icons come from `game-icons.jsx` or Lucide. The favicon and app icons are a
  flat "RNG / DLE" wordmark on the dark background (`public/favicon.svg`,
  `public/icon-*.png`, `public/apple-touch-icon.png`); regenerate the PNGs when
  the SVG changes.
