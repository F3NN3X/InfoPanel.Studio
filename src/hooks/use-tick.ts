"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeTick } from "@/lib/ticker";

/** Calls `cb` on the shared ticker (capped at Max FPS) while `enabled`. */
export function useTick(cb: (now: number) => void, enabled: boolean): void {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!enabled) return;
    return subscribeTick((now) => latest.current(now));
  }, [enabled]);
}

/** The ticker's time (ms), re-rendering at the capped rate while `enabled`; 0 before the first tick. */
export function useTickTime(enabled: boolean): number {
  const [now, setNow] = useState(0);
  useTick(setNow, enabled);
  return now;
}
