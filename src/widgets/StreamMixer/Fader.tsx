import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clamp } from "../kit";

export type FaderMode = "leds" | "bar";

interface FaderProps {
  /** 0-100, from the server. */
  value: number;
  color: string;
  /** LED segments (the `leds` mode). */
  segs: number;
  mode: FaderMode;
  vertical?: boolean;
  /** Called with 0-100 while the fader is dragged; absent = read-only. */
  onChange?: (value: number) => void;
}

/** How long the dragged value is kept after release, for the server's answer to arrive. */
const HOLD_MS = 500;

/** The Stream Mixer's fader: LED segments or a bar with a handle, dragged by pointer (a finger through the kiosk's touch bridge too). */
export function MixFader({ value, color, segs, mode, vertical = false, onChange }: FaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const release = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(release.current), []);
  const live = !!onChange;
  const shown = drag ?? value;
  const at = (e: ReactPointerEvent) => {
    const el = ref.current;
    if (!el || !onChange) return;
    const r = el.getBoundingClientRect();
    const frac = vertical ? 1 - (e.clientY - r.top) / (r.height || 1) : (e.clientX - r.left) / (r.width || 1);
    const v = Math.round(clamp(frac * 100));
    setDrag(v);
    onChange(v);
  };
  const end = () => {
    clearTimeout(release.current);
    release.current = setTimeout(() => setDrag(null), HOLD_MS);
  };
  const dim = `color-mix(in oklab, ${color} 13%, transparent)`;
  return (
    <div
      ref={ref}
      data-fader=""
      className={`relative h-full w-full ${live ? "cursor-pointer" : ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={
        live
          ? (e) => {
              clearTimeout(release.current);
              try {
                e.currentTarget.setPointerCapture?.(e.pointerId);
              } catch {
                // A synthesised pointer has nothing to capture.
              }
              at(e);
            }
          : undefined
      }
      onPointerMove={live ? (e) => (e.buttons & 1) && at(e) : undefined}
      onPointerUp={live ? end : undefined}
      onPointerCancel={live ? end : undefined}
    >
      {mode === "bar" ? (
        <div
          className={`absolute overflow-hidden rounded-full ${vertical ? "inset-y-0 left-1/2 w-2 -translate-x-1/2" : "inset-x-0 top-1/2 h-2 -translate-y-1/2"}`}
          style={{ background: dim }}
        >
          <div
            className={`rounded-full ${vertical ? "absolute inset-x-0 bottom-0" : "h-full"}`}
            style={vertical ? { height: `${shown}%`, background: color } : { width: `${shown}%`, background: color }}
          />
        </div>
      ) : (
        <div className={`absolute inset-0 flex gap-[2px] ${vertical ? "flex-col-reverse" : ""}`}>
          {Array.from({ length: segs }, (_, i) => {
            const on = ((i + 0.5) / segs) * 100 <= shown;
            return <span key={i} className="min-h-0 min-w-0 flex-1 rounded-[1px]" style={{ background: on ? color : dim, opacity: on ? 0.55 + 0.45 * ((i + 1) / segs) : 1 }} />;
          })}
        </div>
      )}
      <div
        className={`pointer-events-none absolute rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,.5)] ${vertical ? "-left-1 -right-1 h-[3px] -translate-y-1/2" : "-bottom-1 -top-1 w-[3px] -translate-x-1/2"}`}
        style={vertical ? { bottom: `${shown}%`, transform: "translateY(50%)" } : { left: `${shown}%` }}
      />
    </div>
  );
}
