import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowDown,
  Check,
  ChevronRight,
  KeyRound,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { rngweenCalendar, rngweenState } from "../rngween.js";
import { RNGWEEN_WORLD_KEY } from "../rngween-limited.js";
import {
  rngweenValleyUnlocked,
  worldState,
  worldZoneById,
} from "../rngween-world-zones.js";
import {
  REAPER_TOPICS,
  reaperDialogue,
  reaperTopicForReply,
} from "../rngween-reaper.js";
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
  const [nextLine, setNextLine] = useState("");
  const [playerLine, setPlayerLine] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const dialog = useModalDialog(open);
  const reduced = useMotionPreference();
  const calendar = rngweenCalendar(now);
  const event = rngweenState(progress.tasks, now);
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
          title: "Valley Challenge Key",
          lines: [
            `Spend ${price.toLocaleString("en-US")} Pumpkoins to unlock Valley of Horrors for the whole event. The first three phases are already free; this shortcut skips finding the two fragments.`,
            "The key is never consumed on entry or rebirth. It expires after November 3 UTC. No refunds, mission completion, aura or Hexbound included. Complete the Graveyard and Haunted House badge objectives and forge it for free instead.",
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
      setPlayerLine("");
      setNextLine("");
      setError("");
      setTurn((value) => value + 1);
    }
  }, [open, phaseId]);
  function close() {
    if (!busy.current) onClose();
  }
  function reply(id, line) {
    if (busy.current) return;
    typed.finish();
    setTopic(id);
    setPlayerLine(line);
    setNextLine("");
    setError("");
    setTurn((value) => value + 1);
  }
  function submit(event) {
    event.preventDefault();
    const line = nextLine.trim();
    if (!line || typed.typing) return;
    reply(reaperTopicForReply(line, phaseId), line.slice(0, 160));
  }
  function goToReply() {
    const pane = dialog.current?.querySelector(".reaper-player-turn");
    pane?.scrollIntoView({
      block: "start",
      behavior: reduced ? "instant" : "smooth",
    });
    pane?.querySelector("input")?.focus({ preventScroll: true });
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
        setTopic("passage");
        setPlayerLine("I'll take the key.");
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
          !["INPUT", "BUTTON", "TEXTAREA"].includes(event.target.tagName)
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
            <div className="reaper-speaker">
              <span className="reaper-speaker-rule" />
              <MessageCircle size={16} />
              <h2 id="rngween-reaper-title">The Reaper</h2>
              <span className="reaper-speaker-rule" />
            </div>
            <span className="reaper-chapter-title">{dialogue.title}</span>
            {playerLine && (
              <div className="reaper-player-echo">
                <span>{progress.profile?.username ?? "You"}</span>
                <p>“{playerLine}”</p>
              </div>
            )}
            <div
              className="reaper-dialogue-text"
              data-typing={typed.typing ? "true" : "false"}
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
            {typed.typing && (
              <button className="reaper-finish-line" onClick={typed.finish}>
                Show full dialogue <ChevronRight size={14} />
              </button>
            )}
            {!typed.typing && dialogue.trials && (
              <ul className="reaper-trial-list" aria-label="Reaper trials">
                {dialogue.trials.map((mission) => (
                  <li
                    key={mission.id}
                    className={mission.complete ? "is-complete" : ""}
                  >
                    <span>
                      <strong>{mission.title}</strong>
                      <small>{mission.detail}</small>
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
            <div className="reaper-account-status">
              <span>
                {event.complete} / {event.total} aura trials complete · entry is
                free
              </span>
              <span>
                {challenge ? (
                  <>
                    <Check size={13} />
                    Valley key ready
                  </>
                ) : (
                  <>
                    <Pumpkoin size={14} />
                    {wallet.toLocaleString("en-US")} Pumpkoins
                  </>
                )}
              </span>
            </div>
            {topic === "key" ? (
              <section className="reaper-key-contract">
                <h3>Buy a Valley Challenge Key?</h3>
                <p>
                  Your wallet: <Pumpkoin size={15} />
                  {wallet.toLocaleString("en-US")} Pumpkoins
                </p>
                <div className="reaper-scene-actions">
                  <button
                    className="secondary-button"
                    disabled={pending}
                    onClick={() => reply("greeting", "Not now.")}
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
                    {pending ? "Saving the key…" : "Confirm key purchase"}
                  </button>
                </div>
              </section>
            ) : (
              <section
                className="reaper-player-turn"
                aria-label="Your reply"
                data-reply-ready={!typed.typing}
              >
                <header>
                  <div>
                    <strong>Your reply</strong>
                    <small>
                      {typed.typing
                        ? "Listen, or show the full dialogue."
                        : "Choose a line, or write one."}
                    </small>
                  </div>
                </header>
                <div className="reaper-reply-choices">
                  {zone && (
                    <button
                      disabled={typed.typing || pending}
                      aria-pressed={topic === "aura"}
                      onClick={() =>
                        reply(
                          "aura",
                          `How do I earn ${dialogue.aura?.name ?? "this phase's aura"}?`,
                        )
                      }
                    >
                      Tell me about this phase's aura <ChevronRight size={13} />
                    </button>
                  )}
                  {REAPER_TOPICS.map((choice) => (
                    <button
                      key={choice.id}
                      aria-label={choice.label}
                      disabled={typed.typing || pending}
                      aria-pressed={topic === choice.id}
                      onClick={() => reply(choice.id, choice.label)}
                    >
                      {
                        {
                          world: "The World",
                          fragments: "Key fragments",
                          speed: "Reveal speed",
                          reward: "Hexbound",
                          trials: "Aura trials",
                        }[choice.id]
                      }
                      <ChevronRight size={13} />
                    </button>
                  ))}
                  {!["greeting", "passage"].includes(topic) && (
                    <button
                      disabled={typed.typing || pending}
                      onClick={() => reply("passage", "Can I pass?")}
                    >
                      Can I pass?
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
                <form className="reaper-reply-form" onSubmit={submit}>
                  <input
                    aria-label="Your next line"
                    placeholder="Ask the Reaper…"
                    maxLength={160}
                    value={nextLine}
                    onChange={(event) => setNextLine(event.target.value)}
                    disabled={typed.typing || pending}
                    autoComplete="off"
                  />
                  <button
                    aria-label="Say your line"
                    type="submit"
                    disabled={typed.typing || pending || !nextLine.trim()}
                  >
                    <Send size={16} />
                  </button>
                </form>
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
                      {!progress.profile ? (
                        <button
                          className="secondary-button"
                          disabled={typed.typing}
                          onClick={() => leave(openSignup)}
                        >
                          Create a saved profile
                        </button>
                      ) : (
                        !challenge &&
                        !canForge && (
                          <button
                            className="secondary-button"
                            disabled={typed.typing || pending || wallet < price}
                            onClick={() =>
                              reply(
                                "key",
                                "I'd like to buy a Valley Challenge Key.",
                              )
                            }
                          >
                            <KeyRound size={15} />
                            Buy challenge key · {price.toLocaleString("en-US")}
                          </button>
                        )
                      )}
                      {calendar.phase === "active" && (
                        <button
                          className="secondary-button"
                          disabled={typed.typing || pending}
                          onClick={() => leave(onTasks)}
                        >
                          Show me the trials
                        </button>
                      )}
                      <button
                        className="secondary-button"
                        disabled={typed.typing || pending}
                        onClick={() => leave(onShop)}
                      >
                        {topic === "reward"
                          ? "See Hexbound in Shop"
                          : "Visit Limited Shop"}
                      </button>
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
                    Both fragments are ready. Forge your key for free inside the
                    World.
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
