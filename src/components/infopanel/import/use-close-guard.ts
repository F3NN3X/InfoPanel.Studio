import { useState } from "react";

/**
 * Closing a dialog that holds work asks first. `request` is for Escape, the backdrop, the X and Cancel: it closes at
 * once while nothing is held, else raises `asking`. `discard` closes for good; `keep` goes back to the dialog.
 */
export function useCloseGuard(held: boolean, onOpenChange: (open: boolean) => void) {
  const [asking, setAsking] = useState(false);
  return {
    asking,
    request: () => (held ? setAsking(true) : onOpenChange(false)),
    discard: () => {
      setAsking(false);
      onOpenChange(false);
    },
    keep: () => setAsking(false),
  };
}
