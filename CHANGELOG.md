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
