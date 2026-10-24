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
- **The save has a compressed second copy.** `src/save-vault.js` keeps
  `SAVE_VAULT_KEY` (`rng-infinite-progress-vault-v1`) holding
  `{at, raw: "rngvault1:<base64 gzip>"}`. `use-progress.js` writes it after a
  healthy save and after a healthy load (at most once per minute) and drops it
  when the account is deleted; `restoreVaultIfNeeded()` in `main.jsx` runs
  before React mounts and only steps in when the canonical save is missing or
  unreadable, then toasts the recovery. Settings shows the copy and can restore
  it by hand. Never let this path resurrect a deleted account: a profile-less
  save is deleted, not restored, and the vault is cleared with the account.
- **Everything is UTC.** Daily and weekly task periods, event boundaries and
  every date shown in the UI use UTC (`Date.UTC`, `getUTC*`, `timeZone: "UTC"`).
  Never use local-date getters for anything a player can see or that gates a
  reward.
- **A timer that shows seconds reads the verified clock itself.** `now` from a
  render is only renewed every 30 s (`useSeasonClock`), so a countdown that just
  subtracts it looks frozen or stutters. `components/RngweenFinale.jsx` and
  `useHourlyDisplayClock()` call `seasonNow()` on every tick and fall back to
  the render's `now` while the website clock has not answered. Minute-granular
  labels may use the render value.
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
  Prestige and Rollback both send the rebirth ladder back to 0 (its skills and
  +2% per rung are climbed again), and a Rollback also sends the prestiges
  back to 0 with their +10% each: the next Rollback needs the ladder and three
  prestiges again. Only Rollback bonuses and the surplus bank survive every
  reset. Badge gates must stay reachable: about 70 of the 235 badges are exact
  numbers, so a cycle tops out near 70% of the collection. Rollback asks for
  65%, prestige for 50%.
- **Fresh start** (`fresh-start` action, `src/components/FreshStart.jsx`) is
  offered once an account has three prestiges. The dialog opens by itself once
  per profile (a localStorage flag), then lives behind the "!" in the header.
  It keeps the profile and every aura, and resets everything else, including
  rebirths, prestiges and Rollbacks; a `fresh-start` history row keeps the old
  figures and counts as a cycle marker.
- **RNGween World** layout: compact heading, a four-step phase strip, the
  stage (scene, number, roll button) always on screen, then four tabs under it:
  Objectives (collection, aura trial, default), Key & prize, Commissions,
  Record. Tests that need the key forge switch to its tab first. Under the
  title a `.world-next-step` box (`data-world-next-step`) names the single
  thing to do next (profile → four fragments → forge → Valley → keep rolling); keep
  it to one sentence and one button.
- **Profile share links** (`src/profile-card.js`): the `?card=` token is the
  card line deflated behind a `z1` tag (base64url, URL-safe). The line itself
  is a base36 field string (format v3: the last field carries the profile
  logo, shrunk to link size first). Uncompressed v2/v3 lines and v1 JSON
  tokens still decode — their base64url always begins A–f, so `z1` never
  collides. Bump `CARD_VERSION` and add to `KNOWN_VERSIONS` when the field
  shape changes, never reuse a field position.
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
- **Profile address**: `/profile/<username>` (`pathForProfile`,
  `profileNameFromLocation` in `src/router.js`). Any `/profile/<name>` opens
  the profile page and `main.jsx` rewrites the address to the signed-in
  account's name (bare `/profile` for guests). Bookmarks cap at
  `BOOKMARK_LIMIT` (history-log.js). The logo is uploaded by clicking the
  picture itself; there is no separate upload button.
- **RNGween World tabs**: Objectives, Key & prize, Commissions. The Rules tab
  is gone; the fine print is one line under the panel. Commissions is a
  locked, disabled tab outside the Reaper's dealing windows and says when it
  reopens.
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
- **Bookmarks** are capped at 10 (`BOOKMARK_LIMIT` in `history-log.js`), for
  everyone, from the start: no purchase, upgrade or rebirth changes it. The
  "Bookmarks (n/10)" chip, the profile card and the tests read that constant.
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
- **The board is `open` for the whole event but `active` only in the two
  windows.** `hourlyView()` returns both: `open` keeps the page mounted,
  `active` deals, credits and pays. Between them (`hourlyWindow === null`,
  Oct 25–31) the board shows one paused card, `recordRngweenHourly` is a no-op
  and `claimRngweenHourly` throws instead of paying an expired hour.
- **Unspent Pumpkoins are not lost at the end.** `retireRngweenLimited` converts
  them with `farewellEP()` at `FAREWELL_EP_PER_PUMPKOIN` (100 EP per coin, a
  hundredth of what they cost) capped at `FAREWELL_MAX_EP` (100 000 EP), pays it
  into `balance`/`totalEarned` and writes one `rngween-farewell` row. The
  retirement itself is the receipt: a retired save has no coins left, so it can
  never pay twice. `main.jsx` toasts the amount once when the calendar closes.
- **Halloween night (Oct 31, 00:00–24:00 UTC) is the event's peak**:
  `rngweenCalendar(at).finaleActive` is true for that day only and
  `pumpkoinMultiplier` is 2, so every aura mission pays double (the history row
  keeps the paid amount plus `multiplier: 2`). `components/RngweenFinale.jsx`
  draws a sticky strip above the content with the countdown and the ×2 badge;
  it never covers the header, and it disappears on November 1.
- **Taking part on the 31st earns `RNGWEEN_FINALE_SKIN` ("Hollow Lantern",
  `hollow-lantern`)**, a permanent `eventOnly` skin: any mission claim, World
  rollout or commission claim sets `rngweenLimited.finaleCount`, and the strip's
  button dispatches `claim-rngween-finale` (`claimRngweenFinale`). The receipt is
  `{id: "rngween-finale:rngween-2026", type: "rngween-finale"}` plus
  `finaleEarned` and the aura in `owned`. Both fields are repaired from
  ownership, carried through `retireRngweenLimited`, and only written when true,
  so a retired save stays small. Never make the skin missable by a save repair.
- The Reaper (`src/rngween-reaper.js`, `components/ReaperDialog.jsx`) is a
  short scripted dialogue with button choices only. There is no free-text
  input; keep his lines to one or two sentences with a bit of dry humour.
- Event state lives in two save slots: `tasks.rngween` (the four aura missions)
  and `rngweenLimited` (Pumpkoins, purchases, hourly board, World). Both are
  parsed defensively; foreign IDs and over-cap counts are repaired to zero.
- Event auras are `eventOnly`: never in the EP catalogue, never a random drop,
  and only owned ones appear in the wardrobe. They survive Rebirth, Prestige and
  Rollback like every other owned aura.
- **Auras are bought only while their missions are closed**:
  `rngweenCalendar(at).aurasBuyable` is true Oct 21–24 and Nov 1–3 and false
  through the Oct 25–31 trials, when the mission is the only way in. The
  limited shelf shows the "tasks are running" lock and `buy-rngween-limited`
  refuses an aura in that window.
- **The event has its own page**: `/tasks` is Main (daily and weekly lists) and
  `/tasks/rngween` holds everything the event adds (aura missions, hourly
  commissions, the World door). `TASK_SECTIONS` in `src/router.js` owns the two
  slugs; the switch at the top of Tasks is the only way between them, and both
  addresses survive a reload. After November 4 the event page redirects to
  Main. Specs that need the missions or the commissions open
  `/tasks/rngween`, not `/tasks`.
- The event page follows the calendar: it opens on the aura missions during
  Oct 25–31 and on the commissions in the two open windows, until the player
  picks a tab. Between the windows the commission board says it is paused
  rather than dealing empty cards (see `hourlyView().open` / `.active`).
- World rolls pay no ordinary EP, charges, drops or task credit. Pending World
  outcomes are committed to the save before the animation starts.
- World rolls never pay Pumpkoins. The World shop (reveal upgrades, 200 / 500 /
  1,000) is paid with **World points**: `worldPointsTotal` adds the badge points
  of all five zones and `world.spent` records what the shop took, so
  `worldPointsAvailable = total − spent`. Zone scores are never reduced; the
  Record and collections keep showing them. `spent` is clamped to the total on
  load. Purchase rows carry `points`, not `pumpkoins`, and `rngweenRecord`
  leaves them out of the Pumpkoin ledger. Tests grant points with
  `withWorldPoints()` (`tests/helpers/world-roll.js`).
- **Zones open in path order** (`worldZoneOpen`): each of the first four needs
  the previous zone's fragment, the Valley needs the key as before. A zone with
  rounds already played (or a pending roll) stays open, so older saves lose
  nothing. The reducer refuses rolls in a shut zone ("Earn the … key fragment
  first."); the page shows a lock panel with a "Go to …" button. Hourly
  "new places" only count open zones. Tests start further along the path with
  `withWorldPath(progress, zone)` / `openWorldPath(page, zone)`
  (`tests/helpers/world-roll.js`); `withAllFragments` marks all four.
- **World points → Pumpkoins / EP** (`WORLD_POINT_EXCHANGE`, action
  `exchange-world-points`): 500 points buy 2 Pumpkoins or 10,000 EP, one
  block per click in the World shop, deliberately small (a whole World run is
  a few thousand points). The trade is taken
  from `world.spent` like the upgrades, so zone records, badges and the Record
  never change; EP also raises `totalEarned` so the wallet survives the load
  check. History row `rngween-world-exchange` (`points` + `pumpkoins` or `ep`)
  counts as Pumpkoin income in `rngweenRecord`.
- **Aura missions have a World half**: each mission carries `zone`/`zoneName`
  (Jack-o'-Glow ↔ Pumpkin Patch, Phantom Veil ↔ Graveyard, Blood Moon ↔ Blood
  Moon Ridge, Witchfire ↔ Haunted House) and is only complete / claimable when
  the Roll-page count is met **and** that zone's key fragment exists
  (`missionWorldDone`). `rngweenState` and `claimRngweenAura` take the
  `rngweenLimited` slot as their last argument. Already collected auras never
  need the fragment again, so nothing already claimed is revoked.
- The World opening (`WorldIntro.jsx`, ~15 s, four scenes, skippable, static
  under reduced motion) plays on the first World visit per device
  (`RNGWEEN_WORLD_INTRO_KEY`) and can be replayed from the stage footer. The
  home gate goes straight into the World once the device has been inside
  (`RNGWEEN_WORLD_ENTERED_KEY`) or the save has World rounds; the Reaper stays a
  secondary button. `seedProgress` marks both openings seen unless
  `introSeen: false`.
- The World always renders on the dark theme (`main.jsx` theme effect checks
  `page === "rngween-world"`); the saved `rng-theme` is never touched.
- The Halloween tab icon is not the shell's alone: `useSeasonFavicon()`
  (`src/use-season-favicon.js`) swaps the `link[rel="icon"]` for the decorated
  window and puts it back, and both `RngweenSeason` and `RngweenWorld` call it
  so the World wears it too.
- Economy knobs: `EP_PER_PUMPKOIN` is 10,000; Pumpkoins come only from hourly
  commissions, the four aura missions and the exchange, and buy the Limited
  Shop and the 2,000 shortcut key. The aura missions ask for 300 rolls, 60
  Rare+, 8,000,000 banked EP and 21 task claims (Daily lists hold three a day,
  so 21 is one full week). Exchange receipts in history only need to be a whole
  multiple of their coin count, so a rate change never drops old rows.
- World layout (`src/rngween-world-zones.js`, `src/rngween-world-badges.js`):
  five zones in path order, Pumpkin Patch (1–9), Graveyard (1–99), Blood Moon
  Ridge (1–666), Haunted House (1–999) and Valley of Horrors (1–9999, no
  repeats). The first four are `WORLD_FRAGMENT_ZONES`; each has 12 badges and
  three objectives that award its key fragment, and the free forge needs all
  four (`worldFragmentsComplete`). Objectives are tuned so a zone takes about
  10–30 rolls (see the sim in the round notes), never hundreds. Legacy staged
  minigame fields (`games`, `WORLD_LEGACY_STAGES`) only exist for Graveyard and
  Haunted House; use `legacyGame(zone)`, not `zone.fragment`, to detect them.
- The dev previews (`dev:rngween*`, `tools/sandbox-*.mjs`) are `apply: "serve"`
  Vite plugins. Nothing from them reaches a production build; keep it so.
- **Event attendance (`progress.events`).** An account that opens the game
  while an event is on is stamped once: `events[eventId] = { at }`, where
  `eventId` is in `KNOWN_EVENTS` (`src/progress.js`, currently `rngween-2026`)
  and `at` is the verified website time (`Math.round(seasonalNow)`). The
  reducer action is `attend-event`; `src/main.jsx` dispatches it when
  `limitedPhase === "active"`, the account has a profile and the stamp is
  missing. It is an account record, not run state: Rebirth, Prestige, Rollback
  and Fresh start keep it (Fresh start copies it explicitly), `parseEvents`
  drops unknown ids and bad times, guests never get one, and only deleting the
  account removes it. Nothing in the UI shows it yet. **Planned:** rewards for
  having attended events will read this field, so never reset or rewrite it,
  and add new events to `KNOWN_EVENTS` rather than inventing another slot.
  Tests: `tests/event-attendance.spec.js`; tests that compare a whole save
  before/after during the event must wait for the stamp first.
- **Cleanup.** The code is marked with `CLEANUP Nov 1/Nov 4, 2026` comments.
  After November 4 remove the seasonal UI, shop, World and the season clock, but
  keep the aura registry, art, receipts and the save parsing so collected
  cosmetics still restore.

### What ends on November 4 (verified) and the cleanup release

Checked with the website clock set to Nov 3 23:59, Nov 4 00:01 and Nov 20 UTC
on a save that owns everything: the home page loses the Reaper gate, the
decorations and the Halloween Appearance option; `/rngween-world` redirects
home; `/shop` lists no Limited shelf and `/shop/limited` by direct URL shows
only the farewell card ("The lanterns have gone out"); `/tasks` shows no
missions or commissions; the first signed-in load after the end runs
`retire-rngween-limited`, which removes Pumpkoins, the pumpkin familiar, the
event skill/signature and the World, and keeps owned auras, Hexbound and
`events` attendance. Nothing is paid or granted after `limitedEndsAt`.

The code that then becomes dead is marked in place. Every event-only file or
block carries `CLEANUP Nov 4, 2026:` with what to remove; everything that must
survive the event carries `KEEP after Nov 4, 2026:`. The cleanup release is:

1. `grep -rn "CLEANUP Nov 4, 2026" src` — delete the files whose header says
   "delete this file", then remove the marked blocks in shared files
   (`main.jsx`, `progress.js`, `use-progress.js`, `router.js`, `Shop.jsx`,
   `Tasks.jsx`, `AppearanceMenu.jsx`, `shop-data.js`, `skills.js`, `pets.js`,
   `tasks.js`, `settings.js`, the CSS files).
2. `grep -rn "KEEP after Nov 4, 2026" src` — do not touch: `RngweenAura.jsx`,
   `rngween-auras.css`, the wardrobe, the `rngween-*` history row rendering
   and tally skips, the changelog entry, Hexbound, `events` attendance.
3. Keep `parseRngweenLimited` able to read a retired slot (`{id, auras,
skinEarned, retired: true}`) and `parseRngween` able to drop the
   `tasks.rngween` slot; both exist in real saves forever.
4. Delete `tests/rngween-*.spec.js`, `tests/halloween-*.spec.js`,
   `tests/sandbox-clock.spec.js` and `tools/rngween-preview-data.mjs`,
   `tools/sandbox-*.mjs`; keep the aura-ownership and history tests that moved
   elsewhere. Then `npm run pages:publish`.

## Device linking (`src/sync.js`)

- Two transports. In development (and anywhere a relay is configured) the link
  goes through the relay: a memory-only or on-disk store that holds the latest
  save blob. On a static host (GitHub Pages) there is no relay, so the devices
  use PeerJS over WebRTC; a public broker only does the handshake.
- The device that created the link is the **main** device (slot `a`). It dials;
  the other device (`b`) listens. While both are connected, actions started on
  `b` are sent to `a` to run once.
- Linking is a choice about **whose account survives**, and every transport asks
  the same question through `syncDecision` in `src/sync-policy.js` — the peer
  `reconcile` and the relay's `relayApplyLatest` both call it. A profile beats a
  guest; otherwise a save that carries clearly more of the game
  (`progressWeight`, 50% and at least 40 points ahead) is the primary, and the
  other device adopts it whole. Never decide this by timestamp alone: a browser
  opened once must not wipe a played save because its last write is newer. Two
  devices of the *same* account keep the timestamp order, so a queued change
  from either one is never refused. The primary is also declared the **writer**
  (`declareSyncOwner`), so the save that is kept and the device that runs
  actions are always the same one.
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
- The peer id is built from the room only, so the broker (and anyone who can
  guess or observe an id) knows the room but never the key. Every WebRTC frame
  therefore carries `key` (`sendPeerMessage` adds it) and the receiver closes
  the channel on the first frame whose key does not match, before any state or
  hello is processed. The relay path checks the key in its URL instead.
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
- **Always commit & push.** Do not leave changes uncommitted or unpushed until
  the user explicitly says otherwise.
- **Do not open a PR until the user asks for one.** When they do, open a pull
  request from the session branch to `main` with all the changes summarized
  (or the changelog entry, if there is one).
- `main` must be merged with **Squash and Merge**, and the merge commit title
  must be `RNGdle Infinite: 0.x(.x)` (for example `RNGdle Infinite: 0.5.1`),
  matching the release version.
- `node_modules/`, `dist/`, `test-results/`, `playwright-report/` and `.cache/`
  are ignored. Do not commit them.
- Use `gh` for pull requests and checks.

### Internal version (Reload until updated)

`src/app-update.js` defines `APP_INTERNAL_VERSION`, for example
`RNGdle-Infinitev0.5.1fix3`. It is only used by the "Reload until updated"
flow, to scope the update intent to the current internal build. It is never
added to the changelog or shown as a release. Bump the fix number for
bug-patch rebuilds of the same public version (`fix0 → fix1 → fix2 …`)
instead of moving the public `0.x(.x)` version. Current:
`RNGdle-Infinitev0.5.1fix3`.

What the flow is allowed to touch, because the save outranks everything else:

- It works like clearing the browser cache, never like clearing site data.
  `clearGameCaches()` drops every Cache Storage entry and refreshes the
  service-worker registrations, and the reload always uses a unique
  `__rngdle_refresh` address so the document itself cannot come from a cache.
  `localStorage` is only read — no key is removed, rewritten or cleared.
- Before every reload, `snapshotSaveForUpdate()` copies the exact save bytes
  to `sessionStorage`. `recoverSaveAfterUpdate()` runs in `main.jsx` before
  React mounts: a copy is used only when the stored save is missing or is not
  JSON, and it is dropped on every load, so it can never resurrect a deleted
  account.
- `decideUpdateStep()` is the whole policy (done / wait / reload / stuck) and
  is tested without a browser. The loop gives up after
  `APP_UPDATE_MAX_RELOADS` reloads instead of reloading forever.
- `tests/app-update.spec.js` covers the decisions, the save copy and the
  cache-invalidation run; keep that spec green before shipping a build.

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
- Notifications (`.toast`) stack in the **top-right corner** (`src/toasts.css`,
  `top: 68px; right: 20px`), never in the middle of the screen, and slide in
  from the right. On phones they clear the safe area.
- Icons come from `game-icons.jsx` or Lucide. The favicon and app icons are a
  flat "RNG / DLE" wordmark on the dark background (`public/favicon.svg`,
  `public/icon-*.png`, `public/apple-touch-icon.png`); regenerate the PNGs when
  the SVG changes.
