// <AudioViz>: the one visualiser canvas (NowPlaying, GameSpotlight, the Visualizer widget, the
// legacy media widgets). Props never restart the engine; it reads the input getter every frame.
import { useEffect, useRef } from "react";
import { usePreview } from "@/hooks/use-preview";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useSkin } from "../theme";
import { createVizEngine, type VizEngine } from "./engine";
import { resolveLook, type VizInput, type VizLook, type VizStyle } from "./types";

export interface AudioVizProps {
  style: VizStyle;
  look?: Partial<VizLook>;
  input: (() => VizInput) | null;
  className?: string;
  "aria-label"?: string;
}

export function AudioViz({ style, look, input, className, "aria-label": label = "Audio visualizer" }: AudioVizProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const engine = useRef<VizEngine | null>(null);
  const skin = useSkin();
  const reduced = useReducedMotion();
  // A thumbnail keeps the empty canvas: no engine, no frame loop.
  const preview = usePreview();
  useEffect(() => {
    if (preview) return;
    const e = createVizEngine(ref.current!);
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [preview]);
  // runs after the engine exists (effects run in order), and on every render: setLook ignores an unchanged look
  useEffect(() => {
    engine.current?.setLook({ style, look: resolveLook(look), skin: { meter: skin.meter, glow: skin.glow }, reduced });
    engine.current?.setInput(input);
  });
  return <canvas ref={ref} role="img" aria-label={label} data-viz={style} className={cn("block w-full", className)} />;
}
