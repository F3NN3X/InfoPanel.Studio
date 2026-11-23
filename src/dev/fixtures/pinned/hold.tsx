import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/*
 * Hold to confirm (decision 4 and 5; owner Q3 and Q4): the action runs only after a 0.6 s hold, the length of Studio's long
 * press (`LONG_PRESS_MS`, page-dots.tsx), so a brush does nothing. The fill grows under the finger and says how long is
 * left; lifting early cancels. With reduced motion the fill does not sweep: the button shows the time left in steps.
 * Design only: it reports the confirmed hold to `onConfirm` and nothing else.
 */

export const HOLD_MS = 600;

interface HoldProps {
  label: string;
  /** Freeze the fill at this share (0–1) for a fixture's still. */
  frozen?: number;
  onConfirm?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function HoldButton({ label, frozen, onConfirm, className, style }: HoldProps) {
  const reduced = useReducedMotion();
  const [held, setHeld] = useState(0);
  const start = useRef<number | null>(null);
  const frame = useRef(0);
  const share = frozen ?? held;
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const tick = () => {
    if (start.current === null) return;
    const t = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setHeld(t);
    if (t >= 1) {
      start.current = null;
      onConfirm?.();
    } else frame.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    start.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  };
  const release = () => {
    start.current = null;
    cancelAnimationFrame(frame.current);
    setHeld(0);
  };
  const left = ((1 - share) * HOLD_MS) / 1000;
  return (
    <button
      type="button"
      aria-label={`${label}: hold for ${HOLD_MS / 1000} seconds`}
      onPointerDown={begin}
      onPointerUp={release}
      // the keyboard holds the same way: Space or Enter held down for the hold's length
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={release}
      onBlur={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative isolate flex select-none flex-col items-center justify-center overflow-hidden rounded-xl font-semibold ${className ?? ""}`}
      style={{ color: "var(--w-fg)", background: "color-mix(in oklab, var(--w-fg) 10%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--w-fg) 30%, transparent)", touchAction: "none", ...style }}
    >
      {/* the fill: the accent, under the label; a step per 0.1 s with reduced motion */}
      <span aria-hidden className="absolute inset-y-0 left-0 -z-10" style={{ width: `${(reduced ? Math.floor(share * 6) / 6 : share) * 100}%`, background: "color-mix(in oklab, var(--w-accent) 38%, transparent)" }} />
      <span className="leading-tight">{label}</span>
      <span className="text-caption font-normal leading-tight tabular-nums" style={{ color: "var(--w-muted)" }}>
        {share > 0 && share < 1 ? `${left.toFixed(1)} s left` : `Hold ${HOLD_MS / 1000} s`}
      </span>
    </button>
  );
}
