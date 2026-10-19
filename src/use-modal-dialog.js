import { useEffect, useRef } from "react";

// Native dialogs supply focus trapping, Escape and a top layer above the dock.
// Restore scrolling/focus on navigation too, not just when the close is clicked.
export function useModalDialog(open) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    node.querySelector("[autofocus], button")?.focus();
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  return dialog;
}
