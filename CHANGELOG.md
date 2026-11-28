## Christmas village expansion

- Add eleven contiguous mini-event gatherings and eight four-day rotating commissions alongside the five weekly chapters and Advent calendar.
- Add ingredient collections, adjacent-digit ribbon work, odd delivery routes, divisible-by-three bell routes, zero hunts, a Christmas feast and New Year farewell.
- Add Now & next / Full calendar views, ingredient stamps and expiring event claims to the Tasks ready counter.
- Rework event presentation around evergreen, cranberry ribbon, brass trim, warm lights and animated ornaments, with opaque panels and reduced-motion support.
- Award bounded Snowcoins and banked boosts; refund 10 Snowcoins on the four-parcel gift-drive claim. Reduce triple Surge/Overdrive bundle prices to 40/55, retaining historical 60/90 receipts.
- Add a reproducible seasonal balance audit and regression tests for every new activity, rotation boundaries, claim persistence, mobile and reduced motion.

## Event Tasks, solid surfaces and seasonal companions

- Move all RNGmas missions, live activities and weekly claims to Tasks → RNGmas; keep calendar, rewards, market and exchange in Shop.
- Make seasonal content surfaces opaque and keep disabled controls readable.
- Redraw Lantern Moth and Parcel Kit; add Holly Corvid and Snow Owl skins to timed gatherings, for five winter companion skins total.
- Disable Christmas mode outside December 1–January 2 UTC, guard settings changes, and remove seasonal effects at the exact boundary without reloading.

## Winter layout and reward correction

- Raise bookmarks to 25, with ten initially visible on profiles and expandable pins.
- Replace the long event stack with section navigation and focused mission/schedule/reward views, based on historical RNGween organization.
- Offer eight event auras and three illustrated companion skins; use boosts instead of surplus mission auras. Preserve previously earned rewards.
- Restore the Christmas switch icon and make the Legacy notice explain gameplay closure and the save-transfer check directly.
- Extend profile Firestore rules to validate up to 25 pins (not deployed here).

# Changelog

The complete player-facing release history is maintained in
[`src/changelog.js`](src/changelog.js) and rendered on the game's
[Changelog page](https://rngdle-infinite.jaime-gaming.com/changelog).
Historical entries are preserved as published; they are not a specification of
current event rules. See the [README](README.md#rngmas-2026) for the current
RNGmas schedule and claim windows.

## Development branch notes — not a new release

This branch retains the `v0.6.1` identifier. These notes do not claim a production
deployment, new tag or new published release.

- RNGmas, Frostfall and the winter pass launch December 1 UTC and end January 2.
  The event has five different weekly activities and daily-only advent claims.
- Golem damage uses the visible main roll number, not the retired multiplier
  mechanic. Only the first chapter is Golem Smash.
- The market and EP-to-Snowcoin exchange open in different weeks. Their one-time
  purchases, conversion limits and chapter rewards persist with the save.
- Chapters are expandable zones. Christmas mode is in Appearance → TEMPORAL,
  independent of color theme, with responsive scenery and reduced-motion support.
- Cloud fallback/recovery and maintenance draw paths are hardened. An expired
  maintenance window no longer remains active solely because of stale flags.
- Launch preparation adds three special tasks, four scheduled live activities and
  ten more event cosmetics. Christmas mode is reduced to its name and switch.
- The GitHub Pages Legacy build shows a countdown to December 1 at 00:00 Madrid,
  then replaces gameplay with closure/migration information and a private backup
  utility. The current root-domain game continues.
- Repository onboarding, contribution guidance, security reporting and
  third-party license notices are documented without changing the code license.

Implementation and validation details are in
[`docs-source/rngmas-design.md`](docs-source/rngmas-design.md) and
[`docs-source/fix5-verification.md`](docs-source/fix5-verification.md).

## November 28 readiness review

- Unify notice/dialog, Tasks, Shop, winter pass and aura previews under one opaque Christmas-village style and shared headers.
- Add read-only pre-launch event browsing, explicit reward sources and claim windows, a shared event guide and second-by-second countdowns.
- Wake seasonal and global Tasks clocks on exact daily/chapter/gathering UTC boundaries, not a later polling tick; use the game clock for default Advent and chapter action timestamps.
- Improve the first six Advent EP rewards with a bounded 37,500 EP increase, preserving all earlier claimed receipts and preventing reclaims.
- Add dedicated November 28/opening/handover/reward-persistence checks and an operator checklist distinguishing the release, UTC event opening and Madrid Legacy shutdown.
