import { useEffect, useRef } from "react";
import type { HelpTarget } from "./links";

/**
 * F1 opens Help. `resolve` says where (read when the key goes down); `open` does it. Shared by the
 * studio and Settings (Help has no context to resolve).
 */
export function useHelpKey(resolve: () => HelpTarget, open: (target: HelpTarget) => void) {
  const latest = useRef({ resolve, open });
  latest.current = { resolve, open };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (e.repeat) return;
      latest.current.open(latest.current.resolve());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
