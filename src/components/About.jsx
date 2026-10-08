import React from "react";
import {
  Dices,
  Medal,
  Clock3,
  ListChecks,
  ShoppingBag,
  PawPrint,
  Sparkles,
  Save,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";
import { BASE_ROLL_MS, BASE_COOLDOWN_MS, formatDuration } from "../shop-data";
import { POPULATION } from "../probability.js";
import { PETS, PET_DROP_CHANCE } from "../pets.js";
import {
  BADGE_TOTAL,
  REBIRTH_STEPS,
  REBIRTH_TOTAL,
  ROLLBACK_AFTER_PRESTIGES,
  ROLLBACK_BONUS,
  ROLLBACK_STARTER_EP,
  ULTRA_REBIRTH_STEP,
  prestigeShown,
  rebirthUnlocked,
} from "../rebirth.js";
import { SKILLS } from "../skills.js";
import { TASKS } from "../tasks.js";
import { HISTORY_LIMIT, HISTORY_WARNING } from "../history-log.js";
import { GAME_URL, formatEP } from "../roll-data";
import "../about.css";

// The old help modal was one unreadable block of text. This is the same
// information, grouped so a specific question can actually be found.
export default function About({ navigate, progress }) {
  // Rebirth explains itself only once the player has found it: before that the
  // help page stays quiet about the ladder, exactly like the game does.
  const showsRebirth = progress ? rebirthUnlocked(progress) : false;
  const steps = [
    {
      icon: Dices,
      title: "Roll a number",
      body: `Press Generate for a number between 0 and ${(POPULATION - 1).toLocaleString("en-US")}. Every value is equally likely, and repeats are perfectly possible — there is no pity counter and no streak.`,
    },
    {
      icon: Medal,
      title: "See what makes it special",
      body: `Your number is checked against ${BADGE_TOTAL} badges: patterns, famous numbers and mathematical curiosities. Each badge is worth EP, and within a family only the highest-EP badge scores.`,
    },
    {
      icon: Clock3,
      title: "Wait a little, roll again",
      body: `A reveal takes ${formatDuration(BASE_ROLL_MS / 1000)} and the cooldown that follows is ${formatDuration(BASE_COOLDOWN_MS / 1000)}. The countdown says which wait it is showing: COOLDOWN IN while the reveal is still playing, NEXT ROLL IN once the cooldown itself is running, and REVEAL IN when a boost removed the cooldown entirely. Upgrades shorten both for this run; rebirth resets them.`,
    },
  ];
  const topics = [
    {
      icon: ListChecks,
      title: "Tasks and the activity log",
      points: [
        `${TASKS.filter((task) => task.cadence === "daily").length} daily and ${TASKS.filter((task) => task.cadence === "weekly").length} weekly tasks pay EP once per reset, when you claim them on the Tasks page. Unclaimed rewards expire at reset.`,
        "Task EP lands in your wallet only. It never counts towards a rebirth, and offline rolls do not count towards tasks.",
        `The activity log keeps up to ${HISTORY_LIMIT.toLocaleString("en-US")} entries. From ${HISTORY_WARNING.toLocaleString("en-US")} History warns you and offers bulk delete, which clears a finished rebirth or the oldest entries. Bookmarked rolls and rebirth markers are never removed, and profile and Rebirth figures keep counting what leaves the log.`,
      ],
    },
    {
      icon: ShoppingBag,
      title: "The shop",
      points: [
        "Quickwind shortens the reveal to as little as 10 seconds; Clockwork shortens the cooldown to 2 seconds. Both reset at rebirth.",
        "Flywheel grants a no-cooldown roll every few rolls. Tools add Auto-Roll, archive search and offline earnings.",
        `${SKILLS.length} charged skills can be bought, won from companions or earned with a rebirth. A circle fills as you roll and the next roll fires it.`,
        "The shop is one street of shelves — skills, pace, companions, auras, tools, and offline once the Offline Roller unlocks it — with a sticky jump bar, and each shelf has its own link.",
        "Rows, not walls of cards: every item states its effect, its price and whether you already own it, and long descriptions stay folded until you ask for them.",
        "Auras are purely cosmetic. Press Set goal on the savings banner, tap any item on a shelf, and your savings towards it appear after each roll.",
        "Upgrades change timing and convenience only. They never touch your odds, your EP or your rank.",
      ],
    },
    {
      icon: PawPrint,
      title: "Companions",
      points: [
        `${PETS.length} of them, adding between ${Math.round((PETS[0].multiplier - 1) * 100)}% and ${Math.round((PETS.at(-1).multiplier - 1) * 100)}% to the EP you bank.`,
        `Buy one in the shop, or find one free at roughly 1 in ${Math.round(1 / PET_DROP_CHANCE)} rolls.`,
        "Only one companion is equipped at a time; the equipped one is the one that walks the roll screen, with its name and bonus on a plate. Swapping is free.",
        "The bonus applies to your wallet only. The number you rolled, its tier, its badges and its score are identical either way.",
        "Each companion also carries one exclusive skill. It is available while that companion is the active one and takes a slot in your rack.",
      ],
    },
    {
      icon: Sparkles,
      title: "Skills and the rack",
      points: [
        `A skill charges over its own number of completed online rolls; offline rolls never charge it.`,
        "Charging is automatic and free. Swapping skills in and out of the rack costs nothing, and four racks can be saved on the Skills shelf and put back in one click.",
        "Draw skills stack, and each one keeps a number of its own: two of them add their budgets, up to eight draws, the roll pays for every number kept, and a floor stays the strongest promise of the two. They only ever pick between numbers you genuinely rolled — each draw is an ordinary, independent roll. Wallet skills multiply banked EP alone.",
        "The rack starts at two slots and grows to four with the two Skill Bays in the shop.",
      ],
    },
    {
      icon: Sparkles,
      title: "Scores and ranks",
      points: [
        `Ranks compare your roll against all ${POPULATION.toLocaleString("en-US")} possible numbers, not against other players or your own session.`,
        "Top means the share scoring at least as much; Bottom means the share scoring at most as much. Both include ties.",
        "Labels are rounded; hover any rank to see the exact percentage and counts.",
        ...(showsRebirth
          ? [
              prestigeShown(progress)
                ? `Rebirth unlocks step by step: the first asks for a fifth of the collection and ${formatEP(REBIRTH_STEPS[0].ep)} EP earned this cycle; the final rung asks for 45% and ${formatEP(REBIRTH_STEPS.at(-1).ep)} EP. Each of the ${REBIRTH_TOTAL} steps grants an exclusive skill, a permanent +2% banked-EP bonus and 250,000 EP to start the next cycle. A prestige (the ultra-rebirth in the save) asks for half the collection and ${formatEP(ULTRA_REBIRTH_STEP.ep)} cycle EP, then adds a permanent +10% bonus and 1,000,000 starting EP. After ${ROLLBACK_AFTER_PRESTIGES} prestiges, the Rollback is the last stage, taken once: +${Math.round(ROLLBACK_BONUS * 100)}% and ${formatEP(ROLLBACK_STARTER_EP)} starting EP, and nothing comes after it. Resets clear the run, not your activity history or permanent bonuses.`
                : `Rebirth unlocks step by step: the first asks for a fifth of the collection and ${formatEP(REBIRTH_STEPS[0].ep)} EP earned this cycle; the final rung asks for 45% and ${formatEP(REBIRTH_STEPS.at(-1).ep)} EP. Each of the ${REBIRTH_TOTAL} steps grants an exclusive skill, a permanent +2% banked-EP bonus and 250,000 EP to start the next cycle. Resets clear the run, not your activity history or permanent bonuses.`,
            ]
          : []),
      ],
    },
    {
      icon: Save,
      title: "Saving and privacy",
      points: [
        "Guest play is never saved. Rolls, EP and discoveries disappear when you leave.",
        "Signing up creates a local profile in this browser and starts a clean account — nothing from guest play carries over.",
        "There is no email, password, server or leaderboard. Clearing site data deletes the save.",
        "Refreshing resumes the same committed number and deadline. Tabs on one account share a single draw and reward.",
        "Your profile shows how far you have come since the account was created, and you can export it as a card. Nothing in the game reads a card back, so a shared file can never overwrite your save.",
      ],
    },
  ];
  return (
    <div className="about">
      <section className="about-intro">
        <p className="eyebrow">WELCOME TO RNGdle INFINITE</p>
        <h2>One roll. A little possibility.</h2>
        <p>
          Generate a number and find out what makes it special. That is the
          whole game — everything else is optional.
        </p>
      </section>

      <ol className="about-steps">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={title}>
            <span className="about-step-mark" aria-hidden="true">
              <Icon size={17} />
              <b>{String(index + 1).padStart(2, "0")}</b>
            </span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="about-topics">
        {topics.map(({ icon: Icon, title, points }) => (
          <section key={title} className="about-topic">
            <h3>
              <Icon size={16} aria-hidden="true" /> {title}
            </h3>
            <ul>
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="about-fair">
        <h3>The promise</h3>
        <p>
          Nothing sold in this game improves your luck. The draw is uniform over
          all {POPULATION.toLocaleString("en-US")} numbers and is generated with
          your browser's cryptographic randomness. Scores come from a verified
          table, not from anything the page sends. Upgrades buy time and
          convenience; companions multiply banked EP only. No purchase, real or
          in-game, can change what you roll.
        </p>
      </section>

      <div className="about-actions">
        <button className="primary-button" onClick={() => navigate("roll")}>
          Let’s roll <ArrowRight size={16} />
        </button>
        <button
          className="secondary-button"
          onClick={() => navigate("changelog")}
        >
          What’s new
        </button>
      </div>

      <p className="about-footnote">
        An independent, non-commercial tribute to{" "}
        <a href="https://www.rngdle.com/" target="_blank" rel="noreferrer">
          RNGdle <ArrowUpRight size={12} />
        </a>
        . Badge references come from{" "}
        <a
          href="https://rng.cubityfir.st/badges"
          target="_blank"
          rel="noreferrer"
        >
          RNGdle Tools <ArrowUpRight size={12} />
        </a>
        , plus two Infinite-exclusive badges. Play it at{" "}
        <a href={GAME_URL} target="_blank" rel="noreferrer">
          {GAME_URL.replace("https://", "")}
        </a>
        .
      </p>
    </div>
  );
}
