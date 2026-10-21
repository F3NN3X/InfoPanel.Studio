"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTick } from "@/hooks/use-tick";
import { easeOut } from "@/lib/curves";

const PERIOD_MS = 1400;
/** The ring grows over the first 70% of the period, then rests. */
const GROW = 0.7;

/**
 * A status dot that, while `pulse` is set, breathes with a ring (1.4 s, ease-out). It runs on the
 * shared ticker, so Max FPS caps it and reduced motion stops it, unlike a CSS infinite animation.
 */
export function PulseDot({ color, pulse, className, label }: { color: string; pulse?: boolean; className?: string; label?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();
  const live = pulse === true && !reduced;
  useTick((now) => {
    const el = ref.current;
    if (!el) return;
    const e = easeOut(Math.min(1, (now % PERIOD_MS) / PERIOD_MS / GROW));
    el.style.boxShadow = `0 0 0 ${(0.45 * e).toFixed(3)}em color-mix(in srgb, ${color} ${(70 * (1 - e)).toFixed(1)}%, transparent)`;
  }, live);
  useEffect(() => {
    if (!live && ref.current) ref.current.style.boxShadow = "";
  }, [live]);
  return <span ref={ref} className={className} style={{ background: color }} aria-label={label} />;
}
