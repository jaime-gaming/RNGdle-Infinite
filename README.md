# RNGdle Infinite

**Roll a number from 0 to 1,000,000. Find out what makes it special.**

RNGdle Infinite is a browser game about rolling numbers, scoring EP, discovering
badges, buying upgrades and starting over — with infinite patience, no energy
meters and no daily limit.

**[▶ Play it](https://jaime-gaming.github.io/RNGdle-Infinite/)** — free, no
account, works on desktop and mobile.

![The roll screen with a charged skill explaining itself](media/roll.png)

## Table of contents

- [How a roll works](#how-a-roll-works)
- [What makes a number special](#what-makes-a-number-special)
- [Companions](#companions)
- [Skills and the rack](#skills-and-the-rack)
- [Flywheel](#flywheel)
- [The shop](#the-shop)
- [Rebirth and ultra-rebirth](#rebirth-and-ultra-rebirth)
- [Your profile, your data](#your-profile-your-data)
- [Fairness](#fairness)
- [Saving, privacy and guests](#saving-privacy-and-guests)
- [Console save tools](#console-save-tools-optional-no-button-anywhere)
- [Settings, themes and accessibility](#settings-themes-and-accessibility)
- [Questions people actually ask](#questions-people-actually-ask)
- [Credits](#credits)
- [Running it locally](#running-it-locally)

## How a roll works

Three steps, over and over:

1. **Roll.** Press **GENERATE**. The game draws a uniformly random whole number
   between 0 and 1,000,000 — every value equally likely, including the number
   you just rolled.
2. **Score.** The number is revealed digit by digit, then its EP value, its
   rarity tier and its rank against the whole population. Every badge the number
   earns is listed with how much EP it added.
3. **Wait.** A reveal and a cooldown keep the rhythm honest. The base cycle is a
   45-second reveal plus a 60-second cooldown, and upgrades can reduce these to a
   10-second reveal and a 2-second cooldown. Both are snapshotted when you press
   the button, so buying something mid-roll never shortens the roll in flight.

Your EP is a real wallet. Roll, earn, spend it on upgrades and cosmetics, roll
faster.

![A finished roll: the number, its tier, rank, EP and badge breakdown](media/result.png)

## What makes a number special

A number earns **badges** for its digit patterns: pairs, triples, runs, mirrored
digits, repeating blocks, lucky sevens, round numbers and the two **Infinite
Originals** that exist only here (Pendulum and Last Second). Each badge is worth
EP, and only the best badge in a family counts towards the total, so 777777 pays
once rather than five times.

There are **235 badges across 18 sets**, split into six rarities from Common to
Mythic, plus the **GODLY** tier for the very top scores. The collection is
discovery-only: you see a badge only once you have earned it, and each new one
is a permanent mark on your collection page. A rebirth restarts the collection
and the run around it — and only because you decided it should.

| What you see | What it means                                                              |
| ------------ | -------------------------------------------------------------------------- |
| **Number**   | The exact number drawn this roll. It is never editable.                    |
| **Tier**     | Trash, Common, Uncommon, Rare, Epic, Anomaly, Mythic or GODLY.             |
| **Rank**     | Where this number sits in the full population of 1,000,001, ties included. |
| **EP**       | The score, added to your wallet exactly once.                              |
| **Badges**   | Everything the number earned, lowest to highest, with each EP bonus.       |

## Companions

There are **13 companions**, from Pebble at **+5%** to Ember Dragonet at
**+80%**, priced from 45,000 EP to 20,000,000 EP. You can buy one in the shop,
or find one free at roughly **1 in 250 rolls** — a lucky roll drops a random
companion you do not own yet, and it is worn automatically if you do not already
wear one.

The companion shelf is a **slideshow of cages**: one companion stands in the
middle of the stage and the arrows on either side slide to the next one, with a
rail of small cages underneath to jump straight to any friend. Each cage is
tinted with that companion's own colour, and the stage shows its bonus, its
description and its signature skill before you decide.

Only **one companion is equipped at a time** — and the equipped one is the one
on the roll screen, not just in a list: it walks the stage while you roll, with
its sign and its bonus right there, and it moves a little quicker while a number
is revealing. A companion found on a roll walks in with its own entrance before
it joins the parade. The rest wait on the shelf. The layer is decorative and
inert, and reduced motion replaces the walk with a still row.

What a companion does is deliberately narrow: it multiplies **the EP that lands
in your wallet**. The number you rolled, its tier, its badges, its score and its
rank are untouched. Two players rolling the same number always score the same;
a companion just means you reach the next upgrade sooner.

Companions can be swapped for free at any time, and each one carries an
exclusive skill. When that skill fires on a roll, the companion steps off the
stage for the duration of the roll and appears as a small mark on the corner of
your number; once the roll settles, the mark is gone and the walk continues.

## Skills and the rack

Skills are charged, one-shot effects. The rack sits in the **top-left corner of
the Roll page** — every slot is an icon inside a ring, and the ring fills as you
complete online rolls. When it is full the skill is _armed_, and **the next roll
fires it**. Hover, focus or use a screen reader to read the name, the exact
effect and the charge state.

Two things in that corner keep the arithmetic out of your head: every circle in
the Skill Row (equipped skills, companion skills, and passive EP modifiers from
companions, rebirths, ultra-rebirths and surplus) shows **what it adds** ("×2
banked EP", "+5% EP", "2 draws, best kept"), and the **Σ button** opens the
total — every equipped and companion skill with its charge, the banked-EP
multiplier with each part named (companion, rebirth, ultra-rebirth, surplus and
wallet skills), the draw plan for the next roll, and whether it is
cooldown-free. That panel is the only place the total is written out, so it is
never contradicted.

And when the roll itself applies the money, each bonus charge floats into
`Your EP balance` as a staggered animation. A plain roll states only the base
gain.

![The skill rack: the equipped and companion circles, one explaining itself on hover](media/skills.png)

Nine skills are bought in the shop — but the shelf is a **stall**: only **three
are on sale at a time**, and the trio rotates every **five minutes** like a
shop's stock. A timer on the shelf says when it refreshes, and the skills that
are out of the rotation stay listed, dimmed under a **green restock aura** with
the countdown on the button. Thirteen belong to companions (each companion teaches one
skill that exists nowhere else and only works while that companion is worn),
and six are handed out by the rebirth ladder — one per rung.

| Skill             |         Price | Charges | Effect                                                   |
| ----------------- | ------------: | ------: | -------------------------------------------------------- |
| **Surge**         |    180,000 EP |       5 | The next roll banks double EP                            |
| **Trail**         |    320,000 EP |       5 | The next roll finds companions four times as often       |
| **Bounce**        |    500,000 EP |       4 | The next roll has no cooldown (the reveal still plays)   |
| **Double Vision** |    900,000 EP |       7 | Draws two numbers and keeps the one that scores more EP  |
| **Bedrock**       |  1,600,000 EP |       6 | Redraws to at least 25,000 EP, at most four draws        |
| **Turbo**         |  2,600,000 EP |       7 | The next roll counts three times towards charging        |
| **Big Game**      |  6,000,000 EP |      11 | Redraws to at least 100,000 EP, at most five draws       |
| **Miser**         |  9,000,000 EP |       7 | The next roll banks triple EP                            |
| **Triptych**      | 12,000,000 EP |       6 | Draws three numbers and keeps the one that scores top EP |

Every effect stays inside the honest-roll rule: **a skill may touch the roll,
but never the scoring table.** Wallet multipliers only multiply banked EP, and
draw skills compare the already-verified scores of numbers actually drawn and
are capped at eight draws. When a skill fires, the effect is written into the
committed roll, so a reload, a second tab or a retry can never re-fire it or
re-roll for something better.

A draw skill does its work where you can watch it. Every draw it takes lands on
its own side of the screen **at the same time**, each with the EP it would have
banked, and when the digits settle the numbers it discards fade where they stand
while the best one is pulled into the centre and becomes the roll. Only that
number is scored, ranked and paid: the draws you did not keep are shown with
what they would have earned and then dropped, so a best-of skill never quietly
banks two rolls at once. The activity feed keeps the receipt — _best of 3
draws_ — next to the number that was kept.

The rack starts with **two slots**. Skill Bay I (**1,000,000 EP**) widens it to
three, Skill Bay II (**4,000,000 EP**) to four. Equipping, unequipping and
swapping skills is **free** — the bays are the purchase, the loadout is not.
The Skills shelf also keeps **four saved racks**: save the set you have equipped
and put the whole rack back with one click. They belong to the run, so a rebirth
clears them along with the skills that paid for them.

## Flywheel

Flywheel is the pace skill, and it lives in the same rack as a cog ring, so one
glance covers every charged effect on your account.

- **Flywheel — 450,000 EP:** four completed online rolls charge it, and the
  fifth roll keeps its full reveal but has **zero cooldown**.
- **Flywheel II — 1,500,000 EP:** two charging rolls, then a boosted third.
- **Flywheel III — 3,600,000 EP:** one charging roll, so every other roll is
  boosted.

Boosted rolls do not charge the next cycle, and offline rolls neither charge nor
consume it. A full five-roll cycle averages 93 seconds per roll at the fastest
pace before Flywheel — and with everything maxed, the average cycle is about
**11 seconds per roll**.

## The shop

`/shop` is the shop's front door: **six buttons**, one per shelf — Skills, Pace,
Companions, Auras, Offline and Tools. Each button names what the shelf is for and
carries the one number that matters on it (slots used, current reveal and
cooldown, companions found, auras owned, the EP-per-roll rate, tools owned), and
each one **opens the shelf as its own page**: `/shop/skills`, `/shop/auras` and
so on, with its own address to bookmark or share.

Above the shelves sit three **featured picks**, chosen from your tracked goal and
your wallet — your goal, something within reach, a cosmetic — and each one is
only a doorway to the shelf that sells it, with a meter against its price. A
shelf keeps its own **sticky bar**: search, the same filters and a button back to
all shelves. Filters only narrow what is drawn (`22 of 56 on this shelf`), and a
description is held to three lines so a shelf reads as a list, not a wall of
text. Every shelf reads **from the cheapest item upwards**, and the Skills shelf
adds its own twist: a rotating stall that only ever stocks three shop skills at
a time, with a countdown to the next trio. The old `#shop` bookmark still works,
and `#auras` lands on that shelf.

![The shop front door: six shelf buttons with their numbers and three featured picks](media/shop.png)
![One shelf as its own page: the breadcrumb, sticky bar and aura cards](media/shop-shelf.png)

| Shelf          | What it sells                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Skills**     | Nine charged effects (three on sale at a time, restocked every 5 minutes), the two skill bays, and the Flywheel tiers |
| **Pace**       | Quickwind (shorter reveals) and Clockwork (shorter cooldowns), one level at a time                                    |
| **Companions** | Thirteen companions from 45,000 EP, or free if a roll drops one                                                       |
| **Auras**      | Twenty-two cosmetic looks in four families, each family its own page, equipped one at a time                          |
| **Offline**    | The Offline Roller plus clocks and vaults: rolls earned while away                                                    |
| **Tools**      | Auto-Roll, Persistence Core and the Archive Lens history search                                                       |

The Auras shelf is the one long shelf, so it is split into **four families** —
sky and starlight, earth and weather, made things, deep and dark. `/shop/auras`
is the index: one **banner per family**, each in that family's own gradient and
its own typeface, wearing its three best looks as live previews. A banner is a
door, not a decoration — it opens the set as a page of its own,
`/shop/auras/celestial` — and every look on that page is a card with a **chip of
its two colours** next to its name and a live preview of the box wearing it, so
the page shows what you are buying before you spend anything.

A shelf also never shows a card you cannot act on: an upgrade that waits behind
another purchase stays off the shelf entirely until that purchase is made, so
every card on screen is the next step of its chain.

**Auto-Roll is an ability**, not a settings switch: once bought it appears in
the corner rack as its own circle. One click arms it, another click stands it
down, and the ring and its label state whether it is running, paused or off. It
never skips a reveal, a cooldown or a draw, and without Persistence Core it
starts off again after a reload.

Every purchase is confirmed, costs EP once, and never changes odds or scores.
The 56 products in the catalogue come to 151.12 M EP, and the most expensive of
them costs 18 M. Everything you buy is yours for the rest of the cycle: a
rebirth puts the whole catalogue back on the shelf.

## Rebirth and ultra-rebirth

Rebirth is a **ladder**, not a single wall, and it is driven by the run you are
playing: a slice of the badge collection **and** EP the current cycle has
earned. No shop purchase is ever part of a rung.

| Rung | Required | Badges |   Cycle EP | Granted skill  |
| ---: | -------: | -----: | ---------: | -------------- |
|    1 |      20% |     47 |    250,000 | Reborn Drive   |
|    2 |      25% |     59 |    600,000 | Reborn Tempo   |
|    3 |      30% |     71 |  1,500,000 | Reborn Depth   |
|    4 |      35% |     83 |  3,500,000 | Reborn Vault   |
|    5 |      40% |     94 |  7,500,000 | Reborn Omen    |
|    6 |      45% |    106 | 15,000,000 | Reborn Paragon |

The EP is **a mark of progress, not a spend**: it is never taken from your
wallet, so buying an upgrade can never lock you out of a rung — the wallet
empties on rebirth either way. It counts the EP this cycle's rolls scored, so
every cycle pays its own way — and the gate is a **floor, not a ceiling**:
whatever the cycle scores _over_ the gate is **surplus**. A quarter of the
surplus joins the new wallet as starting EP (a 100,000 gate taken with
1,000,000 in the cycle carries +225,000 EP into the next run), and every full
5,000,000 of overshoot banks a permanent **+1% to banked EP**, capped at +5%
on any single rebirth. Overshooting is rewarded, never wasted.

Rebirth says **nothing at all before it unlocks**: no header entry, no counter,
no teaser, and a direct link to `/rebirth` simply goes home. From **15% (36
badges)** the ring appears in the header and fills towards whichever half of
the rung is furthest from done — badges or EP — turning green and reading
_Ready_ when both are met. The rebirth page then lays the whole thing out: the
six rungs with the badges and EP each one asks for and the rewards it grants,
the figures for the current step, what a rebirth keeps, what it resets, and the
permanent bonuses with their own explanation. Each rebirth:

- **grants** the rung's skill plus a **permanent, stackable +2% to banked
  EP** (up to +12% with the ladder complete),
- **pays a new cycle**: **250,000 EP for every rung you have climbed** waits in
  your wallet when the next one starts (250,000 after the first, 1,500,000 after
  the sixth), so a fresh run begins rolling instead of waiting on a slow first
  minute,
- **resets the run**: the badge collection, **every purchase** (upgrades,
  auras, tools and shop skills), the companions and the EP in your wallet, and
- **keeps the account**: the activity history, the rebirths you have done with
  the skills they granted, every permanent bonus, the EP you have earned
  all-time, and your profile.

![The rebirth ladder: collection progress, the current rung, one blurred preview and the steps beyond](media/rebirth.png)

Finish the sixth rung and **ultra-rebirth** unlocks: the same clean slate,
taken from **50% of the collection (118 badges) and 30,000,000 EP** earned in
the cycle, in exchange for a **permanent, stackable +10% to banked EP** for
every ultra-rebirth, and a cosmetic mark next to your profile. It pays its own
**1,000,000 EP** on top of the rungs you keep — a ladder-complete ultra-rebirth
starts the next cycle with 2,500,000 EP — and any EP the cycle scored over the
ultra's 30,000,000 gate pays the same surplus dividend as a rung. It costs the
run, never the account — history, rebirths and their +2% rung bonuses all
stay. Both resets require typing the word (`REBIRTH` or `ULTRA`) and cannot be
undone.

Taking one is **a moment**: a full-screen ceremony of rays, confetti and a
slamming title plays over the page (still and invisible under reduced motion,
pointer-transparent either way), and the account keeps the exclusives that
come with it — a **gold halo behind every roll**, the **Transcendent** title
on the profile, and the **ultra legacy panel** on the rebirth page: your
ultra count, the permanent bonus broken down, which exclusives are wearing,
and **a note from the developer** left at the top of the ladder for whoever
climbed it.

The page speaks in your own numbers before you commit: how long this cycle has
run, how many rolls and badges it produced, its best number and the EP those
rolls earned, and a preview of the three things the button does — what you hand
back, what you keep, and what you gain, starting sum included.

Nothing is ever erased from the activity history. Every cycle stays readable
roll by roll, and a **dotted line** marks the point where a rebirth handed the
run back and a new cycle began: _Rebirth 1_, _Rebirth 2_, _Ultra-rebirth 1_.

## Your profile, your data

Signing up is just a local name for a save file in your browser — no email, no
password, no server. The name comes with a **logo**: upload any picture and it
is squared, shrunk to 256 px and stored inside the save itself, so your account
wears its own icon in the header, on the profile page and on the exported card —
and, because it is part of the save, it **travels with a device link** to your
other browser. Nothing is uploaded anywhere; the picture never leaves the page
it was picked on.

Your profile page shows **how far you have come**, all of
it derived live from your save and your activity log rather than stored twice:
rolls completed, online vs offline, EP earned all-time, EP spent, your best
roll, badges discovered, companions found free, skills unlocked, charged effects
fired, Flywheel boosts used, rebirths and ultra-rebirths, and the date of your
first and latest entry.

![The profile page with the derived history and the PNG account card export](media/profile.png)

**Export my data** downloads a PNG account card of your save — your account
name, your biggest roll and your key account stats — so you can view, share or
keep it somewhere safe. The card is deliberately **one-way**: nothing in the
game imports it, so a shared card can never overwrite the game you are playing.
The only import that exists is the console-only one for a raw save file, under
[Console save tools](#console-save-tools-optional-no-button-anywhere) — it
replaces the save on purpose, and it is never a button in the interface.
Delete account & progress remains the only way to remove it.

## Fairness

- **Uniform randomness.** Every number from 0 to 1,000,000 is equally likely,
  drawn with the browser's cryptographic RNG and rejection sampling. There is no
  number editor, no preset picker, no seed setting and no pity counter.
- **Honest scoring.** The EP value, badges and tier of a number are fixed by the
  rules, and ranks are computed against the complete population of 1,000,001
  numbers with ties included. Nothing a player owns changes what a number is
  worth.
- **Bonuses stay in the wallet.** Companions, wallet skills and the rebirth and
  ultra-rebirth bonuses multiply only the EP that lands in your wallet. Scored
  EP, tier and rank are identical for everyone.
- **No pay-to-win, no real money.** Everything costs in-game EP only.
- **One-shot effects stay one-shot.** A charged skill is snapshotted into the
  committed roll, so nothing can be re-fired, re-rolled or double-credited.

RNGdle Infinite is a frontend-only game: saves live in your browser, which means
a determined person can edit them, exactly as with any offline game. The
architecture is built to make accidental loss — not cheating — the real
difficulty: atomic saves, single-credit receipts, cross-tab locks and
failed-write recovery.

## Saving, privacy and guests

- **Guests can play everything**, but guest progress is not saved and clears on
  reload. Registration starts a clean, genuinely saved account.
- **A local profile** saves your wallet, discoveries, upgrades, aura, companions,
  skills, cooldowns and activity log in `localStorage` on this browser and
  origin only.
- **Device links, live, with no database of yours.** Settings → _Link devices_
  creates one URL (`?sync=ROOM.KEY`) that joins a second browser to the same
  account, live in both directions: buy on the phone, watch it land on the PC.
  The link's own page in Settings — _Settings → Device link_ — holds the
  technical half: the relay in use, whether rooms are kept on disk or only in
  memory, this device's room and id, how many devices are in the room, and when
  the last save crossed the wire. The status pill breathes while a device is
  being waited for and rings once every time a save crosses the wire; _Send now_
  flushes the current save without waiting for the next change. Anyone holding
  the link plays the account, so treat it like a password.

  **Either device may be closed.** The relay writes each room to its own store
  and only then answers a device, so a save made while the other browser is off
  waits there instead of being lost: play on the phone, close it, open the PC a
  day later and you are handed the newer save. The save itself still never
  leaves the players' browsers — the relay keeps the room (the state blob it was
  given) so it can hand it back later, and a room nobody touches is swept away
  after a month. The dev server hosts the relay on `/__sync` with its store in
  `.cache/sync-rooms`; a static deployment runs `npm run relay` and points the
  game at it with `?relay=https://host:8787` or the relay field on the device
  link page. Not sure the relay is reachable? _Send now_ shows the queue and the
  save is kept locally until it gets through.
  ![The device link page in Settings](media/devices.png)

- **No relay at all: link by hand.** Under _No relay? Link by hand_, one device
  copies the account into a **peer code** and the other adopts it — the whole
  save, one blob of text, no server anywhere. It is the same save the relay
  would forward, moved by clipboard or chat instead.
- **Multi-tab safe.** Tabs share one save through storage events and Web Locks:
  simultaneous rolls join the same draw, purchases cannot overspend, and a
  second rebirth cannot apply twice.
- **Nothing is sent anywhere.** No analytics, no accounts, no backend, no
  runtime CDN. The only network requests are the game's own asset files — and,
  only when you explicitly create a device link, the relay forwarding your
  save between your own devices.

### Console save tools (optional, no button anywhere)

A save can also be moved as a plain JSON file, without any link at all. The
commands live in the browser console on purpose — importing **replaces the
whole save**, so it should take a deliberate act, not a stray click:

```js
__importData(); // opens the file picker (raw save or a v0.3 Profile JSON export)
__importData(jsonText); // imports a save from a JSON string, File/Blob or object
__exportSave(); // copies the current save to the clipboard as JSON
__downloadSave(); // downloads the current save as rngdle-<name>-<date>.json
```

Imports are validated before anything is written: a save from v0.1, v0.2 or
v0.3 (raw or the v0.3 profile snapshot) is migrated, anything unreadable is
rejected with the exact reason on the console, and the current save is left
untouched when a file is refused. When the browser blocks its own file dialog
— an iframe, a missing user gesture — the command falls back to an ordinary
file input instead of dead-ending. `__exportSave()` never claims a copy the
browser refused: if the clipboard is blocked it says so and prints the save.
`__importSave()` still works and points at the new name.

## Settings, themes and accessibility

Settings are presentation only — nothing there changes odds, EP, prices or
timings. You can turn desktop notifications and the ready chime on, force
reduced motion, hide the skill bar, hide the goal recap, use compact EP numbers,
skip purchase confirmations, or make the Auto-Roll ability start armed. The
device link is the one entry that opens **its own page** (the summary card in
Settings stays a summary, with a link to the full technical view).

Light, dark and system themes are all real palettes with contrast-checked
colours. Reduced motion completes a reveal instantly while still reserving the
full committed deadline, so accessibility never becomes a shortcut. The whole
game is keyboard reachable, dialogs trap focus, and every result is announced to
screen readers.

## Questions people actually ask

**Is there a roll limit?** No. Roll as often as you like, as long as the reveal
and cooldown have finished. No energy, no waiting rooms, no paywall.

**Can I get a specific number on purpose?** No. There is no seed, editor or
preset, and none is planned.

**Does a companion make my rolls luckier?** No — it multiplies banked EP only.
Trail and Drift are the exception by design: they raise the chance of finding a
companion, and they use their own random sample rather than the roll's.

**Do offline rolls count towards skills and Flywheel?** No. Offline rolls pay
their EP and count in your history, but charging is online-only.

**What happens to my purchases when I rebirth?** They go back on the shelf:
a rebirth restarts the run — every purchase, the companions, the badge
collection and the EP in your wallet. Your history, your rebirths, the skills
the ladder granted and every permanent bonus stay. An ultra-rebirth gives the
same fresh start after half the collection and 30,000,000 cycle EP, for a
bigger bonus.

**Is this the official RNGdle?** No. It is an independent recreation, built from
public rules and reference data. See credits below.

## Credits

- [RNGdle](https://www.rngdle.com/), created by Cam / sparrowpatch. RNGdle
  Infinite is an independent frontend recreation and is not the official
  service.
- [RNGdle Tools](https://rng.cubityfir.st/) and its [badge
  catalogue](https://rng.cubityfir.st/badges), [Luck
  page](https://rng.cubityfir.st/luck) and [documented roll
  timings](https://github.com/CubityFirst/rngdle-ep-calculator) — the pinned
  full-range indexes the scoring and ranks are derived from.
- [Box Lab](https://rng.cubityfir.st/beta/boxes) for the scoring-box palette
  reference.
- Badge artwork: [Twemoji](https://github.com/jdecked/twemoji), Twitter, Inc.
  and other contributors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Fonts: Inter and Space Mono via Fontsource, SIL Open Font License.
- Interface icons: [Lucide](https://lucide.dev/), ISC license, plus the
  original marks and companion artwork drawn for this project (one 24×24 grid,
  one stroke weight) in `src/components/game-icons.jsx`.

## Running it locally

For anyone who wants to tinker:

```sh
npm install
npm run dev             # http://localhost:5173 (hosts the device-link relay too)
npm test                # Playwright suite (needs a Chromium binary)
npm run audit:economy   # reproducible price and roll-distribution audit
npm run build           # production build
npm run pages:publish   # rebuild docs/, which is what GitHub Pages serves
npm run relay           # standalone memory-only relay for a static deployment
```

The screenshots in this README are generated from the running game rather than
made by hand:

```sh
npm run dev
CHROMIUM_PATH=/path/to/chrome npm run screenshots   # writes media/
npm run vendor:emoji                                # check local emoji artwork
```

To use an existing Chromium binary instead of downloading one, set
`CHROMIUM_PATH`. The publishing flow, data preparation and the deeper
implementation notes live in `src/data/README.md` and the code itself.
