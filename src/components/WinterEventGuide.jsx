import React from "react";
import { pathForPage, pathForSubpage } from "../router.js";

export default function WinterEventGuide({ status }) {
  return (
    <details
      className="winter-event-guide"
      aria-label="How RNGmas works"
      open={!status.active}
    >
      <summary>
        <strong>How RNGmas works</strong>
        <span>Tasks for missions · Shop for calendar & market</span>
      </summary>
      <div>
        <strong>
          {status.active ? "Your winter route" : "Plan your winter route"}
        </strong>
        <p>
          {status.active
            ? "Main online rolls progress several activities together. Auto-Roll counts; offline and extra skill rolls do not."
            : "The November 28 update is a preview. Playing starts December 1 at 00:00 UTC; Christmas mode remains off until then."}
        </p>
      </div>
      <ol>
        <li>
          <strong>Roll & complete</strong>
          <span>
            Tasks → RNGmas: three season missions, rotating commissions,
            gatherings and weekly chapter claims.
          </span>
        </li>
        <li>
          <strong>Claim on time</strong>
          <span>
            Collect each mission inside its UTC window. In Shop, claim today's
            Advent door before midnight. No catch-up.
          </span>
        </li>
        <li>
          <strong>Keep your rewards</strong>
          <span>
            Eight event auras and five companion skins stay yours. Boosts are
            banked for you to activate; Snowcoins buy market rewards until
            January 2.
          </span>
        </li>
      </ol>
      <div className="winter-guide-links">
        <a
          className="secondary-button"
          href={`${pathForPage("tasks")}?event=rngmas`}
        >
          Event missions in Tasks →
        </a>
        <a className="secondary-button" href={pathForSubpage("shop", "rngmas")}>
          Calendar, collection & market →
        </a>
      </div>
      <p className="winter-guide-fine">
        No altered odds or cooldowns. Base companions are required to equip
        their skins. Unspent event currency expires with the market.
      </p>
    </details>
  );
}
