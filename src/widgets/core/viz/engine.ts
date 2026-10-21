// The visualiser engine: one canvas, painted in the shared frame loop's paint phase from an input
// getter. DPR-aware (ResizeObserver), asleep off-screen (IntersectionObserver) and while the page
// is hidden; colours re-resolved at most every 500 ms so a theme or skin change repaints live.
import { resampleBands } from "@/lib/audio/spectrum";
import { MAX_FRAME_GAP_MS, subscribeFrame } from "@/lib/audio/frame-loop";
import { barCount, DRAW, fadeEdges, type DrawFrame } from "./draw";
import { createCssResolver, css, paletteSpec, resolvePalette, type Palette } from "./palette";
import type { VizInput, VizLook, VizSkin, VizStyle } from "./types";

export interface VizSpec {
  style: VizStyle;
  look: VizLook;
  skin: VizSkin;
  /** Reduced motion: the canvas paints one still frame and the loop stays asleep. */
  reduced: boolean;
}

export interface VizEngine {
  setInput: (getter: (() => VizInput) | null) => void;
  setLook: (spec: VizSpec) => void;
  dispose: () => void;
}

const PALETTE_MS = 500;
const PEAK_HOLD_MS = 600;
/** Peak caps fall this much of the full scale per ms once the hold ends. */
const PEAK_FALL_PER_MS = 0.0008;

/** Peak caps with hold: a cap jumps to its bar, holds, then falls by time (or jumps when `reduced`). */
export function stepPeaks(peaks: Float32Array, holdUntil: Float64Array, bars: ArrayLike<number>, nowMs: number, dtMs: number, reduced: boolean): void {
  for (let i = 0; i < peaks.length; i++) {
    const v = bars[i] ?? 0;
    if (reduced || v >= peaks[i]) {
      peaks[i] = v;
      holdUntil[i] = nowMs + PEAK_HOLD_MS;
    } else if (nowMs > holdUntil[i]) peaks[i] = Math.max(v, peaks[i] - dtMs * PEAK_FALL_PER_MS);
  }
}

export function createVizEngine(canvas: HTMLCanvasElement): VizEngine {
  const ctx = canvas.getContext("2d");
  let getter: (() => VizInput) | null = null;
  let spec: VizSpec | null = null;
  let specKey = "";
  let palette: Palette | null = null;
  let paletteAt = -Infinity;
  const resolver = canvas.parentElement ? createCssResolver(canvas.parentElement) : null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let onScreen = true;
  let unsubscribe: (() => void) | null = null;
  let stilled = false;
  let lastMs = 0;
  let bars = new Float32Array(0);
  let peaks = new Float32Array(0);
  let holdUntil = new Float64Array(0);

  const paint = (nowMs: number) => {
    if (!ctx || !spec || !getter || !w || !h) return;
    const dt = lastMs ? Math.min(MAX_FRAME_GAP_MS, nowMs - lastMs) : 16;
    lastMs = nowMs;
    if (resolver && (!palette || nowMs - paletteAt > PALETTE_MS)) {
      palette = resolvePalette(paletteSpec(spec.look, spec.skin), resolver.resolve);
      paletteAt = nowMs;
    }
    if (!palette) return;
    const { style, look } = spec;
    const input = getter();
    const n = barCount(style, look, w, h);
    if (bars.length !== n) {
      bars = new Float32Array(n);
      peaks = new Float32Array(n);
      holdUntil = new Float64Array(n);
    }
    resampleBands(input.bands, n, bars);
    const withPeaks = look.peaks && (style === "bars" || style === "mirror");
    if (withPeaks) stepPeaks(peaks, holdUntil, bars, nowMs, dt, spec.reduced);
    const frame: DrawFrame = { bars, peaks: withPeaks ? peaks : null };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = palette.opacity;
    ctx.shadowBlur = palette.glow ? 8 : 0;
    ctx.shadowColor = palette.glow ? css(palette.stops[palette.stops.length - 1]) : "transparent";
    DRAW[style](ctx, w, h, input, palette, look, frame);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (look.fade > 0) fadeEdges(ctx, w, h, look.fade);
  };

  const sync = () => {
    const run = onScreen && !document.hidden && getter !== null && spec !== null && !spec.reduced;
    if (run && !unsubscribe) {
      lastMs = 0;
      unsubscribe = subscribeFrame(paint);
    } else if (!run && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (!run && !stilled && onScreen && spec?.reduced && getter) {
      stilled = true;
      lastMs = 0;
      paint(performance.now());
    }
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    w = r.width;
    h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  };
  resize();
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  ro?.observe(canvas);
  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([e]) => {
          onScreen = e.isIntersecting;
          sync();
        });
  io?.observe(canvas);
  document.addEventListener("visibilitychange", sync);

  return {
    setInput: (next) => {
      if (next !== getter) stilled = false;
      getter = next;
      sync();
    },
    setLook: (next) => {
      const key = JSON.stringify(next);
      if (key === specKey) return;
      specKey = key;
      spec = next;
      palette = null;
      stilled = false;
      sync();
    },
    dispose: () => {
      unsubscribe?.();
      unsubscribe = null;
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      resolver?.dispose();
    },
  };
}
