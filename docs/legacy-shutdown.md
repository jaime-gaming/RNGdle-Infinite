# GitHub Pages Legacy shutdown

## Deadline and scope

**December 1, 2026 at 00:00 in Europe/Madrid (CET)** is
**November 30, 2026 at 23:00 UTC**. In the Canary Islands that is November 30 at
23:00 local time. This is one hour before the UTC RNGmas launch, deliberately:
the shutdown follows Spanish peninsular time, while event gameplay uses UTC.

Only the repository-base Legacy build at
`https://jaime-gaming.github.io/RNGdle-Infinite/` retires. The current game at
`https://rngdle-infinite.jaime-gaming.com/` continues. Accounts and saved cosmetics
are not deleted by this page.

## Player-facing behavior

Before the deadline, a persistent banner above the header shows days, hours,
minutes and seconds left. **Shutdown & moving your save** opens the information
section, with the exact deadline, what ends and a save-migration checklist.
The `#legacy-shutdown` fragment opens that section on an initial visit.

At or after the deadline, `LegacyGate` stops mounting the game. An already-open
page switches to the closure screen at the next one-second clock check (and on
focus). The closed build does not mount account sync, roll controls, status
polling or game effects. Initial save-repair/vault restoration is skipped after
closure. A small closure/backup utility remains; this is not continuing gameplay
or a promise of ongoing Legacy support.

The banner and closure information state that Legacy status reporting, technical
support and updates end. This is a client-build change, not an automatic edit of
an external status-page service or GitHub repository settings.

## Moving progress

1. Before closing, sign in on Legacy, wait for a successful Cloud sync, and do
   not ignore a sync error.
2. Open the current domain, sign in to the same Cloud Account and verify the
   intended profile and progress. Different profiles are not merged silently.
3. Local browser storage is origin-specific. It does not move merely because a
   player follows a link. Download a private local backup and do not clear the
   old origin until progress has been verified.

**Download local backup** copies the existing stored save bytes into a private
text file, without clearing, repairing, uploading or replacing the source. The
utility remains after closure. It is an archival copy, not an automatic import
workflow or a public profile card. Do not promise an unsupported file import.
The information also explains how to move bookmarks/installed shortcuts.

## Preview and screenshots

The two development previews run local-only builds with the repository base:

```sh
VITE_GAME_PREVIEW_AT=0 VITE_LEGACY_PREVIEW_AT=1795953600000 npm run dev:test -- --port 5183 --base /RNGdle-Infinite/
VITE_GAME_PREVIEW_AT=0 VITE_LEGACY_PREVIEW_AT=1796079600000 npm run dev:test -- --port 5184 --base /RNGdle-Infinite/
```

Open `/RNGdle-Infinite/` on each printed origin. The first freezes the visual
countdown at November 29, 12:00 UTC; the second shows the deadline/closed state.
`VITE_LEGACY_PREVIEW_AT` works only in dev builds. Production reads the real wall
clock, independently of the game's seasonal preview. The root-domain build is
not subject to the Legacy gate.

With those servers running, `node tools/screenshot-legacy.mjs` generates
`media/legacy-countdown.png`, `media/legacy-shutdown.png` and
`media/legacy-closed.png` using a synthetic local profile. `LEGACY_PREVIEW_BASE`
and `LEGACY_CLOSED_BASE` can override the full preview URLs; `CHROMIUM_PATH` can
select an installed browser.

## Release caveats

Publish the updated `docs/` build before the deadline. A pushed session branch
is not a deployment. No client build can remotely erase an old offline cached
build or prevent a user changing the device clock. Hosting-level removal,
external status-page changes and release/support policy execution require
separate operator action; this change neither disables the current domain nor
changes Firebase rules. Preserve user storage and migration options when doing
any hosting cleanup.

## Local verification before release

Validated on the session branch without deployment:

- 153 focused Playwright tests passed across the Legacy deadline, festival,
  RNGmas economy/zones, Cloud save comparison, pass identity, routing and updates.
- The GitHub Pages browser smoke checks the banner and information dialog before
  closing, transition on an already-open page at the deadline, closed state after
  reload, absent game controls and byte-for-byte local-backup download.
- A root-build regression test confirms the current game still runs after the
  Legacy deadline. Timezone tests verify Madrid midnight and the UTC boundary.
- `test:render`, `verify:cloud`, `audit:economy`, `verify:release`, production
  build, Worker browser smoke, Pages build and Pages smoke passed. The existing
  non-fatal chunk-size advisory remains.
- README captures for the festival board, 17-aura collection, Legacy countdown,
  information dialog and closed page were regenerated from synthetic browser
  profiles. No historical `src/changelog.js` entries were rewritten.

Production support/status removal and publishing the prepared branch still
require the operator's release action. The previews are not that action.
