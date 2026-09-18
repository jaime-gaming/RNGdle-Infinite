# RNGdle Infinite

A browser-based RNGdle Infinite game, built with React 19 and Vite. Roll random numbers, discover badges, upgrade your pace, and follow your personal activity feed. The game runs locally; no backend, API keys, or environment variables are required.

## Run

```sh
npm install
npm run dev
```

The development server listens on `0.0.0.0:5173` and accepts Arena preview hosts.

```sh
npm run build   # Production build in dist/
npm run preview
```

## Included

- Text-only RNGdle wordmark with INFINITE beneath it (no logo icon), plus a text-based favicon, **Shop → Badges → History** navigation, and RNGdle-style light/dark layout, local **Inter + Space Mono** fonts, shared, tier-aware number boxes, and a colour-cycling Generate button.
- **Random-only generation across 0–1,000,000 inclusive**, using Web Crypto with rejection sampling. Every number is equally likely, including a repeat of the previous roll. There is no number editor, preset picker, seed setting, or arbitrary-number preview.
- Exact EP and earned/superseded badge membership for all **1,000,001** possible numbers, using pinned full-range factual indexes from RNGdle Tools plus two independently authored Infinite badge bonuses.
- Full-population rank percentages with ties included and reference-style rounded rank labels, also used in share text. Rank tooltips retain precise percentages and integer counts. Badge details show full-population percentages, approximate “1 in” frequencies, and exact outcome counts. Chances stay independent; no pity counter is implied.
- Staged progressive digit reveals, settle animations, two card pulses, vignette, lowest-to-highest EP badge stream, delayed rank, animated EP, and contributor highlights.
- No Skip Reveal button or keyboard skipping. The reference choreography plays on the selected reveal schedule; the browser’s reduced-motion preference still completes it immediately for accessibility.
- A **45-second base reveal** plus **60-second base cooldown**, with permanent timing upgrades. The next-roll deadline is fixed at draw start: **105 seconds base**, or **20 seconds with both timing tracks maxed**, before Flywheel. A charged Flywheel waives only that roll’s cooldown, leaving a 45s/15s reveal deadline. Reduced motion reveals instantly for accessibility but never advances this deadline.
- **EP is spendable currency.** Each completed roll credits its full score exactly once. The existing EP counter shows the wallet balance. Completed rolls appear in your activity feed. There are no replay controls, presets, or number editing.
- **Discovery-only collection:** 235 possible badges across 18 sets, but only earned badges appear in the collection, search results, details, and activity feed. An accessible progress bar tracks unique discoveries against all 235 badges, independent of search filters. Badge details stay in-game without external reference buttons. Completing a roll discovers all its earned badges, including superseded badges.
- **Leaderboard disabled**, including direct `#leaderboard` navigation. The History navigation replaces the inactive leaderboard. Today’s Best Roll, fake player data, and UI Preview labeling have been removed.
- **Sign up to save:** a local username profile retains guest progress and enables automatic browser saves. No passwords, email collection, online authentication, or backend.
- Light, dark, and system themes. Registered profiles persist wallet, discoveries, upgrades, equipped aura, and cooldown in localStorage; guest wallets and history stay in memory; a narrow sessionStorage guard retains only the committed draw and cooldown across refreshes. Theme preference can persist without signing up.
- Responsive layouts, accessible dialogs, local emoji assets, and no runtime CDN dependency.

## Presentation and progression

The reference-style number, rank, EP, share/roll controls and badge breakdown form one uninterrupted sequence. The added dashboard cards, duplicate reward recap and promotional goal copy have been removed. Collection and optional goal links remain as small text below the original content; the Shop retains a compact goal selector and plain purchase confirmation. Fonts, rarity palettes, reveal effects and optional owned cosmetics remain unchanged.

**Next Roll bar:** each committed draw now records a cosmetic `cooldownWindow` (`startsAt`, `endsAt`) alongside the enforced deadline. The fill measures only the cooldown: zero at the end of the reveal, half at the middle of the cooldown, and full at readiness. A compositor animation is periodically synchronised to `gameNow()` instead of using rounded display seconds or a per-frame React loop. It restores after reload and does not change when an upgrade is bought mid-roll. Reduced motion uses discrete updates and never skips the reserved reveal time. A Flywheel roll has no cooldown bar, but still reserves its full reveal. Older saves without a reconstructable window retain the exact countdown without inventing a fill percentage.

Goals remain optional and free. Recommendations respect prerequisites; a chosen goal persists with a local profile and clears after its purchase. Choosing or viewing a goal never spends EP. Auto-Roll pauses while browsing other pages, hidden tabs or dialogs, and remains off after reload. These conveniences do not modify randomness, scoring or timing.

## Rebirth

Rebirth is based on **all 235 discovered badges**, not shop ownership. The option is entirely hidden below **141/235 (60%)**, appears disabled from 141 to 234, and unlocks at **235/235** on the Badges page. Filtering the catalogue does not change eligibility.

Confirming requires typing **REBIRTH** and cannot be undone. As requested:

- **Reset:** EP balance and cycle earnings, discovered badges, every shop purchase (including cosmetics, Auto-Roll and Offline Roller), equipped aura, tracked goal, Flywheel charge, offline ledger and completed cooldown state.
- **Keep:** local profile, full activity history and an incremented rebirth count. Theme preference also remains. Guest progress is still temporary until signup.
- Each rebirth is recorded in History; previous roll rewards and purchase prices remain archived. Badges may be rediscovered and items repurchased in the new cycle. No luck or EP multiplier is added.

A pending online roll, committed offline batch or unexpired next-roll deadline blocks rebirth: it cannot discard an unwanted number or skip a wait. Registered resets use the same Web Lock and an atomic save. Failed saves leave progress intact. Rebirth count also acts as a cycle guard: other tabs cancel old work and reset their live reveal/automation state, and failed-settlement recovery cannot restore earnings from a previous cycle. New fields default safely for older version-1 saves. As with all frontend-only progress, deliberate storage/code tampering requires a future server-authoritative implementation to prevent.

## EP shop and local progress

The shop has sequential Quickwind, Clockwork, Flywheel and Offline Clock upgrade paths, seven cosmetic auras, and three utilities (23 products total). Offline Clock appears after Offline Roller is owned. Only the **next available upgrade per track** is shown; buying it replaces its card with the next level. The final owned card remains with a clear maximum-level state. All items cost in-game EP, require purchase confirmation, and can be purchased only once.

| Upgrade       |         Price | Effect             | Prerequisite  |
| ------------- | ------------: | ------------------ | ------------- |
| Quickwind I   |     35,000 EP | 45s → 35s reveal   | None          |
| Quickwind II  |    175,000 EP | 35s → 25s reveal   | Quickwind I   |
| Quickwind III |    800,000 EP | 25s → 15s reveal   | Quickwind II  |
| Clockwork I   |     60,000 EP | 60s → 45s cooldown | None          |
| Clockwork II  |    400,000 EP | 45s → 30s cooldown | Clockwork I   |
| Clockwork III |  1,800,000 EP | 30s → 15s cooldown | Clockwork II  |
| Clockwork IV  |  8,000,000 EP | 15s → 10s cooldown | Clockwork III |
| Clockwork V   | 20,000,000 EP | 10s → 5s cooldown  | Clockwork IV  |

Timing upgrades activate automatically. Both timings are snapshotted when Generate is pressed: buying during a reveal does not restart or shorten it, and does not shorten its upcoming cooldown. Buying during a cooldown does not change its deadline. Upgrades apply to rolls started afterward. They never change uniform random odds, badge rules, or EP scoring.

| Aura            |        Price | Effect                                                                                                  |
| --------------- | -----------: | ------------------------------------------------------------------------------------------------------- |
| Starfall        |    50,000 EP | A living constellation: golden twinkles and a drifting comet sweep across your rarity box.              |
| Aurora Veil     |   300,000 EP | Flowing emerald and violet ribbons with a holographic sheen, layered over your original rarity colours. |
| Frostglass      |   450,000 EP | Glacial facets, an icy sweep, and softly drifting crystal flecks.                                       |
| Emberwake       |   900,000 EP | Rising embers and a molten rim over the original rarity palette.                                        |
| Eclipse Crown   | 2,500,000 EP | A golden corona, crescent rings, and orbiting stardust.                                                 |
| Prismatic Bloom | 4,000,000 EP | Spectral petals, layered prism outlines, and drifting light motes.                                      |
| Orbital Halo    | 1,500,000 EP | A five-colour rainbow halo, twin orbital rings, and satellite lights frame every number.                |

Auras are cosmetic only. Buying equips the aura; owned auras can be re-equipped for free. One aura can be equipped at a time, and the original appearance is always free to restore. Timing upgrades, Flywheel, and utilities do not occupy the aura slot. Prices have been rebalanced around ordinary rolls rather than the jackpot-inflated average. Existing purchases remain owned without another charge; their updated visual effects and timing settings apply automatically. No saved wallet or discovery is reset. Old purchase records retain the price actually paid; repricing does not retroactively refund or debit EP.

**Archive Lens — 150,000 EP:** permanently unlocks number-substring search and a roll-tier filter in History. Search runs over the entire archive before pagination. The basic feed, event-type filters, and all older entries remain free to access. It changes neither luck nor EP.

**Auto-Roll — 5,000,000 EP:** permanently unlocks an accessible on/off switch on the Roll page. It defaults to off, including after reload, and does not equip an aura. When enabled, it starts the next roll after the complete reveal-plus-cooldown deadline, using the same persisted draw, verified scoring, single-credit settlement, and cross-tab locks as manual rolls. Turning it off does not cancel a committed number. Auto-Roll pauses when another section or a hidden browser tab is open, resumes when the Roll page is visible again, and switches off on draw/settlement errors. Auto-Roll has no special speed advantage over manual rolls and does not perform offline catch-up; Flywheel benefits both equally.

### Flywheel — 600,000 EP; II — 4,000,000 EP; III — 12,000,000 EP

A permanent pace upgrade with an automatic **four-charge / fifth-roll** rhythm. Four completed online rolls begun after purchase charge it; the fifth roll retains its full reveal but has **zero cooldown afterward**. Boosted rolls do not charge the next cycle. Auto-Roll counts normally; offline rolls never charge or consume it. Normal cooldowns still apply to the four charging rolls, including the fourth. A full five-roll cycle averages 93 seconds per roll at base timings, or 27 seconds at the previous 15s-reveal / 15s-cooldown ceiling, excluding user/UI delays.

**Flywheel II** needs two charging rolls before a boosted third roll; **Flywheel III** needs one, so every other roll is boosted. Each requires its predecessor. Buying a tier preserves earned charge up to the new limit, without changing any already-committed roll. With Clockwork V, Quickwind III and Flywheel III, the average cycle is **17.5 seconds** (15s full reveal plus an alternating 5s/0s cooldown). That is an ideal ~206 rolls/hour before processing or user delays—not a promise of EP income.

Charge is visible on the Roll page and persisted with a local profile. The draw snapshots a `flywheel: "charge" | "boost"` flag, and consuming a charged boost is atomic with committing the next number and its deadline. Failed draws keep the charge; refresh restores the same boosted number, not a replacement. Eligible settlement adds exactly one charge; duplicate receipts and failed-write recovery cannot add it twice. Reduced motion still reserves the full reveal deadline. Buying during a reveal does not retrospectively count that roll, and all existing timing upgrades stack without changing EP or probability. Existing version-1 saves default to zero charge.

### Price audit

`npm run audit:economy` reproduces the complete 1,000,001-number distribution and catalogue price comparisons. Including the existing two originals, the **median is 5,801 EP**, versus a jackpot-inflated **mean of 21,548.40 EP**; **748,167 outcomes pay less than 10,000 EP**. The first useful pair now costs **95,000 EP** (35,000 Quickwind I + 60,000 Clockwork I), versus 200,000 before, and shortens the base 105-second cycle to 80 seconds. The original three timing tiers cost 3,270,000 EP total instead of 4,850,000. Base Flywheel drops from 1,000,000 to 600,000 EP; Offline Roller drops from 15,000,000 to 10,000,000. Auto-Roll retains the explicitly requested 5,000,000 EP price. Cosmetics and Archive Lens keep their prices. Recommendations compare all eligible pace/earning tools by price, so expensive late Clockwork tiers no longer hide cheaper core tools.

New online tiers deliberately have diminishing speed returns while preserving the 15-second reveal floor. The audit also reports reproducible timing milestones and offline-cap fill times. Median-roll equivalents are a comparison baseline, not a promise of how many rolls a purchase takes. Reference EP rewards, the two original bonuses, and uniform RNG are unchanged. Repricing never refunds/debits existing wallets or rewrites historical purchase prices.

### Offline Roller — 10,000,000 EP

A permanent tool for saved local profiles. It earns **one normal random roll for each full 10 minutes away**, capped at **24 hours / 144 rolls per absence**, as requested. Online reveal/cooldown upgrades do not speed up this interval. It activates on purchase without retroactive credit for time before purchase. No further purchase or claim fee is required.

| Offline upgrade  |         Price | Interval | Rolls after 8h | Time to 144-roll cap |
| ---------------- | ------------: | -------: | -------------: | -------------------: |
| Offline Roller   | 10,000,000 EP |   10 min |             48 |                  24h |
| Offline Clock I  | 12,000,000 EP |  7.5 min |             64 |                  18h |
| Offline Clock II | 25,000,000 EP |    5 min |             96 |                  12h |

Each tier requires the previous one and a local profile. **The limit stays at 144 rolls per absence:** checking only once every 24 hours gives no extra rolls from either clock tier. Upgrades make shorter absences more productive, not individual rolls more valuable. Purchase starts a new future-rate anchor; owed whole intervals or a pending batch must be settled first, and already-paid summaries remain available. Partial intervals do not carry over or receive retroactive credit. Committed batches snapshot their interval for reload-safe history timestamps; legacy batches without the field retain their original ten-minute spacing.

**Browser-only implementation:** closed pages cannot execute a worker. On return, the game calculates the earned roll count, commits all chosen numbers before showing rewards, and then settles ten rolls per saved transaction. Each roll uses the same uniform RNG, verified scores, badge rules, discoveries, and history as an online roll. The welcome-back summary shows rewards already credited—not an unclaimed balance. The free **Offline** history filter shows every recorded offline roll.

The tool tracks **absence from all visible tabs of the same local account**, not simply leaving the Roll section. Visible tabs heartbeat every 15 seconds; hiding a tab records a transition. Closing/crashing a browser may miss the final write, so timing can fall back to its last successful heartbeat (approximately 15-second granularity in normal operation). Whole-period rounding occurs per absence; fractional periods do not carry forward. Presence leases expire after 45 seconds to recover from abruptly closed tabs. A stalled or modified browser cannot be distinguished perfectly from an absent one without a backend.

The saved `offline` ledger contains the last seen timestamp, a bounded committed batch (up to 144 numbers, IDs and saved index), and an optional reward summary. Interrupted batches resume the same numbers, without replacing another pending manual roll or its cooldown. Web Locks serialize catch-up across tabs. Failed settlement writes leave the committed batch available to retry; no extra EP is exposed as credited. Account deletion clears the ledger and profile-scoped `rng-infinite-presence-v1:` entries. Deliberate save/clock tampering remains outside frontend security guarantees; authoritative offline rewards need server time and storage.

### Cosmetic workshop

Existing aura owners receive the new effects free: constellation tracery for Starfall, additional Aurora ribbons, an extra orbital plane, faceted Frostglass edges, and a brighter Emberwake rim. Eclipse Crown and Prismatic Bloom add permanent premium options. The shop's rarity selector previews every aura on the selected scoring palette using question marks, never editable or fabricated rolls. Core tier colours, GODLY's supplied recipe, and RNG remain unchanged; reduced motion disables all animated layers. The same upgraded number-box component is used in the live game.

### Infinite Originals

Two new badges join the original 233 in the **Infinite Originals** set:

| Badge       | Rule                                                                                               | Bonus EP | Earning numbers | Probability |
| ----------- | -------------------------------------------------------------------------------------------------- | -------: | --------------: | ----------: |
| Pendulum    | Six digits alternating two different digits, ABABAB, with A from 1–9 and B from 0–9.               |   25,000 |              81 |     0.0081% |
| Last Second | Six-digit HH5959 with HH from 10 through 23: the last second of an hour. No padded leading zeroes. |   75,000 |              14 |     0.0014% |

These are independent scoring badges (no supersession family), with supporting-digit diagrams, normal discovery/history entries, and saved unlocks. Badge rarities are Anomaly and Mythic respectively. The pinned upstream files, original badge rules, and original EP contributions remain intact; the runtime adds these bonuses before sorting the **entire population** for ranks and updating tier counts. Thus total scores and ranks can differ from the reference. Old wallets and recorded rolls are not repriced, and old history does not retroactively unlock either badge. Collection progress now uses 235.

### Number boxes and cosmetics

A single `NumberBox` component renders the idle generator, generated results, historical rolls, and every cosmetic preview. Its original seven rarity palettes use the light/dark scoring-box colour and shadow tokens observed in [Box Lab](https://rng.cubityfir.st/beta/boxes): 3px borders, 12px corners, gradients, gloss, tier-specific glows, and shimmer only from Uncommon upward. Neutral/unrevealed boxes do not disclose the outcome. The requested **GODLY tier starts at 500,000 EP**: gold `#fde68a → #fffbeb → #fde68a` gradient, `#f59e0b` border, 20px outer glow and inset highlight, 12px radius, 3px border, `#78350f` ink with gradient digits, shimmer, ten shadowed star particles generated with seed 1234, and a three-second breathing cycle. GODLY splits the old Mythic population without changing any scores or badge odds (2,075 of 1,000,001 numbers, approximately 0.2075%). Legacy high-EP history boxes migrate to GODLY.

The component and animations are independently implemented. Starfall adds twinkling stars and a comet; Aurora adds drifting ribbons and a holographic layer; Orbital Halo adds a five-colour halo, orbital rings, and satellite lights; Frostglass adds icy facets; Emberwake adds rising sparks. They decorate the box without replacing the score's underlying rarity palette. Reduced motion disables animated layers throughout the app, including shop previews. Cosmetics never change the original badge rules or the two Infinite Originals; all badge probabilities and roll ranks use the complete population.

### Personal activity feed

History (`#history`) records completed rolls with the number, tier, EP, earned badges, and timestamp; first-time badge unlocks grouped by roll; shop purchases with the actual price paid; and free aura equipment changes. Events appear newest first, with filters for rolls, badge unlocks, and shop activity. Historical number boxes are read-only, and earned badges open their normal detail dialogs. Repeated numbers are distinct rolls, but repeat discoveries do not create another unlock event. Failed or cancelled purchases do not create transactions.

All recorded entries are retained, with 50-at-a-time display pagination rather than a rolling data cutoff. Old saves migrate without losing EP or purchases, but rolls from before tracking was introduced cannot be reconstructed and are not fabricated. Guest activity remains in memory and is saved together with current progress on sign-up.

The entire log is stored with progress in localStorage, whose capacity is browser-dependent. If writing fails or storage fills up, existing saved activity is left intact, new draws are refused before their number is exposed, a warning appears, and purchases are refused. An already committed result may settle temporarily in the current tab; retry/recovery retains the committed number and merges missing roll receipts into the latest saved wallet without undoing another tab’s purchases. No saved history is silently truncated to make room.

### Delete account and progress

Profile → **Delete account & progress** opens a separate confirmation step requiring the exact word **DELETE**. A successful deletion removes the account, wallet, cumulative EP, discoveries, owned/equipped items, cooldown, pending draw, guest guard, receipt list, and entire activity log from this browser/origin. Theme preference is kept. Deletion can be cancelled before submission; a storage-removal failure leaves the account intact and allows retry.

Registered tabs synchronize deletion. Active reveals and pending draws are cancelled by resetting the game instance. Queued actions carry a game-generation token, and writes always check the saved profile identity inside the lock—even after a failed save—so a stale completion cannot resurrect a deleted account or credit a newly created profile. Signing up again starts fresh. There is no remote account to delete.

### Local sign-up and persistence

Guests can roll, discover badges, and buy items, but these changes exist **only in the current tab’s memory** and disappear on reload. The exception is a temporary anti-reroll guard under `rng-infinite-guest-roll-v1` in sessionStorage: it stores only the pending number, ID, start time, snapshotted timings, and next-roll deadline. Refreshing resumes that draw without saving the guest wallet/history. A guest guard belongs to a tab/session, not an identity across fresh browser sessions. Creating a local profile saves the entire current guest game atomically, then enables automatic saves. The username accepts 3–20 letters, numbers, underscores, or hyphens. No email, password, or other credential is requested or stored. This is **not online authentication**, and usernames are not globally reserved.

`rng-infinite-progress-v1` stores a versioned object with local `profile` (ID, username, creation timestamp), spendable `balance`, cumulative `totalEarned`, discovered badge IDs, owned product IDs, equipped aura, cooldown deadline, `pendingRoll` commitment, a bounded recent receipt list, optional `goalId`, `cooldownWindow`, `rebirths`, `flywheelCharge` (0–4), and the complete `history` activity log. Roll IDs in history also prevent duplicate credits after the recent receipt window expires. Theme remains under `rng-theme`. Existing profileless saves from the earlier prototype can be loaded into guest memory, but new changes are not persisted until sign-up.

Writes are serialized in each tab and use **Web Locks** to protect shared balances and coordinate registered draws across tabs. A registered draw is refused without Web Locks support. Storage events synchronize registered tabs. A guest tab does not silently join a profile created in another tab or lose its guest game; attempting sign-up then explains the conflict instead of overwriting the other profile. Simultaneous account tabs join the same pending draw, and canonical settlement recomputes the score and credits its ID only once.

Invalid saves recover to safe defaults with a warning. If the chosen number and original deadline cannot be committed, no new result is revealed. An existing commitment remains recoverable even if a subsequent settlement write fails; a purchase/equipment change is refused rather than spending EP that cannot be saved. Failed sign-up leaves the current guest game intact and allows retry. Guests require writable sessionStorage for the anti-reroll guard.

Progress belongs to the browser **and origin**. Clearing site data removes the local profile and progress. Switching browsers, devices, or preview hostnames does not carry saves across. No cloud backup or real money is involved.

## Randomness, scoring, and percentages

The reference’s [Luck page](https://rng.cubityfir.st/luck) uses the full score distribution rather than a sample. Infinite uses that same full population:

- `percentile = 100 × count(EP ≤ this EP) / 1,000,001`
- **Top** = percentage scoring **at least** this EP; **Bottom** = percentage scoring **at most** this EP. Both include ties. Top is shown when the inclusive percentile is at least 50.
- Visible rank labels match the reference: rounded whole percentages, with **<1%** when the rounded value would be zero. Hovering shows the precise percentage (up to six decimal places), exact integer counts, and tie policy. Badge odds retain three-significant-digit formatting.
- A badge’s percentage counts every number earning it, even if another badge in its family supersedes it. Only the highest-EP badge in each family contributes to the total score.
- Badge rarity and total-roll rarity use different thresholds. Rarity tooltips use exact tier counts recomputed from the final score distribution, never cached manifest counts. Rounding never changes a nonzero chance to 0% or a non-certain chance to 100%.

The two scoring indexes total approximately **2.5 MB compressed**. They are delivered as versioned, ASCII-safe JSON envelopes (approximately **3.3 MB** before HTTP compression) so preview proxies cannot reinterpret the binary gzip payload. A shared Web Worker decodes and decompresses them, then verifies the **canonical decompressed SHA-256 and exact size** before indexing. Gzip metadata/recompression changes do not cause false failures; changed scores still fail. Content-addressed URLs and cache revalidation avoid stale data/manifest mismatches. Generate stays disabled while loading. Failed or corrupt data produces a visible retry action, never a fallback sample or invented score.

The worker accepts initialization, uniform random draws, and internal restoration of an already committed number. Restoration does not consume RNG; it is not exposed as a number-entry control. The old fifty reference snapshots are **test fixtures only**, not a production roll pool. The upstream executable engine is not shipped. See [`src/data/README.md`](src/data/README.md) for provenance, formats, and animation details.

### Frontend boundary

Randomness and scoring run locally in the browser. Serve over HTTPS (localhost is also permitted for development) for Web Crypto. Current browsers are recommended; decoding the scoring payloads requires `DecompressionStream` support.

This is **not a server-authoritative or tamper-proof game**: client-side state and cooldowns cannot enforce competitive fairness. Online accounts, cross-device sync, live rankings, and server-enforced cooldowns remain unimplemented. Reloading preserves completed progress only after local sign-up, but resumes the same pending draw for both registered players and guests in the same tab session. Its ID, start time, and next-roll deadline do not reset. Navigating between sections keeps the reveal running. An open tab uses a monotonic clock, so changing wall time cannot skip its cooldown; deliberately modifying storage/code or clock time across reloads is still outside the frontend trust boundary. A guest can also clear storage or create a fresh session; preventing that requires a backend identity. A future backend can replace `src/roll-client.js` while retaining the result/animation interface.

## Tests

```sh
npx playwright install --with-deps chromium
npm test
npm run prepare:data # Recompute odds, tier counts, and integrity manifest from pinned indexes
```

The **173 tests** cover:

- Goal recommendations/prerequisites, backward-compatible goal saves, failed-write retry, cross-tab preservation, guest/signup gating, confirmed purchase → next goal, plain progress links, duplicate-roll discoveries, Auto-Roll dialog pausing, completed-workshop states, profile-required goals and narrow-screen themes.
- Rebirth visibility at 140/141/234/235 badges, unique-badge eligibility, filters, typed confirmation/cancel, complete resets and preserved history, repurchases/rediscovery, failed local/session saves, simultaneous tabs, missed storage events, stale-cycle recovery, Web Locks, pending-roll/offline/cooldown guards and mobile dialogs.
- Cooldown-only fill arithmetic, fractional progression, reload and mid-cooldown purchases, reduced-motion reveal reservation and zero-cooldown Flywheel rolls.
- Six late tiers, prerequisite-chain migration, historical prices, recommendation ordering, 5s/10s snapshots, 4/2/1-charge rhythms, rate changes without retroactive rewards, snapshotted legacy batches, the unchanged 144 cap, concurrent tier purchases and failed-save rollback.
- Flywheel’s two-cycle accounting, zero-cooldown validation, mid-reveal purchase snapshots, full base/upgraded reveal deadlines, reload restoration, concurrent single consumption, failed commit/recovery, offline exclusion, Auto-Roll compatibility, mobile display, and legacy price preservation.
- Exact chance/frequency formatting at rare and near-certain boundaries, and full-population tier odds despite stale manifest counts.
- Every legal number’s base score versus its highest-EP family memberships, all 233 pinned badge probabilities and data hashes, plus exhaustive independent checks of both Infinite Originals, their bonuses, adjusted ranks and tier counts.
- Agreement with fifty independent reference snapshots, exact inclusive rank tails, rare percentages, both range endpoints, and rejection-sampling boundaries/repeats.
- Real worker loading, text-safe versioned delivery, changed gzip metadata/recompression, HTTP-compressed JSON, corrupt-data retry, bounded decompression, double-click protection, and read-only numbers.
- Activity filtering and pagination, complete history persistence, first unlocks only, immutable transaction prices, deduplication beyond 128 rolls, confirmation/cancel/retry deletion, cross-tab reveal cancellation, missed deletion events, and queued-completion safety.
- Guest save gating and reload resets, atomic local sign-up, failed signup/retry, cross-tab profile conflicts, 45s/60s base timings, 15s/15s upgraded timings, sequential prerequisites, mid-reveal/cooldown upgrade snapshots, disabled leaderboard, persistent wallet/cooldown, hidden undiscovered badges, purchase confirmation and affordability, duplicate/cross-tab purchase protection, ownership/equipment reloads, corrupt/blocked storage, sharing, reduced motion, navigation during reveals, dialogs, themes, and mobile overflow.
- Committed registered/guest reloads, concurrent account draws and single rewards, failed commit protection, missing Web Locks, failed-settlement recovery preserving other-tab spending, monotonic in-tab time, and unchanged reduced-motion cadence.
- Progressive/maxed upgrade cards, Archive Lens search before pagination, new cosmetic purchases and mobile filters.
- Shared number-box coverage, all seven original light/dark palettes plus GODLY boundary/count/palette/particles, rarity-gated shimmer, upgraded cosmetics, legacy ownership after repricing, and reduced-motion/mobile rendering.
- Offline ten-minute arithmetic and the 144-roll cap, concurrent return single credit, visible-tab exclusion, heartbeat/visibility transitions, interruption/retry, preserved manual commitments, free offline history, deletion, profile-gated purchase, and mobile/reduced-motion premium previews.
- Auto-Roll price/confirmation/persistence, off-by-default state, timing upgrades and reduced-motion cadence, pausing, stopping during a reveal, failed commits, account deletion and multi-tab single rewards; new badge discovery/history/details and non-retroactive migration.
- Text-only logo/home navigation and keyboard order, empty/partial/complete collection progress, saved discoveries after reload, removed reference buttons, and responsive light/dark layouts.
- Measured generated-roll desktop geometry (including superseded rows), persistent digit nodes, first-EP tween, reveal gating, accessible instant completion, contributor agreement with all fifty fixtures, shared chip-loop timing, and rank overshoot.

Deterministic browser tests intercept the worker’s crypto source in Playwright only; there is no production test seed or number input. To use an existing Chromium binary, set `CHROMIUM_PATH`.

## Main files

- `src/main.jsx` — navigation, discovered-only catalogue, dialogs, and progress integration
- `src/progress.js`, `src/use-progress.js` — versioned local saves, wallet/discovery rules, idempotent credits, and serialized transactions
- `src/shop-data.js`, `src/components/Shop.jsx`, `src/shop.css` — cosmetic products, confirmation/equipment UI, and opt-in auras
- `src/components/NumberBox.jsx`, `src/number-box*.css` — shared number boxes, theme-aware scoring palettes, and cosmetic effects
- `src/components/LocalProfile.jsx` — local-only sign-up, saved profile details, and confirmed account deletion
- `src/components/ActivityFeed.jsx`, `src/activity.css` — filtered, paginated personal activity
- `src/components/RollExperience.jsx` — asynchronous generation, reveal controller and sharing
- `src/roll-client.js`, `src/roll.worker.js` — worker lifecycle, loading/retry, and random-roll messages
- `src/load-index.js` — text-safe data transport, bounded decompression, and canonical integrity checks
- `src/offline.js`, `src/use-offline.js`, `src/components/OfflineRewards.jsx` — offline accounting, shared presence, catch-up scheduling and reward summary
- `src/gameplay-loop.js`, `src/components/RollProgress.jsx`, `src/progress-links.css` — optional goals and plain collection/progression links
- `src/rebirth.js`, `src/components/Rebirth.jsx` — collection eligibility and typed reset confirmation
- `src/cooldown.js`, `src/components/CooldownFill.jsx` — persisted cooldown windows and monotonic, compositor-driven fill
- `src/flywheel.js`, `src/components/FlywheelMeter.jsx` — snapshotted charge rules and accessible pace progress
- `tools/audit-economy.mjs` — reproducible score distribution and price audit
- `src/infinite-badges.js` — two original badge rules/memberships, EP bonuses, exact odds, and combined metadata
- `src/game-clock.js` — wall-anchored monotonic in-tab time
- `src/random.js` — unbiased Web Crypto rejection sampling
- `src/game-index.js` — indexed scoring, badge families, and roll tiers
- `src/probability.js` — exact full-population rank counts and percentage formatting
- `src/contributors.js` — independent presentation-only supporting-digit/formula helpers
- `src/components/BadgeBreakdown.jsx`, `src/chip-motion.js` — badge groups and contributor animations
- `src/roll-timeline.js`, `src/components/RankSummary.jsx` — reveal timing and rank entrances
- `src/roll-data.js` — presentation grouping and share text
- `src/roll.css`, `src/styles.css` — roll presentation, shared page styles, and themes
- `src/badges.js`, `src/data/`, `public/data/` — catalogue, factual indexes, and provenance
- `tests/`, `tools/prepare-game-data.mjs` — browser/data checks and data preparation

## References and credits

- [RNGdle](https://www.rngdle.com/), created by Cam / sparrowpatch. This is an independent frontend recreation, not the official service.
- [RNGdle Tools](https://rng.cubityfir.st/), its [badge catalogue](https://rng.cubityfir.st/badges), [Luck page](https://rng.cubityfir.st/luck), and [documented roll timings](https://github.com/CubityFirst/rngdle-ep-calculator/blob/8190166af9f259a9d3a0a941b2c9902bfbbe713f/site/README.md#roll-timings). Full-range factual indexes are pinned to commit `8190166af9f259a9d3a0a941b2c9902bfbbe713f`; the upstream runtime and stylesheets are **not** bundled.
- [Box Lab](https://rng.cubityfir.st/beta/boxes): scoring-box visual reference, including the `SCORE_TIERS` factual palette table in [`src/beta.js`](https://github.com/CubityFirst/rngdle-ep-calculator/blob/8190166af9f259a9d3a0a941b2c9902bfbbe713f/src/beta.js). Only observed colour/shadow values are retained; no upstream renderer or stylesheet is bundled.
- Emoji artwork: [Twemoji](https://github.com/jdecked/twemoji), Twitter, Inc. and other contributors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Included SVGs are unmodified; license in `public/emoji/LICENSE`.
- Fonts: Inter and Space Mono, distributed via Fontsource under the SIL Open Font License.
- Icons: Lucide, ISC license.
