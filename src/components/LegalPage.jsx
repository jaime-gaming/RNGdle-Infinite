import React from "react";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { pathForProfile, pathForPage } from "../router.js";
import "../legal.css";

const REPOSITORY_URL = "https://github.com/jaime-gaming/RNGdle-Infinite";

export default function LegalPage({ page, navigate }) {
  const privacy = page === "privacy";
  const title = privacy ? "Privacy & Rights" : "Terms of Service";
  const Icon = privacy ? ShieldCheck : FileText;

  return (
    <>
      <button className="back-link" onClick={() => navigate("roll")}>
        <ArrowLeft size={14} /> Back to rolling
      </button>
      <div className="page-heading">
        <div className="page-icon">
          <Icon size={25} />
        </div>
        <div>
          <h1>{title}</h1>
          <p>
            {privacy
              ? "Your data and the choices you have."
              : "A few ground rules for playing."}
          </p>
        </div>
      </div>
      {privacy ? (
        <article className="legal-page">
          <p>
            Guest progress lasts for the session. A named profile stays on this
            device; a Cloud Account can also back it up online. Google is used
            only if you choose Google sign-in. This game does not use ads or
            in-game tracking.
          </p>
          <section>
            <h2>Public profiles</h2>
            <p>
              Online profiles have a public page. It shows your display name,
              avatar and a short game summary—not your email or full progress.
              Anyone who knows the profile name can open it. Anyone with a link
              you share can view that saved card.
            </p>
          </section>
          <section>
            <h2>Your choices</h2>
            <p>
              Open your <a href={pathForProfile("")}>profile</a> to download or
              delete your game data. Deleting a game profile does not delete the
              Google or Cloud Account used to sign in. Clearing this game’s
              saved data on this device removes the local copy, but not your
              online copy.
            </p>
            <p>
              For a request these controls do not cover, contact the project
              owner through the <a href={REPOSITORY_URL}>project repository</a>.
              Please do not post personal information in public issues.
            </p>
          </section>
          <p className="legal-updated">Last updated 27 October 2026.</p>
        </article>
      ) : (
        <article className="legal-page">
          <p>
            RNGdle Infinite is a free game for entertainment. Rolls are random;
            repeats are possible and no result or reward is guaranteed. The game
            has no cash prizes or cash-out.
          </p>
          <section>
            <h2>Accounts and saves</h2>
            <p>
              You can play as a guest, save a named profile on this device, or
              link a Cloud Account. Local progress can be lost if you clear this
              game’s saved data on this device. Public online profiles can be
              viewed by anyone who knows the profile name. Do not use another
              person’s account or try to access their progress.
            </p>
          </section>
          <section>
            <h2>Fair use</h2>
            <p>
              Do not interfere with the game, its accounts or other players’
              data. Features and availability may change. Nothing here limits
              rights that cannot be limited under applicable law.
            </p>
          </section>
          <p>
            Questions about these terms? Visit the{" "}
            <a href={REPOSITORY_URL}>RNGdle Infinite project</a>.
          </p>
          <p className="legal-updated">Last updated 27 October 2026.</p>
        </article>
      )}
      <nav className="legal-switch" aria-label="Legal pages">
        <a href={pathForPage(privacy ? "tos" : "privacy")}>
          {privacy ? "Terms of Service" : "Privacy & Rights"}
        </a>
      </nav>
    </>
  );
}
