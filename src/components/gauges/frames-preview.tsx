/**
 * An image sequence at a value as InfoPanel draws it (spec §6): the frame picked for the value, moving
 * toward it at AnimationSpeed frames a second with the next frame faded over it (0: it jumps).
 */
import { useEffect, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import { gaugeFrame, smoothIndex } from "@/lib/infopanel/render/geometry";

/** The frame index for the value, 0..1 of the range. */
export const targetFrame = (count: number, p: number): number => gaugeFrame(count, p * 100, 0, 100);

/** The shown frame position: it eases to `target` at `speed` frames a second, and sits on it at speed 0. */
function useSmoothedIndex(target: number, speed: number, count: number): number {
  const [index, setIndex] = useState(target);
  const at = useRef(target);
  useEffect(() => {
    if (!(speed > 0)) {
      at.current = target;
      setIndex(target);
      return;
    }
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      at.current = smoothIndex(at.current, target, speed, (now - last) / 1000, count);
      last = now;
      setIndex(at.current);
      if (at.current !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, speed, count]);
  return Math.min(index, Math.max(0, count - 1));
}

export interface FramesPreviewProps {
  frames: (string | null)[];
  /** 0..1 of the range. */
  p: number;
  speed: number;
  size: number;
  /** A CSS filter, for the recolour preview. */
  filter?: string;
}

export function FramesPreview({ frames, p, speed, size, filter }: FramesPreviewProps) {
  const index = useSmoothedIndex(targetFrame(frames.length, p), speed, frames.length);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const layer = (src: string | null | undefined, opacity: number) =>
    src ? <img src={src} alt="" draggable={false} style={{ opacity, filter }} className="absolute inset-0 h-full w-full object-contain" /> : null;
  return (
    <div style={{ width: size, height: size }} className="relative">
      {frames[lo] ? (
        <>
          {layer(frames[lo], 1)}
          {hi !== lo && layer(frames[hi], index - lo)}
        </>
      ) : (
        <span className="absolute inset-0 grid place-items-center">
          <Gauge className="text-ui-4" style={{ width: size / 3, height: size / 3 }} strokeWidth={1.25} />
        </span>
      )}
    </div>
  );
}
