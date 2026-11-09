import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  BookOpen,
  Dices,
  Medal,
  Save,
  ShoppingBag,
} from "lucide-react";
import { POPULATION } from "../probability.js";
import { rebirthUnlocked } from "../rebirth.js";
import { PETS } from "../pets.js";
import { gameUrlForLocation } from "../site-links.js";
import { pathForPage } from "../router.js";
import "../about.css";

export default function About({ navigate, progress }) {
  const gameUrl = gameUrlForLocation();
  const showsRebirth = progress ? rebirthUnlocked(progress) : false;
  const steps = [
    {
      icon: Dices,
      title: "Roll",
      body: `Tap Generate to roll a number from 0 to ${(POPULATION - 1).toLocaleString("en-US")}. Any number can show up again.`,
    },
    {
      icon: Medal,
      title: "Collect",
      body: `Collect badges for patterns, famous numbers, and curious details. Each discovery adds to your collection.`,
    },
    {
      icon: Clock3,
      title: "Build your run",
      body: "Spend EP on upgrades, skills, and companions to shape your run. They can change your pace and rewards, but never the odds.",
    },
  ];
  const topics = [
    {
      icon: BookOpen,
      title: "Understand a roll",
      points: [
        "The number is committed before the reveal begins. Reloading resumes the same draw; it never gives a second chance at the result.",
        "Each matching badge contributes to the scored EP. Your companions and wallet bonuses can increase what you bank without changing the number or its rarity.",
        "Wait for the reveal and cooldown before the next draw. Reduced motion reveals the result sooner on screen, but does not shorten that reserved time.",
        "Auto-Roll follows the same rules as a manual roll. Without Persistence Core, keep the Roll page visible for it to continue.",
      ],
    },
    {
      icon: ShoppingBag,
      title: "Make progress",
      points: [
        "Daily and weekly tasks reward EP. Claim them before they reset; calendar tasks use UTC.",
        "Set a shop goal to track a purchase without spending EP. Skills charge through play; equip the ones you want for the next draw.",
        "Bookmark up to ten rolls in History to display them on your profile. Déjà Vu marks a repeated number, not a higher rarity or an extra reward.",
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
        "Give your local profile a name and your progress stays on this device.",
        "A Cloud Account is optional if you want to continue on another device. Offline progress syncs again when you reconnect.",
        "You choose whether to share a public profile. Its logo appears only when you share it.",
        "To restore an earlier save, open Settings → Restore save and check its progress before choosing it.",
        "Local saves belong to this browser and site address. Clearing site data or using a different browser will not carry them over; use a Cloud Account for a copy across devices.",
        "Your save is stored compressed so a long history fits on this device. If saving still fails, avoid clearing site data: free space and try again, or review recovery copies in Settings.",
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

      <nav className="about-legal-links" aria-label="Privacy and terms">
        <a className="secondary-button" href={pathForPage("privacy")}>
          Privacy &amp; Rights
        </a>
        <a className="secondary-button" href={pathForPage("tos")}>
          Terms of Service
        </a>
      </nav>

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
        <a
          href="https://www.rngdle.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          RNGdle <ArrowUpRight size={12} />
        </a>
        . Badge references come from{" "}
        <a
          href="https://rng.cubityfir.st/badges"
          target="_blank"
          rel="noopener noreferrer"
        >
          RNGdle Tools <ArrowUpRight size={12} />
        </a>
        . Play it at{" "}
        <a href={gameUrl} target="_blank" rel="noopener noreferrer">
          {gameUrl.replace("https://", "")}
        </a>
        . Questions? Email{" "}
        <a href="mailto:jaimegamingpro@gmail.com">jaimegamingpro@gmail.com</a>.
      </p>
    </div>
  );
}
