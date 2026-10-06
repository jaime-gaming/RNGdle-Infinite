import React, { useEffect, useState } from "react";
import { Check, Dices } from "lucide-react";
import NumberBox from "./NumberBox";
import { formatEP } from "../roll-data";
import { restoreRoll } from "../roll-client";
import { SCRAMBLE_MS } from "../roll-timeline";
import "../draw-stage.css";

// A draw-modifying skill (Double Vision, Bedrock, Omen, Wish…) takes several
// ordinary, independent rolls and keeps the one that scores the most EP. The
// saving already commits exactly one of them — this is the part the player
// used to have to take on trust.
//
// Every draw is shown side by side while its digits land, each with the EP it
// scored. When the reveal collapses, the losers are discarded where they stand
// and the winner takes the centre: it is the only number that pays badges, EP
// and rank. Nothing here scores anything — the numbers were drawn and scored
// before the roll was committed, and the worker re-reads them from the same
// verified index.
const randomDigits = (count) =>
  Array.from({ length: count }, () => String(Math.floor(Math.random() * 10)));

function useScramble(spinning, slots, reducedMotion) {
  const [scramble, setScramble] = useState(() => randomDigits(slots));
  useEffect(() => {
    if (!spinning || reducedMotion) return;
    const timer = setInterval(
      () => setScramble(randomDigits(slots)),
      SCRAMBLE_MS,
    );
    return () => clearInterval(timer);
  }, [spinning, slots, reducedMotion]);
  return scramble;
}

export default function DrawStage({
  run,
  elapsed,
  timeline,
  reducedMotion,
  aura,
  leaving = false,
}) {
  const numbers = run.draws ?? [];
  const winner = run.number;
  const winnerIndex = Math.max(0, numbers.indexOf(winner));
  const done = timeline.digitTimes.filter((time) => elapsed >= time).length;
  const spinning = done < timeline.slots;
  const decided = elapsed >= timeline.collapse;
  const scramble = useScramble(spinning, timeline.slots, reducedMotion);
  // Each discarded draw is scored from the same verified index so the stage can
  // state what it was worth. The kept one is already scored in `run.result`.
  const [scores, setScores] = useState({});
  useEffect(() => {
    if (!numbers.length) return;
    let cancelled = false;
    (async () => {
      for (const number of numbers) {
        if (number === winner || scores[number] != null) continue;
        const scored = await restoreRoll(number).catch(() => null);
        if (cancelled) return;
        if (scored) setScores((current) => ({ ...current, [number]: scored }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // One pass per committed roll: the draws of a run never change.
  }, [run.id]);

  if (numbers.length < 2) return null;
  const pad = (number) => timeline.slots - String(number).length;

  return (
    <div
      className={`draw-stage ${decided ? "is-decided" : ""} ${leaving ? "is-leaving" : ""}`}
      style={{ "--draw-count": numbers.length }}
      aria-hidden="true"
    >
      <p className="draw-stage-label">
        <Dices size={12} aria-hidden="true" />
        {spinning
          ? `${numbers.length} independent draws`
          : decided
            ? `Best of ${numbers.length} kept`
            : `${numbers.length} draws, best kept`}
      </p>
      <ol className="draw-lanes">
        {numbers.map((number, index) => {
          const scored =
            number === winner ? run.result : (scores[number] ?? null);
          const isWinner = index === winnerIndex;
          const target = String(number);
          return (
            <li
              key={`${run.id}-${index}`}
              className={`draw-lane ${decided ? (isWinner ? "is-winner" : "is-out") : ""}`}
              style={{ "--lane-index": index, "--winner-index": winnerIndex }}
            >
              <NumberBox
                compact
                aura={aura}
                tier={scored?.tier ?? "neutral"}
                className={`draw-box ${spinning ? "is-spinning" : ""}`}
              >
                <span className="draw-digits" aria-hidden="true">
                  {Array.from({ length: timeline.slots }, (_, slot) => {
                    const landed =
                      slot >= pad(number) && slot - pad(number) < done;
                    const blank =
                      slot < pad(number) || (landed && slot - pad(number) < 0);
                    return (
                      <span
                        key={slot}
                        className={`draw-digit ${blank ? "is-blank" : ""} ${
                          landed ? "" : "is-scrambling"
                        }`}
                      >
                        {blank
                          ? "\u00a0"
                          : landed
                            ? target[slot - pad(number)]
                            : reducedMotion
                              ? "?"
                              : scramble[slot % scramble.length]}
                      </span>
                    );
                  })}
                </span>
              </NumberBox>
              <span className="draw-lane-ep">
                {scored ? `${formatEP(scored.totalEP)} EP` : "—"}
              </span>
              {decided && isWinner && (
                <span className="draw-lane-tag">
                  <Check size={11} aria-hidden="true" /> Kept
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
