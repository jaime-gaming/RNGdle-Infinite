# RNGdle Infinite

**Roll a number from 0 to 1,000,000. Find out what makes it special.**

RNGdle Infinite is a browser game about rolling numbers, earning EP, collecting
badges and buying upgrades. No energy meter, no daily limit, no account.

**[▶ Play it](https://jaime-gaming.github.io/RNGdle-Infinite/)** — works on
desktop and mobile.

![The roll screen](media/roll.png)

## The basics

1. **Roll.** Press **GENERATE**. You get a random whole number from 0 to
   1,000,000.
2. **Score.** The number earns EP from its patterns (pairs, runs, lucky sevens
   and more). Each pattern it has is a **badge**.
3. **Wait.** A short reveal and a cooldown keep things paced. Upgrades make
   both shorter.

Your EP is your wallet. Spend it on upgrades, companions and skills to roll
faster and earn more.

![A finished roll with its badges](media/result.png)

## Ways to grow

- **Companions.** Thirteen friends that multiply the EP you earn. Wear one at a
  time; you can find some for free while you roll.
- **Skills.** Charged effects that fire on your next roll: double EP, extra
  draws, no cooldown and more. Skills never change how a number is scored.
- **Tasks and badges.** Goals to chase and a collection to fill.
- **Rebirth.** Start over with a permanent bonus.
- **Prestige.** A bigger fresh start, once you have half your collection and
  30 million EP earned in the cycle.
- **Rollback.** Appears after three prestiges, and you can repeat it.

![The skill rack](media/skills.png)

## RNGween (October 21 – November 3, 2026)

A one-off Halloween event. Dates are UTC and come from the website's clock,
not your device, so changing the phone's date does nothing.

- **The look.** Webs, lanterns and a dark palette, with a Halloween switch in
  the Appearance menu. It only shows on the dark theme.
- **Limited Shop.** Trade 10,000 EP for 1 Pumpkoin (no refunds) and spend them
  on a pumpkin companion, a seasonal skill, a World key and the four event
  auras. Unspent coins vanish when the shop closes.
- **Halloween tasks (Oct 25–31).** Four goals — 200 rolls, 40 Rare+, 5,000,000
  EP and 18 task claims, all online — unlock **Jack-o'-Glow, Phantom Veil,
  Witchfire** and **Blood Moon** for free. The other days, hourly tasks pay
  Pumpkoins instead: four at a time, one hour each, no skips.
- **RNGween World.** Talk to the Reaper at the foot of the Roll page. Four zones
  with their own badges and points, fragments that forge a key to the Valley
  of Horrors, and a hidden **Hexbound** aura for rolling 6666. World rolls give
  no ordinary EP, charges or task credit.
- **What stays.** Auras you collected are yours forever, through Rebirth,
  Prestige and Rollback. Everything else retires on November 4 and the auras
  never return.

Also new: a roll shows at most six numbers, each with its own aura, and the
mobile skill rack can be folded away.

## Your progress

Your save lives in your browser. To play on another device, open
**Settings → Device link** on one device and open the link (or scan the QR code)
on the other. Anyone with the link can play your account, so keep it private.

Once two devices are linked and both are open, they stay in sync. The device
that created the link is the main one: it runs rolls and purchases, so the two
screens never fight over the same roll.

![The device link page](media/devices.png)

## FAQ

**Is there a roll limit?** No. Roll as often as you like once the reveal and
cooldown finish.

**Can I pick a specific number?** No. There is no seed, editor or preset.

**Does a companion make my rolls luckier?** No. Companions multiply the EP you
earn. Your number and its badges stay the same.

**Do offline rolls count?** They pay their EP and show in your history, but skills
charge only while you are online.

**Is this the official RNGdle?** No. It is an independent recreation. See the
credits below.

## Credits

- [RNGdle](https://www.rngdle.com/) by Cam / sparrowpatch — the original idea.
- [RNGdle Tools](https://rng.cubityfir.st/) and its badge catalogue, the source
  of the scoring and rank data.
- Badge artwork by [Twemoji](https://github.com/jdecked/twemoji),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Fonts: Inter and Space Mono (SIL Open Font License). Icons: [Lucide](https://lucide.dev/).

## Run it locally

You need Node.js and npm.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # the Playwright suite (needs a Chromium binary)
npm run build   # production build
```

To try the Halloween event outside its dates, `npm run dev:rngween` starts the
dev server with the clock set to October 26, 2026. These previews never reach
production.

Want to know more? [`AGENTS.md`](AGENTS.md) has the project map and the
conventions for contributors and coding agents.
