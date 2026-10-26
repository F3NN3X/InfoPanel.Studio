// What the time widgets (Day Planner, Radial Clock Stack, On-Air Beacon) read: a clock that ticks on a boundary, and
// the server's extras (OBS state, calendar events; `src/lib/extras.ts`).
import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useTick } from "@/hooks/use-tick";
import { extras, type Extras } from "@/lib/extras";
import { IpTagCtx } from "./core/primitives";

/**
 * The current time in ms, renewed when a `stepMs` boundary passes (60 000 = once a minute) and asleep in between.
 * `on` false holds the time it last had.
 */
export function useNow(stepMs: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useTick(
    () => {
      const t = Date.now();
      setNow((prev) => (Math.floor(t / stepMs) !== Math.floor(prev / stepMs) ? t : prev));
      return stepMs - (t % stepMs);
    },
    on,
    0,
    "time-widget:clock"
  );
  return now;
}

/** True on the studio canvas, where a widget with nothing set up shows a hint; the kiosk shows it quietly. */
export const useInStudio = (): boolean => useContext(IpTagCtx);

/** The server's extras, live. */
export const useExtras = (): Extras => useSyncExternalStore(extras.subscribe, extras.getState, extras.getState);

/**
 * When `active` last turned on, in ms (null while off). A page loaded mid-stream starts its count when it first
 * sees the state: OBS does not report how long it has been going.
 */
export function useSince(active: boolean): number | null {
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => setSince(active ? Date.now() : null), [active]);
  return active ? since : null;
}
