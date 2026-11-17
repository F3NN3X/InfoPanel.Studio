import { useContext, useLayoutEffect, useRef } from "react";
import type { TouchAction, TouchGesture, TouchMap } from "@/lib/pinned";
import { RailHostContext } from "./rail-host";

type TouchZoneModule = typeof import("@/lib/touch-zone");

/** The listener module once a widget has loaded it: every later widget attaches at once, in the commit that mounts it. */
let loaded: TouchZoneModule | undefined;

/**
 * A widget's touch map (`Placement.touch`, decision 10) on `el` (from a callback ref, so a widget drawn later is heard): its gestures run through the screen's
 * action runner (the kiosk's `RailHost.run`). Nothing listens without a map, without a runner (the studio, a preview) or
 * while `off`; the listener module (`lib/touch-zone.ts`) loads with the first widget that has one.
 *
 * The listeners go on in a layout effect, from the module already loaded: a widget on a page a tap just showed takes a
 * double tap sent the instant it appears (QUESTIONS P-B12: waiting for the import's promise left it deaf for a frame).
 */
export function useTouchZone(el: HTMLElement | null, touch: TouchMap | undefined, off = false): void {
  const run = useContext(RailHostContext)?.run;
  const latest = useRef<{ touch?: TouchMap; run?: (a: TouchAction, g?: TouchGesture) => void }>({});
  latest.current = { touch, run };
  const on = !off && !!run && !!touch;
  useLayoutEffect(() => {
    if (!on || !el) return;
    let stop: (() => void) | undefined;
    let alive = true;
    const attach = (m: TouchZoneModule) => {
      if (alive) stop = m.attachTouch(el, () => m.touchHandlers(latest.current.touch, (a, g) => latest.current.run?.(a, g)));
    };
    if (loaded) attach(loaded);
    else
      void import("@/lib/touch-zone").then((m) => {
        loaded = m;
        attach(m);
      });
    return () => {
      alive = false;
      stop?.();
    };
  }, [on, el]);
}
