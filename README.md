# RNGdle Infinite

**Roll a number from 0 to 1,000,000. Find out what makes it special.**

A free browser game about rolling numbers, earning EP, collecting badges and
buying upgrades. Play as a guest, save a named profile on this device, or link a
Cloud Account to keep your progress across devices.

<p align="center">
  <a href="https://jaime-gaming.github.io/RNGdle-Infinite/"><strong>▶ Play now</strong></a>
  · works on desktop and mobile · play locally or save across devices
</p>

![The roll screen](media/roll.png)

---

**Contents:** [How to play](#how-to-play) · [Ways to grow](#ways-to-grow) ·
[Online accounts and cloud saves](#online-accounts-and-cloud-saves) ·
[Legacy records](#legacy-records) · [FAQ](#faq) · [Credits](#credits)

## How to play

1. **Roll.** Press **GENERATE** and get a random whole number from 0 to
   1,000,000.
2. **Score.** The number earns EP from its patterns: pairs, runs, lucky sevens
   and many more. Each pattern is a **badge** for your collection.
3. **Wait.** A short reveal and a cooldown keep things paced. Upgrades make
   both shorter.
4. **Spend.** EP is your wallet. Buy upgrades, companions and skills to roll
   faster and earn more.

![A finished roll with its badges](media/result.png)

## Ways to grow

|                 | What it does                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Companions**  | Thirteen friends that multiply the EP you earn. Wear one at a time; some can be found for free while you roll.                         |
| **Skills**      | Charged effects that fire on your next roll: double EP, extra draws, no cooldown and more. Skills never change how a number is scored. |
| **Tasks**       | Daily and weekly goals that pay EP.                                                                                                    |
| **Badges**      | A collection to fill, with rarities from Common to GODLY. Roll an exact number twice and the box wears a déjà vu look.                 |
| **Rebirth**     | Start over with a permanent bonus.                                                                                                     |
| **Prestige**    | A bigger fresh start, once you own half the collection and have earned 30 million EP in the cycle.                                     |
| **Rollback**    | A secret that appears after three prestiges. It can be repeated.                                                                       |
| **Fresh start** | Offered once you have three prestiges: wipe the run and the ladder, keep your profile and every aura.                                  |
| **Profile**     | Best roll, pinned rolls, key stats and what you wear; Cloud Accounts get a direct public profile link.                                 |

![The skill rack](media/skills.png)

## Online accounts and cloud saves

Cloud Account is optional. Play as a guest, name your profile to save the
current session here, then link a Cloud Account later. Sign in with Google or
email/password; Google accounts need a password before play. Connect Google to
an existing account from your profile.

Cloud profiles use a clean `/profile/your-name` link, with no `?card=…` token.
It opens a read-only summary of the name, avatar, best/pinned rolls and key
stats—not the private save or account email. Local profiles can share a
read-only snapshot card; older snapshot links still work.

Migration moves only the current browser save to Firebase; existing Supabase
accounts and cloud saves are not migrated. If the Firebase account has no save,
an unowned local save can be imported. For saves with the same game profile, a
clearly dominant save can sync automatically only when both saves are from the
same reset generation. If generations differ, the game explains the reset
history and asks which complete save to keep—neither the later generation nor
the cloud copy wins automatically. Within one generation, a clear lead in
measured game progress can decide the sync; ties or mixed/incomparable progress
always require your choice. The comparison uses gameplay progress such as
earned EP, rebirth/prestige/reset milestones, rolls, achievements, owned
upgrades, skills, companions and best roll—not file size, timestamps, history
length or profile preferences. Different game profiles are never merged; when
profile IDs differ, choose one complete save. A save owned by another Firebase
account is never imported. Before an overwrite, the displaced version is kept
under **Settings → Cloud conflict recovery**. Signing out keeps the local
browser copy. Deleting the game save removes that Firebase user's Firestore
document and public profile, but not the Firebase sign-in itself.

### Firebase setup

The app is configured for Firebase project `rngdle-infinite-jg`. The public
Web SDK values are in `.env.production` for production/GitHub Pages builds and
`.env.development` for `npm run dev`; `.env.example` documents the same values.
They are public client configuration, not service-account credentials. The
game uses Firebase Authentication and Cloud Firestore, not Firebase Analytics
or Cloud Storage. Firestore stores a compressed private save at
`player_saves/{uid}` and a small public profile summary at
`public_profiles/{normalized-username}`. The public collection allows direct
reads by profile URL but denies collection listing.

In Firebase Authentication, Email/Password must be enabled; Google sign-in is
already enabled for project `rngdle-infinite-jg`. For another project, enable
both providers and add `jaime-gaming.github.io` and `localhost` to its
authorized domains. Create a Firestore database in a European region and
publish [`firestore.rules`](firestore.rules). Those rules keep each private save
read/write restricted to its Firebase UID; public profiles are readable one
name at a time, cannot be listed, and can only be written or removed by their
owner. Do not use open/test-mode rules or a service-account key in the browser.

Existing Supabase accounts and cloud saves remain in the old project; they are
not migrated. Linking only applies to a profile saved in this browser. The old
Supabase migration file is historical and is not used by this build.

`npm run dev` loads the tracked `.env.development`, so Cloud Account sign-in is
configured in the normal development server. For a different Firebase project,
copy `.env.example` to ignored `.env.local` and replace the public values.
Production builds and `npm run pages:publish` use `.env.production`. If Firebase
is unavailable, choose **Continue locally**; cloud sign-in can be linked later.
Playwright uses `npm run dev:test` with Firebase disabled.

## Legacy records

RNGween 2026 gameplay and its seasonal interface have retired. The event shop,
tasks and World are no longer playable. Permanent auras already earned,
Hexbound, Hollow Lantern, attendance stamps and historical activity remain in
old saves; these rewards are preserved as legacy cosmetics and are not available
to earn again.

## FAQ

**Is there a roll limit?** No. Roll as often as you like once the reveal and
cooldown finish.

**Can I pick a specific number?** No. There is no seed, editor or preset.

**Does a companion make my rolls luckier?** No. Companions multiply the EP you
earn. Your number and its badges stay the same.

**Do offline rolls count?** Yes: they pay EP and show up in your history. Skills
only charge while you are online, though.

**What happens if I clear my browser data?** If you have an online account and a
cloud save, sign in again to restore it. Otherwise the browser-only save is
removed with the site data. Export a profile card for a record, but it cannot be
imported into a game save.

**Is this the official RNGdle?** No. It is an independent recreation; see the
credits below.

## Credits

- [RNGdle](https://www.rngdle.com/) by Cam / sparrowpatch — the original idea.
- [RNGdle Tools](https://rng.cubityfir.st/) and its badge catalogue, the source
  of the scoring and rank data.
- Badge artwork by [Twemoji](https://github.com/jdecked/twemoji),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Fonts: Inter and Space Mono (SIL Open Font License). Icons: [Lucide](https://lucide.dev/).
