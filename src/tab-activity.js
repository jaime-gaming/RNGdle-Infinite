export const AWAY_GRACE_MS = 20000;

function documentVisible(doc) {
  try {
    return doc?.visibilityState !== "hidden";
  } catch {
    return true;
  }
}

export function watchTabActivity(onChange, { graceMs = AWAY_GRACE_MS } = {}) {
  const doc = globalThis.document;
  if (!doc || typeof onChange !== "function") return () => {};
  let blurred = false,
    away = !documentVisible(doc),
    timer = null;
  const emit = () => onChange(!away);
  const cancelTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  const onFocus = () => {
    blurred = false;
    cancelTimer();
    away = !documentVisible(doc);
    emit();
  };
  const onBlur = () => {
    blurred = true;
    cancelTimer();
    if (documentVisible(doc))
      timer = setTimeout(() => {
        timer = null;
        away = blurred || !documentVisible(doc);
        emit();
      }, graceMs);
  };
  const onVisibility = () => {
    cancelTimer();
    if (documentVisible(doc)) {
      blurred = false;
      away = false;
    } else away = true;
    emit();
  };
  globalThis.addEventListener?.("focus", onFocus);
  globalThis.addEventListener?.("blur", onBlur);
  globalThis.addEventListener?.("pageshow", onFocus);
  doc.addEventListener?.("visibilitychange", onVisibility);
  emit();
  return () => {
    cancelTimer();
    globalThis.removeEventListener?.("focus", onFocus);
    globalThis.removeEventListener?.("blur", onBlur);
    globalThis.removeEventListener?.("pageshow", onFocus);
    doc.removeEventListener?.("visibilitychange", onVisibility);
  };
}
