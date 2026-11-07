# Black Friday 2026 — retirement checklist

The event is already date-gated: it runs from **2026-11-27 00:00 UTC** to
**2026-11-28 00:00 UTC** (exclusive). No removal or deployment should happen
before the event has finished and the owner has requested it. The production
clock is real; `VITE_BLACK_FRIDAY_PREVIEW_AT` shifts only development builds.

## Never remove player-owned data or history

- Keep the `blackout-2026` product identity, family, swatches, rendering in
  `NumberBox` and the Blackout rules in `src/black-friday.css`. The aura is a
  permanent owned cosmetic and must remain equipable, visible in the wardrobe,
  shop collection, shared display and any restored/cloud save after retirement.
- Keep parsing and round-tripping `progress.blackFriday` (`id`, `spent`,
  `stamps`, `skinEarned`), including repair and reward recovery in
  `src/progress.js` and the associated helpers/constants in
  `src/black-friday.js`. Preserve `owned` and equipped cosmetics through all
  resets and account merges. Do not reinterpret past purchases.
- Keep `sale-reward` activity parsing and display, RNGween resale receipts in
  `rngweenLimited`, cloud richness/wealth comparison and historical accounting.
  Existing saves, vault backups and other devices must still reconcile safely.
- The `rng-sale-stamps-seen-2026:<profile>` local/session storage marker is
  **presentation only**, not a save or reward. It can be ignored or removed
  when the stamp book is retired, without changing progress.

## Event-only pieces to consider removing

1. Remove the ticker, poster rails, event flag/dialog, sale shelf and stamp book
   (`src/components/SaleTicker.jsx`, event UI in `BlackFriday.jsx`, `Shop.jsx`
   and `main.jsx`) only after ensuring old direct links land safely.
2. Retire sale theme options and branding swaps in `AppearanceMenu.jsx`,
   `main.jsx`, `use-black-friday.js`, `sale-branding.js` and sale-only assets.
   A saved temporary theme must resolve safely to normal dark mode; test both
   previously selected sale themes. Preserve the permanent aura CSS.
3. Retire date-gated discounts, counter sales and stamp-awarding paths only
   after the event, tracing their consumers in `shop-data.js`, `PetShelf.jsx`,
   `gameplay-loop.js` and `progress.js`. Preserve parse-only helpers, receipt
   validation, purchase-history prices and cloud wealth calculations. Do not
   delete the complete `black-friday.js` module without separating its permanent
   definitions from event-only logic.
4. Remove preview-only controls/assets when no longer needed, and update
   `README.md`, `AGENTS.md`, and event QA. Keep the existing changelog history.

## Before merging retirement

- Test a save with all 25 stamps and Blackout equipped, a partial stamp card,
  resale receipts, sale-reward history, guest and named saves; reload, restore,
  reset and reconcile against cloud snapshots without losing cosmetics.
- Test dates immediately before, during and after the event, direct event
  URLs, normal prices, temporary-theme fallback, reduced motion and branding.
- Run `npm run build`, `npm run test:worker`, `npm run verify:cloud`,
  `npm run audit:economy`, relevant Playwright specs and `prettier --check`.
  Run the complete Playwright suite before a release merge.
- Deploy only when explicitly instructed. Firestore rules have their own
  deployment (`npm run deploy:rules`); this checklist does not authorize it.
