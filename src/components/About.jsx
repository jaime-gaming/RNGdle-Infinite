import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Dices,
  Medal,
  Save,
  ShoppingBag,
} from "lucide-react";
import { BASE_ROLL_MS, BASE_COOLDOWN_MS, formatDuration } from "../shop-data";
import { POPULATION } from "../probability.js";
import { BADGE_TOTAL, rebirthUnlocked } from "../rebirth.js";
import { PETS } from "../pets.js";
import { gameUrlForLocation } from "../site-links.js";
import "../about.css";

export default function About({ navigate, progress }) {
  const gameUrl = gameUrlForLocation();
  const showsRebirth = progress ? rebirthUnlocked(progress) : false;
  const steps = [
    {
      icon: Dices,
      title: "Roll",
      body: `Generate a number from 0 to ${(POPULATION - 1).toLocaleString("en-US")}. Every number is equally likely, and repeats happen.`,
    },
    {
      icon: Medal,
      title: "Collect",
      body: `${BADGE_TOTAL} badges reward patterns, famous numbers and mathematical curiosities. Only the highest-value badge in each family adds EP.`,
    },
    {
      icon: Clock3,
      title: "Build your run",
      body: `At the start, a reveal takes ${formatDuration(BASE_ROLL_MS / 1000)} and the cooldown ${formatDuration(BASE_COOLDOWN_MS / 1000)}. Spend EP on upgrades, skills and companions to change your pace.`,
    },
  ];
  const topics = [
    {
      icon: ShoppingBag,
      title: "Make progress",
      points: [
        "Daily and weekly tasks reward EP. Claim them before they reset.",
        `${PETS.length} companions boost the EP you bank. Auras are cosmetic, and upgrades never change the odds.`,
        showsRebirth
          ? "Rebirth starts a new run for permanent bonuses; your aura collection stays."
          : "Collect badges and earn EP to unlock Rebirth.",
      ],
    },
    {
      icon: Save,
      title: "Choose how to save",
      points: [
        "Guest progress lasts for the session. Continue locally and name a profile to keep it on this device.",
        "Link a Cloud Account whenever you want a backup across devices.",
        "Public profiles show a short summary, not your email or full save.",
      ],
    },
  ];

  return (
    <div className="about">
      <section className="about-intro">
        <h2>How to play</h2>
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

      <p className="about-fair">
        Every roll is independent, and every number has the same chance. Nothing
        you buy changes the odds.
      </p>

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
        An independent tribute to{" "}
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
        . Play it at{" "}
        <a href={gameUrl} target="_blank" rel="noreferrer">
          {gameUrl.replace("https://", "")}
        </a>
        .
      </p>
    </div>
  );
}
