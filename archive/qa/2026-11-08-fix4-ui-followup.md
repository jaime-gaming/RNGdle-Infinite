# v0.5.2 fix4 — UI follow-up, mirror notice and tidy-up — 2026-11-08

Second round of review notes after the fix4 patch. The 7,500-entry warning
was explicitly approved as-is and was not changed.

## Changes

- Settings ends with the exact internal label `RNGdle-Infinitev0.5.2fix4` in a
  small muted line (`settings-version`), pinned by a test.
- The footer's changelog button now reads `Changelog`, like its neighbours.
- Disabled controls show `cursor: not-allowed` instead of `wait`/`progress`.
  Replaced the global `button:disabled` rule and the three component-specific
  ones (Google sign-in, cloud save choice, profile logo). A test reads the
  computed cursor of a disabled button.
- The GitHub Pages build (`/RNGdle-Infinite/`) renders a visible legacy-mirror
  notice linking to `rngdle-infinite.jaime-gaming.com`. The root-domain Worker
  build and local dev use `/`, so they never show it. `isLegacyMirrorBuild`
  lives in `src/app-update.js`; both smoke tools now assert the two cases.
- Developer guides (`DEPLOYMENT.md`, `FIREBASE_SETUP.md`) moved into `archive/`,
  leaving README and AGENTS.md as the only root-level documentation. All
  references (AGENTS.md, `tools/deploy-worker.mjs`, `wrangler.jsonc`) were
  updated; the README gained a contents line and a short project-layout index.
  Configs and `.env` files were deliberately left in place: moving them would
  break Vite, Wrangler, Firebase and Playwright.
- Rebirth's hidden-stage teaser is now `StageTeaser` with two targets. The
  first ladder still teases Prestige with the unchanged
  "Wait, but there is more..." line. Every ladder replayed after a prestige
  teases Rollback instead (`data-teaser="rollback"`), with a short hint that
  names Rollback only once it is no longer a secret (three prestiges). A test
  pins the post-prestige case; the existing teaser tests still pass.
- A preview sandbox runs the dev server with
  `VITE_BLACK_FRIDAY_PREVIEW_AT=1795780800000` (27 November 2026, 12:00 UTC)
  and `VITE_REQUIRE_CLOUD_ACCOUNT=false`, so the sale day, shop, posters,
  themes and stamps can be exercised without a real account.

## Validation

- `npm run build` and `npm run build:github-pages`: passed (usual >500 kB chunk
  warning); `docs/` regenerated with the fix4 label and the mirror notice.
- `npm run test:github-pages`: passed, including the new mirror-notice check.
- `npm run test:worker`: passed, including the "no notice on the live build"
  check and the Chromium browser smoke.
- `npm run verify:cloud`: passed.
- Playwright focused run over app-update, site-links, design-system,
  pages-and-parade, rebirth-progress, loading-screen and compression:
  **44 passed, 0 failed**.
- Prettier on changed hand-written files and `git diff --check`: passed.

No deploy, Firebase rule publication, PR or merge was performed.
