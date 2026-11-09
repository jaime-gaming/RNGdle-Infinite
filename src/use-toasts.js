import { useCallback, useRef, useState } from "react";
import { pushToast, removeToast } from "./toasts.js";

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
