"use client";

import { useEffect, useRef } from "react";
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
