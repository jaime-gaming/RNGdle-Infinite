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
preview system. No new currency, RNG or roll animation pipeline is introduced.

## Weekly activities (UTC; end exclusive)

| Dates        | Activity           | Goal                           | Rewards                                      |
| ------------ | ------------------ | ------------------------------ | -------------------------------------------- |
| Dec 1–8      | First snow         | 30 even online numbers         | Frostbound, 75,000 EP, one Surge charge      |
| Dec 8–15     | Winter lights      | 12 online numbers ending in 5  | Emberlight, 100,000 EP, one Surge charge     |
| Dec 15–22    | Golem Smash        | 25,000,000 damage              | Hollow Frost, one Surge charge               |
| Dec 22–29    | Gift workshop      | 80 online numbers containing 0 | Golem Core, 150,000 EP, one Surge charge     |
| Dec 29–Jan 2 | Midnight countdown | 100 online rolls               | New Year Spark, 200,000 EP, one Surge charge |

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
