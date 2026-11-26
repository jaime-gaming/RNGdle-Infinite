# RNGmas 2026 implementation notes

## Reuse from RNGween

From commit `d131975`:

- `src/rngween-hourly.js`, `mainHourlyTally`: extracted `rolls`, `even`,
  `ends5` and `contains0` rules into `winterRollTally`.
- `src/components/RngweenTasks.jsx`: reused the preview, progress, reward
  and explicit collection states for weekly activity cards.
- `src/rngween.css`: reused mission grid, card, preview and meter styles
  in `src/winter-missions.css`, with neutral winter class names.

The existing NumberBox and RNGween-derived aura ornaments remain the reward
preview system. The Snowcoin wallet uses the same reducer and saved-roll settlement. No new RNG or roll animation pipeline is introduced.

## Weekly activities (UTC; end exclusive)

| Dates        | Activity           | Goal                                    | Rewards                                                   |
| ------------ | ------------------ | --------------------------------------- | --------------------------------------------------------- |
| Dec 1–8      | Golem Smash        | 25,000,000 damage                       | Hollow Frost, 50 coins, 2 Overdrive charges               |
| Dec 8–15     | Christmas market   | Buy from three distinct stalls          | Emberlight, 15 coins, 2 Spark charges                     |
| Dec 15–22    | Snowcoin exchange  | Convert 1,000,000 EP into 100 Snowcoins | Frostbound, 25 coins, 2 Surge charges                     |
| Dec 22–29    | Gift workshop      | 80 online numbers containing 0          | Golem Core, 35 coins, 150,000 EP, 2 Surge charges         |
| Dec 29–Jan 2 | Midnight countdown | 100 online rolls                        | New Year Spark, 50 coins, 200,000 EP, 3 Overdrive charges |

First Light now ends December 1, when Frostfall and the RNGmas pass open.
All end times are exclusive. The event ends January 2 UTC. Advent doors and
the Christmas star retain their individual daily claim windows.

## Snowcoin wallet and services

One primary settled online roll earns one Snowcoin; Auto-Roll counts, extra
skill results and offline rolls do not. The wallet caps at 1,000,000. Lifetime
earnings use a safe integer and do not decrease when buying an offer.

The market opens December 8 and remains open until January 2. Each offer can
be bought once: Spark Injector (10 coins), Surge Capacitor (15), Overdrive Cell
(20), three Surge charges (60) and three Overdrive charges (90). The cheapest
three purchases require 45 ordinary rolls. Bought charges persist after the
event. Buying from three distinct stalls during the market chapter permits its
aura claim; purchases later in the event do not restore that expired claim.

The exchange opens December 15 and stays open until January 2. One Snowcoin
costs 10,000 EP, integer amounts only, maximum 200 coins across the event. The
conversion is one-way, has no refund and does not count as earned EP or cycle
gate progress. Converting 100 coins during the exchange chapter permits its
aura claim. The 200-coin maximum supplies a 2-million-EP sink; the single-charge offers provide a limited seasonal discount against the ordinary
250,000-EP daily offer.
Earned coins reduce those effective costs, bounded by one purchase per stall.
There is no EP cash-out; unspent coins remain saved but unusable after closing.

Wallet, lifetime earnings, exchanged total and distinct purchase IDs have
defaults, defensive parsers and malformed-save tests. They survive reloads and
resets. Cloud comparison uses monotonic earnings/exchange totals and purchase
sets, not the decreasing spendable wallet. Different profiles never merge.
Legacy chapter IDs, completion receipts and auras stay intact.

Only the primary settled online result counts, once per receipt. Auto-Roll
counts, additional skill results and offline catch-up do not. Claims require
the chapter to be active and cannot repeat. Event EP does not fund cycle gates.
Calendar claims remain daily-only UTC. Its EP grants are reduced to one tenth
of the initial values. Previously collected auras remain permanent.

## Golem economy and integrity

Preparing a strike costs 100,000 EP before the next draw. It is rejected if a
roll is pending, another strike is prepared, or the golem is finished. The next
normal committed number supplies damage directly: 0–1,000,000, average 500,000.
No critical multipliers or pity strikes. Zero still consumes the preparation.

The 25-million target represents roughly 50 strikes and 5 million EP on average,
plus a small overshoot allowance. Random outcomes do not promise a fixed cost.
The former third-week golem had 3 million HP, about 60,700 average damage per
25,000-EP strike before guaranteed hits. The new expected EP commitment is
substantially higher. Normal roll rewards remain unchanged.

Preparation and progress survive reloads and resets. Land and claim before the
chapter closes. Existing roll commitments and receipt protection own settlement.
The legacy `golems` map and reward IDs remain save receipts. New `count`, `armed`
and `lastNumber` fields have defaults, defensive parsing and malformed tests.
Cloud comparison includes counts. Reaching the target remains claimable after
reload; collection delivers both aura and boost exactly once.

## Upstream integration and preview

Changes represented by `f4c8313`, `b65c1e7` and merge `7f3cc4c` were integrated
into the session branch as `37db67e`, named `v0.6fix3`. Main was not rewritten.
This event branch keeps version identity `v0.6.1`. Incoming Firestore rule changes
are preserved; publishing client assets does not deploy those rules.

The dev preview clock starts December 17, 2026 at 00:00 UTC. Production ignores
that override, and automated browser fixtures override it independently.

## Season-specific pass rewards and patch 4

RNGmas rewards resolve through `passRewardsFor("season-2")`, not the First Light
track: Snowglobe at free level 10, Midnight Carillon at premium level 20, and
Polar Crown at premium level 30. These are permanent cosmetic auras, separate
from both First Light and weekly event rewards. EP payouts are approximately
85% of First Light's values (rounded to 1,000 EP) as a conservative retained payout budget. Existing
boost types and charge counts stay unchanged. No new save fields are needed.
Claims, receipt repair, readiness, automatic previous-season delivery and UI use
the saved season identity. Previously owned cosmetics are never removed.

Upstream patch `d513747` is applied on top of the prior bug-fix-3 integration:
Cloud verification failures now offer recovery actions, retry the status check,
and distinguish offline, expired sign-in, provider and server failures. The
client, Worker, API handling, render checks and outage tests are carried over.
The event keeps its `v0.6.1` version label. Main's history was rewritten upstream;
only the new patch delta was applied to avoid replaying old releases.

## December 1 redesign verification

Validated locally on the session branch, without a production deployment:

- 138 focused Playwright tests passed across `winter-economy`, `rngmas`,
  `status-banner`, `battle-pass`, `season-identity`, `cloud-save`,
  `cloud-fallback`, `cloud-client-integrity`, `pass-season-rewards` and
  `auth-gate` specs.
- Wallet tests cover UTC transitions, capped integer exchanges, insufficient EP,
  overflow, duplicate market purchases, defensive parsing, reloads, Fresh Start,
  legacy completion receipts, cross-profile isolation and a 360px phone flow
  through exchange, purchase and the activity log.
- `test:render` passed, including the real status store/progress hook regression:
  active maintenance commits a local roll without a Cloud roll request or an
  outage marker. Existing restriction and fallback recovery checks still pass.
- `verify:cloud`, `verify:release` and `audit:economy` passed. The generic economy
  audit covers the base ladder; the seasonal rates and caps are checked by the
  wallet specs and documented above.
- Production build, Worker browser smoke, GitHub Pages build and Pages smoke
  passed. The existing large-chunk advisory remains non-fatal.

Maintenance was investigated as a hypothesis, not confirmed against production
telemetry. The pre-existing access gate already allowed gameplay during
maintenance, but its draw path still requested Cloud verification. That path
now commits locally. An expired scheduled window also overrides stale
`in_progress`/`under_maintenance` flags, while backups, publishing and deletion
remain paused during active maintenance. No account security policy, Firestore
rule, live deployment or release label was changed.

## Expandable zones and seasonal appearance

The event now has an Advent square and a winter trail with five expandable
chapter zones. Native details/summary controls provide keyboard and touch access.
The live chapter opens by default, while other zones show their schedule, aura
preview and full reward bundle. Claim buttons appear only in the active chapter.
An unlocked market/exchange remains usable inside its older zone until closing.
A collection passport shows already collected chapter auras; the market's five
stamp slots derive directly from one-time purchase receipts.

The visual direction combines RNGween's mission cards, aura scenes and explicit
collection with Black Friday's offer-card and stamp-passport structure, inspected
from `d131975` and `eac2300`. It does not restore either retired event's gameplay,
branding, temporary inventory or pricing. Market cards show genuine charge
counts, effect duration and Snowcoin price, without invented before-prices.

Christmas mode is always in Appearance → TEMPORAL. Its switch and description
explain the seasonal decoration independently of the color theme. Settings stay
on this device, rather than falsely promising cross-device setting sync. All
screen sizes retain ornaments; phone/tablet variants reduce sizes and opacity
instead of removing the winter scene. The preferences remain usable outside the
event, but decoration still appears only within the UTC event window.

Chapter rewards now add 175 Snowcoins in total and use three different boost
types, rather than five identical Surge charges. Coins are earned directly into
the existing wallet with the completion receipt, capped at the wallet limit;
lifetime earnings remain monotonic. No EP-to-Snowcoin rate, base price or roll
odds were changed. Old claims do not receive a second payout and old cosmetics
remain owned. Existing event EP does not fund cycle gates. No save fields were
added for this redesign.

### Zone redesign verification

- 140 focused Playwright tests passed across `winter-zones`, `winter-economy`,
  `rngmas`, `battle-pass`, `pass-season-rewards`, `routing-theme`,
  `settings-notifications`, `mobile-bar` and `cloud-save`.
- New coverage checks 360px phones, 768px tablets and 1440px desktops; visible
  scenery, the TEMPORAL switch, persistence, Space/Escape keyboard operation,
  keyboard chapter expansion, expired claims versus still-open stalls,
  reduced-motion styles, live reward collection, legacy receipts and atomic
  safe-integer/wallet-cap handling.
- `test:render` now mounts the actual five-zone `WinterChapters` component in
  place of the former static roadmap. It passed, together with `verify:cloud`,
  `verify:release` and the base `audit:economy` check.
- Production build, Worker browser smoke, GitHub Pages build and Pages smoke
  passed. The existing non-fatal large-chunk advisory remains.
- Manual browser screenshots were reviewed for the desktop trail, mobile
  market and mobile Appearance menu. The sandbox preview remains December 17
  UTC. No production deployment or release-label change was performed.
