import React from "react";
import {
  Dices,
  Medal,
  Clock3,
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
import { BADGE_TOTAL, REBIRTH_TOTAL, REBIRTH_VISIBLE_AT } from "../rebirth.js";
import { SKILLS } from "../skills.js";
import { GAME_URL } from "../roll-data";
import "../about.css";

// The old help modal was one unreadable block of text. This is the same
// information, grouped so a specific question can actually be found.
export default function About({ navigate }) {
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
      body: `A reveal takes ${formatDuration(BASE_ROLL_MS / 1000)} and the cooldown that follows is ${formatDuration(BASE_COOLDOWN_MS / 1000)}. The countdown shows the cooldown itself. Upgrades shorten both, permanently.`,
    },
  ];
  const topics = [
    {
      icon: ShoppingBag,
      title: "The shop",
      points: [
        "Quickwind shortens the reveal; Clockwork shortens the cooldown. Both are permanent and one-time.",
        "Flywheel grants a no-cooldown roll every few rolls. Tools add Auto-Roll, archive search and offline earnings.",
        `${SKILLS.length} charged skills can be bought, won from companions or earned with a rebirth. A circle fills as you roll and the next roll fires it.`,
        "The shop is split into shelves — skills, pace, companions, auras, offline and tools — with a jump bar, and each shelf has its own link.",
        "Auras are purely cosmetic. Pick a goal and your savings towards it appear after each roll.",
        "Upgrades change timing and convenience only. They never touch your odds, your EP or your rank.",
      ],
    },
    {
      icon: PawPrint,
      title: "Companions",
      points: [
        `${PETS.length} of them, adding between ${Math.round((PETS[0].multiplier - 1) * 100)}% and ${Math.round((PETS.at(-1).multiplier - 1) * 100)}% to the EP you bank.`,
        `Buy one in the shop, or find one free at roughly 1 in ${Math.round(1 / PET_DROP_CHANCE)} rolls.`,
        "The bonus applies to your wallet only. The number you rolled, its tier, its badges and its score are identical either way.",
        "Each companion also carries one exclusive skill. It is available while that companion is the active one and takes a slot in your rack.",
      ],
    },
    {
      icon: Sparkles,
      title: "Skills and the rack",
      points: [
        `A skill charges over its own number of completed online rolls; offline rolls never charge it.`,
        "Charging is automatic and free. Swapping skills in and out of the rack costs nothing.",
        "Draw skills only ever pick between numbers you genuinely rolled — each draw is an ordinary, independent roll. Wallet skills multiply banked EP alone.",
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
        `Rebirth unlocks step by step: its icon appears at ${Math.round((REBIRTH_VISIBLE_AT / BADGE_TOTAL) * 100)}% of the collection and the first step asks for half of it. Each of the ${REBIRTH_TOTAL} steps raises the bar by ten points, up to the whole collection, and an ultra-rebirth at the very top starts everything over for a permanent bonus. No purchase is ever required for it.`,
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
        "Your profile shows how far you have come in this cycle, and you can export it as a file. There is no import — a file can never overwrite the game.",
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
