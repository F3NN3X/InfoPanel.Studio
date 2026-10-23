"use client";

import { useEffect, useRef } from "react";
import { subscribeTick } from "@/lib/ticker";

/** Calls `cb` on the shared ticker (capped at Max FPS, and at `capFps` when given) while `enabled`. */
export function useTick(cb: (now: number) => void, enabled: boolean, capFps = 0): void {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!enabled) return;
    return subscribeTick((now) => latest.current(now), capFps);
  }, [enabled, capFps]);
}
