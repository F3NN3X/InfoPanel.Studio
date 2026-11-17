import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/*
 * Hold to confirm (decisions 4 and 5 of the pinned layer; owner Q3), as the `hold` fixture draws it
 * (src/dev/fixtures/pinned/hold.tsx): the action runs only after a 0.6 s hold, the length of Studio's long press, so a brush
 * does nothing. The fill grows under the finger and the line under the label says how long is left; lifting early cancels.
 * With reduced motion the fill moves in steps. The keyboard holds the same way: Space or Enter kept down for the hold.
 */

export const HOLD_MS = 600;

interface HoldButtonProps {
  label: string;
  onConfirm: () => void;
  className?: string;
}

export function HoldButton({ label, onConfirm, className }: HoldButtonProps) {
  const reduced = useReducedMotion();
  const [held, setHeld] = useState(0);
  const start = useRef<number | null>(null);
  const frame = useRef(0);
  // the action shown when the hold began is the one it confirms, even if the props change under the finger
  const armed = useRef(onConfirm);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const tick = () => {
    if (start.current === null) return;
    const t = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setHeld(t);
    if (t >= 1) {
      start.current = null;
      armed.current();
    } else frame.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (start.current !== null) return;
    armed.current = onConfirm;
    start.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  };
  const release = () => {
    start.current = null;
    cancelAnimationFrame(frame.current);
    setHeld(0);
  };
  const left = ((1 - held) * HOLD_MS) / 1000;
  return (
    <button
      type="button"
      data-hold-button=""
      aria-label={`${label}: hold for ${HOLD_MS / 1000} seconds`}
      onPointerDown={begin}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={release}
      onBlur={release}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("relative isolate flex touch-none select-none flex-col items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-primary/10 font-semibold text-foreground", className)}
    >
      {/* the fill: the accent, under the label; in steps with reduced motion */}
      <span aria-hidden className="absolute inset-y-0 left-0 -z-10 bg-primary/40" style={{ width: `${(reduced ? Math.floor(held * 6) / 6 : held) * 100}%` }} />
      <span className="leading-tight">{label}</span>
      <span className="text-[12px] font-normal leading-tight tabular-nums text-muted-foreground">{held > 0 && held < 1 ? `${left.toFixed(1)} s left` : `Hold ${HOLD_MS / 1000} s`}</span>
    </button>
  );
}
