# Contributing

Thanks for helping improve RNGdle Infinite. Start with [README.md](README.md)
for local setup and [AGENTS.md](AGENTS.md) for the save, gameplay and release
contracts. Discuss large changes in a GitHub issue before implementing them.
Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not an issue.

## Local development

Use Node.js 22 or newer and npm. Run `npm ci`, then `npm run dev:test` for
local-only development without Firebase credentials. That mode pins the preview
to November 18, 2026; Playwright supplies its own clock. Do not put real account
information or player saves in fixtures or screenshots.

Use a dedicated test Firebase project if you need to test Cloud integrations.
See the README's Cloud setup and `docs-source/cloud-game-security.md`. Local
simulations do not certify production bindings, credentials or deployed rules.

## Changes and validation

- Keep changes focused, and write source, tests and documentation in English.
- Preserve existing saves, history and earned cosmetics. New saved fields need
  defaults, defensive parsing and malformed-save tests.
- Keep uniform number odds and scoring intact. Test date-dependent gameplay
  with the shared game clock and explicit UTC boundaries.
- Use accessible controls and support keyboard input, small screens and reduced
  motion. Include before/after screenshots for visible changes when useful.
- Never commit credentials, tokens, personal data or service-account JSON.

Run the checks relevant to your change:

```sh
npm run verify:release
npm run build
npm run test:render
npm run verify:cloud
npx playwright test
```

Install a browser first with `npx playwright install chromium`. A preinstalled
browser can be selected using `CHROMIUM_PATH`. Some Linux environments also need
Playwright's system dependencies (`npx playwright install --with-deps chromium`).

`test:render` is required after changing `main.jsx`, `use-progress.js` or an
overlay. `verify:cloud` is required for changes to `cloud-save.js`,
`use-progress.js` or Firestore rules. Run `npm run audit:economy` for economy
changes. Hosting changes also need `npm run test:worker`; prepare the legacy
mirror with `npm run build:github-pages` and `npm run test:github-pages`.
Generated tables and bundles should come from their tools, not hand edits.

## Pull requests and releases

Describe the problem, intended behavior, compatibility implications and exact
checks run. Clearly identify anything not tested. Do not include unrelated
formatting, new dependencies or generated screenshots that the README does not
use. Export a personal save before testing destructive/reset flows.

Do not rewrite historical `src/changelog.js` entries or bump release identifiers
without a release request. Unreleased implementation notes can live separately
in `CHANGELOG.md` or `docs-source/`. Deployment, Firestore-rule publication and
merging are maintainer actions, not a side effect of a successful build.

## License status

No project-wide source-code license is currently declared. Ask the maintainer
about intended contribution and reuse permissions before substantial work; this
guide does not introduce a license or contributor agreement. Third-party assets
retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
