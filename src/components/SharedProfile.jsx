import React from "react";
import { ArrowRight, Eye } from "lucide-react";
import ProfileRecord, { when } from "./ProfileRecord.jsx";
import { AvatarMark } from "./LocalProfile.jsx";
import "../profile.css";

// Somebody else's profile, opened from a link. The card in the address is
// the whole source: nothing is loaded, saved or compared with the game in
// this browser. The owner's actions (export, logo, delete) do not exist here.
export default function SharedProfile({ card, onContinue, onOwnProfile }) {
  return (
    <>
      <h2 className="profile-title">
        <AvatarMark size={52} label={`${card.name} profile`} />
        {card.name}
      </h2>
      {card.prestiges > 0 && (
        <p className="profile-prestige">
          <span aria-hidden="true">✦</span> Prestige ×{card.prestiges} · the
          ladder climbed {card.prestiges === 1 ? "once" : "more than once"}
        </p>
      )}
      <div className="profile-shared-banner" role="note">
        <Eye size={15} aria-hidden="true" />
        <span>
          <strong>A shared card, read-only.</strong> This is {card.name}'s
          record as it was on {when(card.at)}
          {card.since ? `, playing since ${when(card.since)}` : ""}. Nothing
          here changes your own game.
        </span>
      </div>
      <ProfileRecord record={card} shared />
      <div className="profile-actions">
        <button className="primary-button" onClick={onContinue}>
          Roll a number <ArrowRight size={16} />
        </button>
        {onOwnProfile && (
          <button
            type="button"
            className="secondary-button"
            onClick={onOwnProfile}
          >
            My profile
          </button>
        )}
      </div>
    </>
  );
}
