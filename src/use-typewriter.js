import { useEffect, useRef, useState } from "react";

// Presentation only: this clock never touches saved reveals or event gating.
export function useTypewriter(text, active, reduced, identity, pace = 13) {
  const key = `${identity}:${text}`;
  const [shown, setShown] = useState({ key, count: 0 });
  const skipped = useRef(false);
  useEffect(() => {
    skipped.current = false;
    if (!active || reduced) {
      setShown({ key, count: text.length });
      return;
    }
    setShown({ key, count: 0 });
    const started = performance.now();
    const timer = window.setInterval(() => {
      const count = Math.min(
        text.length,
        Math.floor((performance.now() - started) / pace),
      );
      if (!skipped.current) setShown({ key, count });
      if (count >= text.length || skipped.current) window.clearInterval(timer);
    }, 26);
    return () => window.clearInterval(timer);
  }, [text, active, reduced, key, pace]);
  const count =
    reduced || !active
      ? text.length
      : shown.key === key
        ? Math.min(shown.count, text.length)
        : 0;
  return {
    visible: text.slice(0, count),
    typing: active && count < text.length,
    finish: () => {
      skipped.current = true;
      setShown({ key, count: text.length });
    },
  };
}
