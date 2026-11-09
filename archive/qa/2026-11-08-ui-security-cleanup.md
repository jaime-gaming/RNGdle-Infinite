# 2026-11-08 — loader, identity, deterministic ads, security and cleanup

## Changes

- Internal label is now exactly `v0.5.2fix4` in `src/app-update.js`,
  `vite.config.js`, Settings, the Vite HTML metadata, `docs/version.json`,
  generated `docs/` assets, AGENTS.md and current QA notes. Historical fix2/fix3
  notes keep their own labels.
- `src/app-update.js` now defines `isNewerVersion()`; the previous call used an
  undefined helper and fell into the failure branch. Labels compare by major,
  minor, patch and `fixN`, with legacy prefix stripping.
- The loader is a 22px grey, text-free circle inside `<main aria-busy>`; the
  header and footer stay visible, while roll controls and banners do not appear
  until the game data or cloud save is ready. `role="status"` and
  `aria-label="Loading"` were removed.
- Black Friday side posters are ordered by the current page via
  `rotationForPage()`, not by a 15s timer, hover state or random pick. Tests
  assert that time and keyboard focus no longer rotate them and that `/shop`
  shows a different first poster.
- Security headers added in `public/_headers` (and copied to `docs/_headers`):
  `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`,
  `Cross-Origin-Resource-Policy`, HSTS, `Referrer-Policy` and
  `X-Content-Type-Options`. No frame-ancestor denial headers were added because
  the game is shown in preview iframes. All `target="_blank"` links now use
  `rel="noopener noreferrer"`. `index.html` gained `referrer` and
  `color-scheme` metadata.
- Design: the GitHub Pages mirror notice has a green inline-start accent and a
  subtle inset rule; the loader is smaller and quieter.
- All code-describing comments were removed from `src/`, `tests/`, `tools/`,
  root configs, CSS, `wrangler.jsonc` and `index.html`; only `RETIREMENT` /
  `DELETE EVENT`-style event markers remain. `src/changelog.js` release-note
  strings are unchanged.
- No Spanish strings remain in source, tests, tools or regenerated `docs/`.
  The old Spanish ErrorBoundary fallbacks are gone from the committed Pages
  bundle. A Spanish router fixture was replaced with `Zoë_7`.
- Repository cleanup: eight unreferenced screenshots and the obsolete
  `archive/supabase/migrations/20261024000000_cloud_saves.sql` were removed;
  `.gitignore` now ignores generated screenshots outside the five README
  images. AGENTS.md lost the stale Supabase references and gained the
  security/UI baseline, the no-Spanish/comment rule and the tool-call budget
  section. No exact Arena.ai per-turn tool-call figure is published in this
  repository, so AGENTS.md instructs agents not to invent one and to batch
  reads, edits and validation.

## Validation

- `npm run build`: passed (6.92s).
- `npm run build:github-pages`: passed (7.11s); regenerated `docs/` with the
  short internal label and English-only ErrorBoundary strings.
- `npm run verify:cloud`: passed.
- `npm run test:worker`: passed (assets, headers, SPA fallback, version manifest,
  local gameplay).
- `npm run test:github-pages`: passed after the initial broad asset assertion
  was replaced with a safe `lang="en"` check; the broad check had matched bytes
  in a binary `.woff2` file.
- Targeted Playwright: **40 passed (1.6m)** across `app-update`,
  `black-friday`, `design-system`, `loading-screen`, `probability` and
  `site-links` with 2 workers.
- `prettier --check` and `git diff --check`: passed.
- No full-suite run was attempted in this batch; the historical 596/599
  parallel-load caveat still applies and is not superseded by these targeted
  results.
