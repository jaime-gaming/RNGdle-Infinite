import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ChevronRight, KeyRound, X } from "lucide-react";
import { rngweenCalendar } from "../rngween.js";
import { RNGWEEN_WORLD_KEY } from "../rngween-limited.js";
import {
  rngweenValleyUnlocked,
  worldState,
  worldZoneById,
} from "../rngween-world-zones.js";
import { REAPER_TOPICS, reaperDialogue } from "../rngween-reaper.js";
import { useModalDialog } from "../use-modal-dialog.js";
import { useMotionPreference } from "../use-settings.jsx";
import { useTypewriter } from "../use-typewriter.js";
import ReaperFigure from "./ReaperFigure.jsx";
import { Pumpkoin } from "./RngweenShop.jsx";
import "../rngween-reaper.css";

// A dialogue choice is presentation. Purchases still use the same saved,
// calendar-verified account action and an explicit confirmation.
export default function ReaperDialog({
  progress,
  now,
  open,
  onClose,
  onAction,
  onWorld,
  onTasks,
  onShop,
  openSignup,
  phaseId = null,
}) {
  const [topic, setTopic] = useState("greeting");
  const [turn, setTurn] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const dialog = useModalDialog(open);
  const reduced = useMotionPreference();
  const calendar = rngweenCalendar(now);
  const limited = progress.rngweenLimited;
  const world = worldState(limited);
  const challenge = rngweenValleyUnlocked(limited);
  const canForge =
    world.fragments.graveyard && world.fragments["haunted-house"];
  const live = calendar.limitedPhase === "active" && !limited?.retired;
  const wallet = limited?.pumpkoins ?? 0;
  const price = RNGWEEN_WORLD_KEY.pumpkoinPrice;
  const zone = worldZoneById.get(phaseId);
  const dialogue =
    topic === "key"
      ? {
          title: "The key",
          lines: [
            `${price.toLocaleString("en-US")} Pumpkoins and the Valley opens for the rest of the event. No refunds, no aura, no Hexbound. Just the door.`,
          ],
        }
      : reaperDialogue(progress, now, topic, phaseId);
  const text = dialogue.lines.join("\n\n");
  const typed = useTypewriter(
    text,
    open,
    reduced,
    `${phaseId}:${topic}:${turn}`,
  );
  useEffect(() => {
    if (open) {
      setTopic("greeting");
      setError("");
      setTurn((value) => value + 1);
    }
  }, [open, phaseId]);
  function close() {
    if (!busy.current) onClose();
  }
  function reply(id) {
    if (busy.current) return;
    typed.finish();
    setTopic(id);
    setError("");
    setTurn((value) => value + 1);
  }
  function leave(callback) {
    if (!busy.current) {
      close();
      callback?.();
    }
  }
  async function buyKey() {
    if (busy.current || typed.typing || !live || challenge || canForge) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onAction({
        type: "buy-rngween-limited",
        id: RNGWEEN_WORLD_KEY.id,
      });
      if (result?.ok) {
        setTopic("greeting");
        setTurn((value) => value + 1);
      } else
        setError(
          result?.message ?? "The key was not bought. Nothing was spent.",
        );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return createPortal(
    <dialog
      className="reaper-scene-dialog"
      ref={dialog}
      aria-labelledby="rngween-reaper-title"
      data-reaper-scene={phaseId ?? "gate"}
      style={{ "--reaper-accent": zone?.accent ?? "#adcebb" }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (
          typed.typing &&
          event.key === "Enter" &&
          event.target.tagName !== "BUTTON"
        ) {
          event.preventDefault();
          typed.finish();
        }
      }}
    >
      {open && (
        <div
          className={`reaper-scene${reduced ? " reaper-scene-reduced" : ""}`}
        >
          <div className="reaper-scene-backdrop" aria-hidden="true">
            <span className="reaper-scene-moon" />
            <span className="reaper-scene-mist" />
            <svg viewBox="0 0 1100 600" preserveAspectRatio="xMidYMax slice">
              <path
                d="M0 547q155-97 315-32t300-34 485 33v86H0Z"
                fill="#14111b"
              />
              <g fill="none" stroke="#514254" strokeWidth="4">
                <path d="m57 573 29-249-34-78m28 145 59-61m-68 155-43-61M1051 588l-31-262 47-70m-40 141-56-70m63 142 41-42" />
              </g>
              <g fill="#333040" stroke="#8c738c">
                <path d="M171 567v-43a18 18 0 0 1 36 0v43Zm684 1v-53a22 22 0 0 1 44 0v53Z" />
              </g>
              <g stroke="#91baa9" opacity=".4">
                <path d="M189 520v28m-7-20h14M877 514v32m-8-21h16" />
              </g>
            </svg>
          </div>
          <header className="reaper-scene-header">
            <span>RNGween 2026</span>
            <span>
              {zone
                ? `Phase 0${zone.phase} · ${zone.name}`
                : "The Reaper's Gate"}
            </span>
            <button
              className="reaper-close"
              aria-label="Close Reaper dialogue"
              disabled={pending}
              onClick={close}
            >
              <X size={19} />
            </button>
          </header>
          <aside className="reaper-character" aria-label="Reaper portrait">
            <span className="reaper-portrait-orbit" aria-hidden="true" />
            <div className="reaper-sketch-paper">
              <ReaperFigure variant="sketch" speaking={typed.typing} />
            </div>
            <span className="reaper-character-caption">Keeper of the gate</span>
            <span className="reaper-character-signature" aria-hidden="true">
              The Reaper
            </span>
          </aside>
          <section className="reaper-conversation">
            <h2 id="rngween-reaper-title" className="reaper-speaker-name">
              The Reaper
            </h2>
            <span className="reaper-chapter-title">{dialogue.title}</span>
            <div
              className="reaper-dialogue-text"
              data-typing={typed.typing ? "true" : "false"}
              onClick={typed.finish}
            >
              <p aria-hidden="true">
                {typed.visible}
                <i
                  className={
                    typed.typing
                      ? "reaper-writing-cursor"
                      : "reaper-writing-cursor is-finished"
                  }
                />
              </p>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {text}
              </span>
            </div>
            {!typed.typing && dialogue.trials && (
              <ul className="reaper-trial-list" aria-label="Aura tasks">
                {dialogue.trials.map((mission) => (
                  <li
                    key={mission.id}
                    className={mission.complete ? "is-complete" : ""}
                  >
                    <span>
                      <strong>{mission.title}</strong>
                    </span>
                    <span>
                      {mission.complete && <Check size={13} />}
                      {mission.count.toLocaleString("en-US")} /{" "}
                      {mission.goal.toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {topic === "key" ? (
              <section className="reaper-key-contract">
                <p>
                  You have <Pumpkoin size={15} />
                  {wallet.toLocaleString("en-US")} Pumpkoins.
                </p>
                <div className="reaper-scene-actions">
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => reply("greeting")}
                  >
                    Not now
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      typed.typing ||
                      pending ||
                      !live ||
                      challenge ||
                      canForge ||
                      wallet < price ||
                      !progress.profile
                    }
                    onClick={buyKey}
                  >
                    {pending
                      ? "Saving…"
                      : `Buy the key · ${price.toLocaleString("en-US")}`}
                  </button>
                </div>
              </section>
            ) : (
              <section
                className="reaper-player-turn"
                aria-label="Your reply"
                data-reply-ready={!typed.typing}
              >
                <div className="reaper-reply-choices">
                  {zone && (
                    <button
                      disabled={typed.typing || pending}
                      aria-pressed={topic === "aura"}
                      onClick={() => reply("aura")}
                    >
                      How do I get {dialogue.aura?.name ?? "this aura"}?
                      <ChevronRight size={13} />
                    </button>
                  )}
                  {REAPER_TOPICS.filter(
                    (choice) => !(zone && choice.id === "world"),
                  ).map((choice) => (
                    <button
                      key={choice.id}
                      disabled={typed.typing || pending}
                      aria-pressed={topic === choice.id}
                      onClick={() => reply(choice.id)}
                    >
                      {choice.label}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                  {live &&
                    progress.profile &&
                    !challenge &&
                    !canForge &&
                    wallet >= price && (
                      <button
                        disabled={typed.typing || pending}
                        onClick={() => reply("key")}
                      >
                        <KeyRound size={13} />
                        I'll buy a key.
                        <ChevronRight size={13} />
                      </button>
                    )}
                </div>
                <div className="reaper-scene-actions">
                  {live ? (
                    <>
                      <button
                        className="primary-button"
                        disabled={typed.typing || pending}
                        onClick={() => leave(onWorld)}
                      >
                        Enter RNGween World <ArrowRight size={15} />
                      </button>
                      {!progress.profile && (
                        <button
                          className="secondary-button"
                          disabled={typed.typing}
                          onClick={() => leave(openSignup)}
                        >
                          Create a saved profile
                        </button>
                      )}
                      {topic === "trials" && calendar.phase === "active" && (
                        <button
                          className="secondary-button"
                          disabled={typed.typing || pending}
                          onClick={() => leave(onTasks)}
                        >
                          Show me the tasks
                        </button>
                      )}
                      {topic === "reward" && (
                        <button
                          className="secondary-button"
                          disabled={typed.typing || pending}
                          onClick={() => leave(onShop)}
                        >
                          See Hexbound in Shop
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={pending}
                      onClick={close}
                    >
                      Back to rolling
                    </button>
                  )}
                </div>
                {live && !challenge && canForge && (
                  <p className="reaper-forge-reminder">
                    Both fragments are ready. Forge your key inside the World.
                  </p>
                )}
              </section>
            )}
            {error && (
              <p className="reaper-scene-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
