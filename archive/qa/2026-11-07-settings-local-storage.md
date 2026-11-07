# Settings, help and quota-safe local saves — 2026-11-07

## Requested changes

- Removed the top Settings navigation buttons. Cloud Account remains a dedicated page reached by scrolling to its Settings section; save recovery retains its section entry.
- Restored `src/changelog.js` byte-for-byte to the session's original version (`f118c97`). Existing release notes must not change for bug fixes; added this rule to AGENTS.md. Changelog headings, titles and paragraph beginnings are capitalized by the renderer only.
- Expanded How to Play with committed draws, scoring vs banked EP, timing, Auto-Roll, goals, bookmarks, tasks and local/cloud save guidance. Legal links use the themed secondary-button style and wrap on phones.
- Refreshed screenshots (including How to Play), documentation and the GitHub Pages artifact.

## Local save implementation

The primary save normally remains JSON. `writeDeviceSave` retries a failed quota write using the existing bounded gzip/base64 codec and keeps compression enabled for later writes. It never deletes a primary save, history, recovery snapshots or account markers to make room. A failed retry leaves the previous save untouched; non-quota failures are not disguised as success.

The codec is now independent of progress/recovery modules to avoid circular dependencies. Parsing, cross-tab sync, save repairs, update recovery, vault recovery, manual restore and cloud candidate reads all recognize the compressed primary representation. Cloud payloads and gameplay schema remain unchanged. Existing JSON saves need no migration.

A rename/reload test exposed an independent URL bug: a local rename left the old own-profile URL behind. The canonicalization now follows an actual rename of the same profile without rewriting routes to other players.

## Validation

- Production build and committed GitHub Pages build: passed.
- Cloudflare Worker HTTP/browser smoke and GitHub Pages direct-route/browser smoke: passed.
- Cloud simulation, including orphaned public-summary recovery: passed.
- Compression tests cover exact round trip, substantial size reduction, retaining all history, subsequent writes, full storage, blocked storage, corrupt compressed input, cross-tab synchronization, rename/reload, vault recovery and update recovery.
- Focused save/vault/repair/update/account/help run: 56 passed with one rename URL issue identified; fixed and verified in subsequent runs.
- Focused profile/progress/changelog run: 37 passed with one old capitalization expectation; updated expectations and verified the 19-case help/changelog/compression run.
- Final complete run: **574 passed, 5 failed** (update-test assertion race, draw-cap timeout, offline timing, PNG/browser resource failure and roll timing). Corrected the update test to wait for the completed message rather than matching its in-progress text. All five passed in an isolated, one-worker run. This is not represented as a single green full-suite run.
- Changed-file formatting and `git diff --check`: passed.

No production deployment, Firebase rule publication or merge was performed. This task introduces no new Firestore rule changes.
