/** The Library's Gauges moving values: a slow clock for the thumbnails, and the preview's play and scrub. */
import { useEffect, useState } from "react";
import { sweepAt } from "@/lib/gauge-studio/sweep";

/** One full sweep (0 → 100 → 0) of the play button. */
export const PLAY_MS = 4000;
/** The thumbnails' sweep: slow, so a page of them stays calm. */
export const THUMB_MS = 9000;

/** Calls `onValue` with a sweep of `periodMs` at `fps`, while `active`. */
export function useSweepLoop(active: boolean, periodMs: number, fps: number, onValue: (p: number) => void): void {
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    let last = 0;
    let raf = requestAnimationFrame(function tick(now) {
      if (now - last >= 1000 / fps) {
        last = now;
        onValue(sweepAt(now - t0, periodMs));
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
    // `onValue` is a state setter: stable.
  }, [active, periodMs, fps, onValue]);
}

/** A value sweeping slowly, shared by every thumbnail of a page. */
export function useThumbClock(): number {
  const [p, setP] = useState(0.65);
  useSweepLoop(true, THUMB_MS, 10, setP);
  return p;
}

export interface Playback {
  p: number;
  playing: boolean;
  /** Scrub to a value (stops playing). */
  scrub: (p: number) => void;
  toggle: () => void;
}

/** The preview's value: a scrubber, and a play button that sweeps 0 → 100 → 0 until pressed again. */
export function usePlayback(initial = 0.65): Playback {
  const [p, setP] = useState(initial);
  const [playing, setPlaying] = useState(false);
  useSweepLoop(playing, PLAY_MS, 30, setP);
  return {
    p,
    playing,
    scrub: (v) => {
      setPlaying(false);
      setP(v);
    },
    toggle: () => setPlaying((on) => !on),
  };
}
