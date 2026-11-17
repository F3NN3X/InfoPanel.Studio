import { useContext, useEffect, useRef } from "react";
import type { TouchAction, TouchMap } from "@/lib/pinned";
import { RailHostContext } from "./rail-host";

/**
 * A widget's touch map (`Placement.touch`, decision 10) on `el` (from a callback ref, so a widget drawn later is heard): its gestures run through the screen's
 * action runner (the kiosk's `RailHost.run`). Nothing listens without a map, without a runner (the studio, a preview) or
 * while `off`; the listener module (`lib/touch-zone.ts`) loads with the first widget that has one.
 */
export function useTouchZone(el: HTMLElement | null, touch: TouchMap | undefined, off = false): void {
  const run = useContext(RailHostContext)?.run;
  const latest = useRef<{ touch?: TouchMap; run?: (a: TouchAction) => void }>({});
  latest.current = { touch, run };
  const on = !off && !!run && !!touch;
  useEffect(() => {
    if (!on || !el) return;
    let alive = true;
    let stop: (() => void) | undefined;
    void import("@/lib/touch-zone").then((m) => {
      if (alive) stop = m.attachTouch(el, () => m.touchHandlers(latest.current.touch, (a) => latest.current.run?.(a)));
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [on, el]);
}
