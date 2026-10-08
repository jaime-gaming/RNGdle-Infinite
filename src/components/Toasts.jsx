import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Coins,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import "../toasts.css";

// The notice cards. Each kind has its own mark, so a glance says whether it was
// a reward, a milestone, a warning or a failure. A notice waits for its time,
// pauses while the pointer or the keyboard is on it, and leaves on its own, by
// the close button, or by its action.
const KIND_ICON = {
  info: Check,
  reward: Coins,
  milestone: Sparkles,
  warning: TriangleAlert,
  error: CircleAlert,
};

const EXIT_MS = 200;

function Notice({ item, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(item.life);
  const since = useRef(0);
  // A repeated notice starts its time again.
  useEffect(() => {
    remaining.current = item.life;
  }, [item.stamp, item.life]);
  useEffect(() => {
    if (paused || leaving) return;
    since.current = Date.now();
    const timer = setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - since.current),
      );
    };
  }, [paused, leaving, item.stamp]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onDismiss(item.id), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, item.id, onDismiss]);

  const Fallback = KIND_ICON[item.kind] ?? Check;
  return (
    <article
      className={`toast is-${item.kind} ${leaving ? "is-leaving" : ""}`}
      role={item.kind === "error" ? "alert" : "status"}
      data-kind={item.kind}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <span className="toast-mark" aria-hidden="true">
        {item.icon ?? <Fallback size={16} />}
      </span>
      <div className="toast-body">
        {item.title && <strong className="toast-title">{item.title}</strong>}
        {item.text && <span className="toast-text">{item.text}</span>}
      </div>
      {item.count > 1 && (
        <span className="toast-count" title={`Repeated ${item.count} times`}>
          ×{item.count}
        </span>
      )}
      {item.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            item.action.onSelect();
            setLeaving(true);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notice"
        onClick={() => setLeaving(true)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </article>
  );
}

export default function Toasts({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toast-stack">
      {items.map((item) => (
        <Notice key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
