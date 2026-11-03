import React from "react";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { pathForProfile, pathForPage } from "../router.js";
import "../legal.css";

const CONTACT_EMAIL = "jaimegamingpro@gmail.com";
const REPOSITORY_URL = "https://github.com/jaime-gaming/RNGdle-Infinite";
const UPDATED = "Last updated 3 November 2026.";

function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

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
              ? "What the game stores, how it is used, and the choices you have."
              : "The terms for playing and using an account."}
          </p>
        </div>
      </div>
      {privacy ? (
        <article className="legal-page">
          <p>
            You can play locally or link a Cloud Account. This game does not
            serve advertisements or use analytics. If App Check is configured,
            Google reCAPTCHA Enterprise may process device and request signals
            to help assess abuse; it is used for security, not advertising. The
            game stores the data needed to run, save and restore your progress.
          </p>
          <section>
            <h2>What is stored</h2>
            <p>
              A local profile, game progress, appearance choices, settings and
              earlier save copies are stored in this browser. Those copies stay
              on this device for a limited time and are not uploaded as cloud
              history. Clearing this site’s storage removes them. You can review
              available copies in Settings → Restore save. If you link a Cloud
              Account, Firebase handles sign-in and stores your game save and
              account settings so you can continue on another device. Account
              details protect save ownership; your email is not shown on a
              public profile. Google provides sign-in when you choose it and may
              process security signals for additional request checks when that
              feature is configured.
            </p>
            <p>
              Google and Firebase provide authentication and database
              infrastructure. Their handling of information is also subject to
              their own terms and privacy notices. The game does not need your
              Google password and does not receive it.
            </p>
          </section>
          <section>
            <h2>Public profiles are optional</h2>
            <p>
              A Cloud profile is shown publicly only when you choose to share
              it. Anyone with its name or link can then see your username and
              logo, profile creation and update dates, best roll, up to ten
              pinned rolls, roll and all-time EP totals, discovered badges,
              rebirth and prestige counts, favorite roll tier, aura and
              companion. A public summary does not include your Firebase UID,
              email, wallet, detailed history or full save. You can turn off
              public sharing again from your profile page. Renaming a public
              profile moves its link; old links do not redirect. A progress card
              is shared only when you choose to copy its link.
            </p>
          </section>
          <section>
            <h2>Your controls and rights</h2>
            <p>
              Use your <a href={pathForProfile("")}>profile</a> to export or
              delete game progress and to change public-profile visibility. Use
              Cloud Account to delete the Firebase account and its online save
              as well. Deleting a game profile alone does not delete the
              sign-in. Copies owned by a different or unverified account are
              kept separate and are not imported into your account.
            </p>
            <p>
              You can ask for access, correction, deletion, a copy of your
              information, or raise a privacy concern by emailing{" "}
              <ContactLink />. You may also contact the relevant data-protection
              authority; if you are in Spain, that includes the AEPD. Please
              avoid posting account details in public repository issues.
            </p>
          </section>
          <section>
            <h2>Availability and changes</h2>
            <p>
              Cloud access depends on your connection and Firebase service
              availability. Local saves remain on this device and can be
              uploaded after you sign in and reconnect. We may update this
              notice when the game or its data handling changes.
            </p>
          </section>
          <p className="legal-contact">
            Project contact: <ContactLink /> ·{" "}
            <a href={REPOSITORY_URL}>Project repository</a>
          </p>
          <p className="legal-updated">{UPDATED}</p>
        </article>
      ) : (
        <article className="legal-page">
          <p>
            RNGdle Infinite is a free game for entertainment. Rolls are random,
            repeats are possible, and no result or reward is guaranteed. There
            are no cash prizes or cash-out.
          </p>
          <section>
            <h2>Playing and accounts</h2>
            <p>
              You may play using a named local profile or link a Cloud Account.
              Keep your sign-in details private and use only accounts and saves
              you are authorized to access. Local data can be lost if you clear
              this site’s stored data. Earlier copies, when available, can be
              reviewed from Settings → Restore save. Cloud access requires a
              connection and may be temporarily unavailable.
            </p>
          </section>
          <section>
            <h2>Public sharing</h2>
            <p>
              A Cloud profile appears publicly only if you choose to share it.
              You decide what profile information to make visible and where to
              share the link. You can turn public sharing off from your profile.
            </p>
          </section>
          <section>
            <h2>Fair use and availability</h2>
            <p>
              Do not interfere with the game, attempt to access another player’s
              data, misuse accounts, or make requests intended to disrupt the
              service. Features may change, and uninterrupted availability
              cannot be promised. Nothing in these terms removes rights that
              cannot be limited under applicable law.
            </p>
          </section>
          <p>
            Questions about these terms? Email <ContactLink /> or visit the{" "}
            <a href={REPOSITORY_URL}>RNGdle Infinite project</a>.
          </p>
          <p className="legal-updated">{UPDATED}</p>
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
