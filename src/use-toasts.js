import { useCallback, useRef, useState } from "react";
import { errorReference, isErrorReference } from "./error-codes.js";
import { reportIncident } from "./incident-report.js";
import { pushToast, removeToast } from "./toasts.js";

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const sequence = useRef(0);
  const notify = useCallback((input) => {
    if (input?.kind === "error") {
      const reference = isErrorReference(input.reference)
        ? input.reference
        : errorReference(input.text);
      reportIncident({ code: reference, source: "ui-notice" });
    }
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
