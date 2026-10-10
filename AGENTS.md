# AGENTS.md

Context for coding agents working on RNGdle Infinite. Read this before you
change anything. The player-facing overview is in `README.md`.

## What this project is

A React + Vite browser game. The player rolls a uniformly random whole number
from 0 to 1,000,000, scores EP from its digit patterns (badges), and spends EP on
companions, skills, tasks, rebirths and prestige. It is an independent
recreation of RNGdle; the scoring and rank data come from RNGdle Tools.

There is no backend. The game runs in the browser and saves to `localStorage`.

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
| `src/sync.js`                             | Device linking (relay or PeerJS/WebRTC), heartbeat, reconnects.                 |
| `src/components/`                         | Shared UI components and game icons.                                            |
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
- **Bookmarks** are capped at 3. The README, the "Bookmarks (n/3)" chip and the
  tests all state that cap.
- **Companion signatures** ("firmas") take a slot on the rack, like any other
  circle.
- **Logos.** The new RNG-over-∞ mark is for the favicon and the mobile app icon
  only. The game's own logo is the original one from before RNGdle Infinite.
- **Stored numbers.** Every number saved from one roll pays the wallet skill
  multipliers, not only the last one.
- **Presentation settings** never change odds, EP, prices or timings.
- **Offline.** Offline rolls pay EP and go into history. Skill charging is
  online-only.

If a request seems to conflict with one of these, stop and ask instead of
guessing.

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
- Timers: heartbeat 3 s, pong timeout 12 s, reconnect backoff starting at 2.5 s
  and capped at 30 s. A regained network or a visible tab retries at once.
- The save never has to pass through the broker. Keep it that way.

## Tests: notes that save time

- `tests/helpers/progress.js` seeds the save. Use it instead of hand-writing
  `localStorage` for `PROGRESS_KEY`.
- A page that reads `?sync=` does so in an effect after mount. Wait for the
  stored link before navigating away, or the join races the navigation.
- `tests/device-link-webrtc.spec.js` needs the `peer` dev dependency. Keep that
  dependency in `devDependencies`.
- Timing-sensitive specs (`roll`, `auto-originals`) can be flaky under heavy
  parallel load. Re-run them alone before you assume a regression.

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
