import { useEffect, useRef } from "react";
import { useDocumentHidden } from "@/hooks/use-document-hidden";
import { useElementSize } from "@/hooks/use-element-size";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTick } from "@/hooks/use-tick";
import { AMBIENT_FPS } from "@/lib/ticker";
import type { WeatherKind } from "@/lib/weather-icons";
import { fxPlan } from "./config";
import { createFxEngine, type FxEngine, type FxLive } from "./engine";

export interface WeatherFxOpts {
  intensity?: number;
  /** Percent, 100 = the base particle count. */
  density?: number;
  speed?: number;
  lightning?: boolean;
  clouds?: boolean;
  /** Percent, 100 = full strength. */
  opacity?: number;
}

export interface WeatherFxProps {
  kind: WeatherKind;
  night: boolean;
  /** Celsius. */
  temp: number;
  /** Sideways px per frame, positive = right (see `windValue`). */
  wind: number;
  opts?: WeatherFxOpts;
}

/**
 * An animated weather background filling its (positioned) parent. Canvas 2D on the shared ticker, so it follows
 * Max FPS; with reduced motion it draws one still frame, and nothing runs while the page is hidden. Rebuilt only
 * when the condition, day/night or size changes; temperature, wind and the options apply live.
 */
export function WeatherFx({ kind, night, temp, wind, opts }: WeatherFxProps) {
  const { ref, w, h } = useElementSize();
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FxEngine | null>(null);
  const last = useRef(0);
  const live = useRef<FxLive>({ temp, wind, speed: 1, intensity: 1, density: 1, lightning: true, clouds: true, opacity: 1 });
  live.current = {
    temp,
    wind,
    speed: opts?.speed ?? 1,
    intensity: opts?.intensity ?? 1,
    density: (opts?.density ?? 100) / 100,
    lightning: opts?.lightning ?? true,
    clouds: opts?.clouds ?? true,
    opacity: (opts?.opacity ?? 100) / 100,
  };
  const reduced = useReducedMotion();
  const hidden = useDocumentHidden();

  useEffect(() => {
    const el = canvas.current;
    if (!el || w <= 0 || h <= 0) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    const e = createFxEngine(el, fxPlan(kind, night), w, h, dpr);
    engine.current = e;
    return () => {
      e?.dispose();
      engine.current = null;
    };
  }, [kind, night, w, h]);

  // Reduced motion: one still frame, redrawn when a setting changes.
  useEffect(() => {
    if (reduced) engine.current?.still(live.current);
  });

  useTick((now) => {
    const dt = last.current ? now - last.current : 0;
    last.current = now;
    engine.current?.frame(dt, now, live.current);
  }, !reduced && !hidden && w > 0 && h > 0, AMBIENT_FPS, "weather-fx");

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvas} className="block h-full w-full" />
    </div>
  );
}
