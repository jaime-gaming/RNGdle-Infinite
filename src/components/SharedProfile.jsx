import React from "react";
import { ArrowRight, Eye } from "lucide-react";
import ProfileRecord, { when } from "./ProfileRecord.jsx";
import { AvatarMark } from "./LocalProfile.jsx";
import "../profile.css";

// Somebody else's profile, opened read-only. Legacy card URLs carry a fixed
// snapshot; a direct cloud URL loads the owner's latest published summary.
// Neither view reads, changes or compares the visitor's game save.
export default function SharedProfile({
  card,
  live = false,
  onContinue,
  onOwnProfile,
}) {
  return (
    <>
      <h2 className="profile-title">
        <AvatarMark
          avatar={card.avatar || undefined}
          size={52}
          label={`${card.name} profile`}
        />
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
          {live ? (
            <>
              <strong>A public profile.</strong> This is
              {` ${card.name}`}'s latest published record, updated{" "}
              {when(card.at)}
              {card.since ? `, playing since ${when(card.since)}` : ""}. It
              shows a profile summary, not the private game save.
            </>
          ) : (
            <>
              <strong>A saved profile card.</strong> This is {card.name}'s
              record as it was on {when(card.at)}
              {card.since ? `, playing since ${when(card.since)}` : ""}. Nothing
              here changes your own game.
            </>
          )}
        </span>
      </div>
      <ProfileRecord record={card} shared live={live} />
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
