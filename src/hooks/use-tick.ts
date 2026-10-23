"use client";

import { useEffect, useRef } from "react";
import { subscribeTick, type TickResult, type TickSubscription } from "@/lib/ticker";

/**
 * Calls `cb` on the shared ticker (capped at Max FPS, and at `capFps` when given) while `enabled`. `cb` may return
 * `SETTLED` or a number of ms to sleep (src/lib/ticker.ts); each render wakes it, since new props may move it again.
 * `label` names it in the ticker's debug stats.
 */
export function useTick(cb: (now: number) => TickResult, enabled: boolean, capFps = 0, label?: string): void {
  const latest = useRef(cb);
  latest.current = cb;
  const sub = useRef<TickSubscription | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const s = subscribeTick((now) => latest.current(now), capFps, label);
    sub.current = s;
    return () => {
      s();
      sub.current = null;
    };
  }, [enabled, capFps, label]);
  useEffect(() => sub.current?.wake());
}
