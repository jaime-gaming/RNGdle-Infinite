import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BatMark,
  BloodMoonMark,
  PhantomMark,
  PumpkinMark,
} from "./game-icons.jsx";

// Temporary, purely decorative secrets. No progress writer or gameplay RNG.
// CLEANUP Nov 4, 2026: remove with the seasonal backdrop, not owned aura art.
export default function RngweenSecrets({ reduced, interactive, notify }) {
  const [reveal, setReveal] = useState(null);
  const [lantern, setLantern] = useState(false);
  const moonTaps = useRef(0);
  const sequence = useRef(0);
  const timer = useRef(null);

  const uncover = useCallback(
    (kind) => {
      clearTimeout(timer.current);
      sequence.current += 1;
      setReveal({ kind, key: sequence.current });
      notify?.({
        kind: "info",
        title:
          kind === "spirits"
            ? "Boo!"
            : kind === "bats"
              ? "Bats!"
              : "Pumpkin lantern",
        text:
          kind === "spirits"
            ? "You found the hidden ghosts."
            : kind === "bats"
              ? "Three taps woke the bats."
              : "Lantern toggled.",
      });
      timer.current = setTimeout(() => setReveal(null), 4800);
    },
    [notify],
  );

  useEffect(() => {
    let letters = "";
    const type = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing)
        return;
      if (
        event.target?.closest?.(
          'input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]',
        )
      ) {
        letters = "";
        return;
      }
      if (event.key.length !== 1) {
        letters = "";
        return;
      }
      letters = (letters + event.key.toLowerCase()).slice(-3);
      if (letters === "boo") {
        uncover("spirits");
        letters = "";
      }
    };
    window.addEventListener("keydown", type);
    return () => {
      window.removeEventListener("keydown", type);
      clearTimeout(timer.current);
    };
  }, [uncover]);

  return (
    <>
      {interactive && (
        <div className={`rngween-curios${reduced ? " is-reduced-motion" : ""}`}>
          <button
            type="button"
            className="rngween-curio rngween-curio-lantern"
            aria-label="Pumpkin lantern"
            aria-pressed={lantern}
            title="Pumpkin lantern"
            onClick={() => {
              setLantern((value) => !value);
              uncover("lantern");
            }}
          >
            <PumpkinMark size={29} />
          </button>
          <button
            type="button"
            className="rngween-curio rngween-curio-moon"
            aria-label="Knock on the moon"
            title="Tap three times"
            onClick={() => {
              moonTaps.current += 1;
              if (moonTaps.current % 3 === 0) uncover("bats");
            }}
          >
            <BloodMoonMark size={29} />
          </button>
        </div>
      )}
      {reveal && (
        <div
          key={reveal.key}
          className={`rngween-secret-reveal${reduced ? " is-reduced-motion" : ""}`}
          data-secret={reveal.kind}
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const Mark =
              reveal.kind === "spirits"
                ? PhantomMark
                : reveal.kind === "bats"
                  ? BatMark
                  : PumpkinMark;
            return (
              <Mark
                key={i}
                className="rngween-secret-sprite"
                size={32}
                style={{ "--sprite": i }}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
