import { useCallback, useRef, useState } from "react";
import { pushToast, removeToast } from "./toasts.js";

// The notice queue for the whole app. `notify` and `dismiss` never change
// identity, so an effect can list them without re-running on every render.
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const sequence = useRef(0);
  const notify = useCallback((input) => {
    sequence.current += 1;
    const id = sequence.current;
    setToasts((list) => pushToast(list, input, id));
  }, []);
  const dismiss = useCallback(
    (id) => setToasts((list) => removeToast(list, id)),
    [],
  );
  return { toasts, notify, dismiss };
}
