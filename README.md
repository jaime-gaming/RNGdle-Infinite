# RNGdle Infinite

A frontend-only recreation of RNGdle’s roll experience, adapted for Infinite. Built with React 19 and Vite. No backend, API keys, or environment variables are required.

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

- RNGdle-style light/dark layout, local **Inter + Space Mono** fonts, shared, tier-aware number boxes, colour-cycling Generate button, and reference best-roll card.
- **Random-only generation across 0–1,000,000 inclusive**, using Web Crypto with rejection sampling. Every number is equally likely, including a repeat of the previous roll. There is no number editor, preset picker, seed setting, or arbitrary-number preview.
- Exact EP and earned/superseded badge membership for all **1,000,001** possible numbers, using pinned full-range factual indexes from RNGdle Tools.
- Full-population rank percentages with ties included and reference-style rounded rank labels, also used in share text. Rank tooltips retain precise percentages and integer counts. Badge details show percentages counted over the complete badge index.
- Staged progressive digit reveals, settle animations, two card pulses, vignette, lowest-to-highest EP badge stream, delayed rank, animated EP, and contributor highlights.
- No Skip Reveal button or keyboard skipping. The reference choreography plays on the selected reveal schedule; the browser’s reduced-motion preference still completes it immediately for accessibility.
- A **45-second base reveal** and **60-second base cooldown** after completion, with permanent timing upgrades. Reduced motion shortens only the reveal, not the cooldown.
- **EP is spendable currency.** Each completed roll credits its full score exactly once. The existing EP counter shows the wallet balance. There are no replay controls, recent-roll history, presets, or number editing.
- **Discovery-only collection:** 233 possible badges across 17 sets, but only earned badges appear in the collection, search results, details, and demo best-roll cards. Completing a roll discovers all its earned badges, including superseded badges.
- **Leaderboard disabled**, including direct `#leaderboard` navigation. The reference best-roll card remains explicitly marked demo data.
- **Sign up to save:** a local username profile retains guest progress and enables automatic browser saves. No passwords, email collection, online authentication, or backend.
- Light, dark, and system themes. Registered profiles persist wallet, discoveries, upgrades, equipped aura, and cooldown in localStorage; guests play in memory only. Theme preference can persist without signing up.
- Responsive layouts, accessible dialogs, local emoji assets, and no runtime CDN dependency.

## EP shop and local progress

The shop has two sequential upgrade tracks and three cosmetic auras. All items cost in-game EP, require purchase confirmation, and can be purchased only once.

| Upgrade       |        Price | Effect             | Prerequisite |
| ------------- | -----------: | ------------------ | ------------ |
| Quickwind I   |   125,000 EP | 45s → 35s reveal   | None         |
| Quickwind II  |   500,000 EP | 35s → 25s reveal   | Quickwind I  |
| Quickwind III | 2,000,000 EP | 25s → 15s reveal   | Quickwind II |
| Clockwork I   |   250,000 EP | 60s → 45s cooldown | None         |
| Clockwork II  | 1,000,000 EP | 45s → 30s cooldown | Clockwork I  |
| Clockwork III | 4,000,000 EP | 30s → 15s cooldown | Clockwork II |

Timing upgrades activate automatically. Both timings are snapshotted when Generate is pressed: buying during a reveal does not restart or shorten it, and does not shorten its upcoming cooldown. Buying during a cooldown does not change its deadline. Upgrades apply to rolls started afterward. They never change uniform random odds, badge rules, or EP scoring.

| Aura         |        Price | Effect                                                                                                  |
| ------------ | -----------: | ------------------------------------------------------------------------------------------------------- |
| Starfall     |   125,000 EP | A living constellation: golden twinkles and a drifting comet sweep across your rarity box.              |
| Aurora Veil  |   500,000 EP | Flowing emerald and violet ribbons with a holographic sheen, layered over your original rarity colours. |
| Orbital Halo | 2,500,000 EP | A five-colour rainbow halo, twin orbital rings, and satellite lights frame every number.                |

Auras are cosmetic only. Buying equips the aura; owned auras can be re-equipped for free. One aura can be equipped at a time, and the original appearance is always free to restore. Timing upgrades do not occupy the aura slot. All prices are **5× the earlier prototype prices**. Existing purchases remain owned without another charge; their updated visual effects and timing settings apply automatically. No saved wallet or discovery is reset.

### Number boxes and cosmetics

A single `NumberBox` component renders the idle generator, generated results, demo best roll, demo profile, and every cosmetic preview. Its seven rarity palettes use the light/dark scoring-box colour and shadow tokens observed in [Box Lab](https://rng.cubityfir.st/beta/boxes): 3px borders, 12px corners, gradients, gloss, tier-specific glows, and shimmer only from Uncommon upward. Neutral/unrevealed boxes do not disclose the outcome. No community-made or Legendary rarity is added.

The component and animations are independently implemented. Starfall adds twinkling stars and a comet; Aurora adds drifting ribbons and a holographic layer; Orbital Halo adds a five-colour halo, orbital rings, and satellite lights. They decorate the box without replacing the score's underlying rarity palette. Reduced motion disables animated layers throughout the app, including shop previews. The original 233 badges and full-population odds remain unchanged.

### Local sign-up and persistence

Guests can roll, discover badges, and buy items, but these changes exist **only in the current tab’s memory** and disappear on reload. Creating a local profile saves the entire current guest game atomically, then enables automatic saves. The username accepts 3–20 letters, numbers, underscores, or hyphens. No email, password, or other credential is requested or stored. This is **not online authentication**, and usernames are not globally reserved.

`rng-infinite-progress-v1` stores a versioned object with local `profile` (ID, username, creation timestamp), spendable `balance`, cumulative `totalEarned`, discovered badge IDs, owned product IDs, equipped aura, cooldown deadline, and a bounded receipt list used to prevent duplicate credits. There is no roll-history feature. Theme remains under `rng-theme`. Existing profileless saves from the earlier prototype can be loaded into guest memory, but new changes are not persisted until sign-up.

Writes are serialized in each tab and use **Web Locks** where available to protect shared balances across tabs. Storage events synchronize registered tabs. A guest tab does not silently join a profile created in another tab or lose its guest game; attempting sign-up then explains the conflict instead of overwriting the other profile. If Web Locks is unavailable, only same-tab serialization is guaranteed; this remains a frontend prototype, not an authoritative economy.

Invalid saves recover to safe defaults with a warning. If saving fails, registered rolls can continue temporarily in memory, but a purchase/equipment change is refused rather than spending EP that cannot be saved. Failed sign-up leaves the current guest game intact and allows retry. Guests do not require writable storage to play.

Progress belongs to the browser **and origin**. Clearing site data removes the local profile and progress. Switching browsers, devices, or preview hostnames does not carry saves across. No cloud backup or real money is involved.

## Randomness, scoring, and percentages

The reference’s [Luck page](https://rng.cubityfir.st/luck) uses the full score distribution rather than a sample. Infinite uses that same full population:

- `percentile = 100 × count(EP ≤ this EP) / 1,000,001`
- **Top** = percentage scoring **at least** this EP; **Bottom** = percentage scoring **at most** this EP. Both include ties. Top is shown when the inclusive percentile is at least 50.
- Visible rank labels match the reference: rounded whole percentages, with **<1%** when the rounded value would be zero. Hovering shows the precise percentage (up to six decimal places), exact integer counts, and tie policy. Badge odds retain three-significant-digit formatting.
- A badge’s percentage counts every number earning it, even if another badge in its family supersedes it. Only the highest-EP badge in each family contributes to the total score.
- Badge rarity and total-roll rarity use different thresholds. Rarity tooltips use actual tier population counts.

The two scoring indexes total approximately **2.5 MB compressed**. They are delivered as versioned, ASCII-safe JSON envelopes (approximately **3.3 MB** before HTTP compression) so preview proxies cannot reinterpret the binary gzip payload. A shared Web Worker decodes and decompresses them, then verifies the **canonical decompressed SHA-256 and exact size** before indexing. Gzip metadata/recompression changes do not cause false failures; changed scores still fail. Content-addressed URLs and cache revalidation avoid stale data/manifest mismatches. Generate stays disabled while loading. Failed or corrupt data produces a visible retry action, never a fallback sample or invented score.

The worker’s UI-facing interface accepts only initialization and random-roll requests. The old fifty reference snapshots are **test fixtures only**, not a production roll pool. The upstream executable engine is not shipped. See [`src/data/README.md`](src/data/README.md) for provenance, formats, and animation details.

### Frontend boundary

Randomness and scoring run locally in the browser. Serve over HTTPS (localhost is also permitted for development) for Web Crypto. Current browsers are recommended; decoding the scoring payloads requires `DecompressionStream` support.

This is **not a server-authoritative or tamper-proof game**: client-side state and cooldowns cannot enforce competitive fairness. Online accounts, cross-device sync, persistent roll history, live rankings, and server-enforced cooldowns remain unimplemented. Reloading preserves completed progress only after local sign-up. Navigating between the roll, badges, and shop keeps an active reveal running; reloading or closing the page before completion discards that unfinished roll. A future backend can replace `src/roll-client.js` while retaining the result/animation interface.

## Tests

```sh
npx playwright install --with-deps chromium
npm test
npm run prepare:data # Recompute odds, tier counts, and integrity manifest from pinned indexes
```

The **57 tests** cover:

- Every legal number’s score versus its highest-EP family memberships, all 233 badge probabilities, tier counts, and data hashes.
- Agreement with fifty independent reference snapshots, exact inclusive rank tails, rare percentages, both range endpoints, and rejection-sampling boundaries/repeats.
- Real worker loading, text-safe versioned delivery, changed gzip metadata/recompression, HTTP-compressed JSON, corrupt-data retry, bounded decompression, double-click protection, and read-only numbers.
- Guest save gating and reload resets, atomic local sign-up, failed signup/retry, cross-tab profile conflicts, 45s/60s base timings, 15s/15s upgraded timings, sequential prerequisites, mid-reveal/cooldown upgrade snapshots, disabled leaderboard, persistent wallet/cooldown, hidden undiscovered badges, purchase confirmation and affordability, duplicate/cross-tab purchase protection, ownership/equipment reloads, corrupt/blocked storage, sharing, reduced motion, navigation during reveals, dialogs, themes, and mobile overflow.
- Shared number-box coverage, all seven light/dark palettes, rarity-gated shimmer, upgraded cosmetics, legacy ownership after repricing, and reduced-motion/mobile rendering.
- Measured generated-roll desktop geometry (including superseded rows), persistent digit nodes, first-EP tween, reveal gating, accessible instant completion, contributor agreement with all fifty fixtures, shared chip-loop timing, and rank overshoot.

Deterministic browser tests intercept the worker’s crypto source in Playwright only; there is no production test seed or number input. To use an existing Chromium binary, set `CHROMIUM_PATH`.

## Main files

- `src/main.jsx` — navigation, discovered-only catalogue, dialogs, and progress integration
- `src/progress.js`, `src/use-progress.js` — versioned local saves, wallet/discovery rules, idempotent credits, and serialized transactions
- `src/shop-data.js`, `src/components/Shop.jsx`, `src/shop.css` — cosmetic products, confirmation/equipment UI, and opt-in auras
- `src/components/NumberBox.jsx`, `src/number-box*.css` — shared number boxes, theme-aware scoring palettes, and cosmetic effects
- `src/components/LocalProfile.jsx` — local-only sign-up and saved profile details
- `src/components/RollExperience.jsx` — asynchronous generation, reveal controller and sharing
- `src/roll-client.js`, `src/roll.worker.js` — worker lifecycle, loading/retry, and random-roll messages
- `src/load-index.js` — text-safe data transport, bounded decompression, and canonical integrity checks
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
