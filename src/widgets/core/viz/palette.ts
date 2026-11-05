// The visualiser's colours. Follow takes the zone's accent, the track and the skin (`meter` → bar
// shape, `glow` → glow); Custom takes colours 1–3 as a solid, a gradient or a per-band ramp. The spec
// is CSS strings (pure, tested); the engine resolves them through a probe every 500 ms at most, so
// a theme or skin change repaints live.
import { RAMP_BASE, RAMPS } from "@/looks/data-viz";
import { DEFAULT_ACCENT, DEFAULT_ACCENT_RGB } from "@/looks/palette";
import type { BarShape, VizColorMode, VizGradient, VizLook, VizShape, VizSkin } from "./types";

/** r, g, b 0..255, a 0..1 */
export type Rgba = [number, number, number, number];

export interface PaletteSpec {
  mode: Exclude<VizColorMode, "follow">;
  gradient: VizGradient;
  stops: string[];
  track: string;
  peak: string;
  glow: boolean;
  shape: BarShape;
  opacity: number;
}

export interface Palette extends Omit<PaletteSpec, "stops" | "track" | "peak"> {
  stops: Rgba[];
  track: Rgba;
  peak: Rgba;
}

const ACCENT = "var(--w-accent)";

/** The skin's `meter` token as a bar shape: segments / blocks → segments, pill, square, else round. */
export function shapeOf(shape: VizShape, meter: string | undefined): BarShape {
  if (shape !== "auto") return shape;
  if (meter === "segments" || meter === "blocks") return "segments";
  if (meter === "pill") return "pill";
  if (meter === "square") return "square";
  return "round";
}

const dim = (color: string) => `color-mix(in oklab, ${color} 40%, ${RAMP_BASE})`;
/** A ramp name's stops (`RAMPS`), or null for a colour or the accent ramp. */
const rampStops = (name: string): string[] | null => RAMPS[name] ?? null;

/** The colour stops for the look: Follow dims from the base to the accent by value (or a legacy ramp name). */
export function stopsOf(look: Pick<VizLook, "colorMode" | "color1" | "color2" | "color3">): string[] {
  const c1 = look.color1.trim();
  const named = rampStops(c1);
  if (look.colorMode === "follow") return named ?? [dim(ACCENT), ACCENT];
  const first = c1 && !named ? c1 : ACCENT;
  if (look.colorMode === "solid") return [first];
  if (look.colorMode === "ramp" && named) return named;
  const c2 = look.color2.trim();
  const c3 = look.color3.trim();
  if (look.colorMode === "ramp") {
    const list = [first, c2, c3].filter(Boolean);
    return list.length > 1 ? list : [dim(first), first];
  }
  return [first, c2 || first, c3 || c2 || first];
}

export function paletteSpec(look: VizLook, skin: VizSkin): PaletteSpec {
  return {
    mode: look.colorMode === "follow" ? "ramp" : look.colorMode,
    gradient: look.gradient,
    stops: stopsOf(look),
    track: "var(--w-track, rgba(255,255,255,.07))",
    peak: look.peakColor.trim() || `color-mix(in oklab, ${ACCENT} 70%, var(--w-fg, #fff))`,
    glow: look.glow === "on" || (look.glow === "auto" && skin.glow === true),
    shape: shapeOf(look.shape, skin.meter),
    opacity: Math.min(1, Math.max(0.1, look.opacity)),
  };
}

export const resolvePalette = (spec: PaletteSpec, resolve: (css: string) => Rgba): Palette => ({
  ...spec,
  stops: spec.stops.map(resolve),
  track: resolve(spec.track),
  peak: resolve(spec.peak),
});

/** The colour at `t` (0..1) along the stops. */
export function colorAt(stops: readonly Rgba[], t: number): Rgba {
  if (stops.length === 0) return [0, 0, 0, 0];
  if (stops.length === 1) return stops[0];
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

export const css = ([r, g, b, a]: Rgba, alpha = 1): string => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+(a * alpha).toFixed(3)})`;

/**
 * A resolver for CSS colours under `host`: a hidden probe's computed colour resolves `var()` and
 * `color-mix()`, and a 1×1 canvas turns any colour the browser knows into bytes.
 */
export function createCssResolver(host: Element): { resolve: (css: string) => Rgba; dispose: () => void } {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const px = document.createElement("canvas");
  px.width = px.height = 1;
  const ctx = px.getContext("2d", { willReadFrequently: true });
  const resolve = (value: string): Rgba => {
    probe.style.color = value;
    const computed = getComputedStyle(probe).color;
    probe.style.color = "";
    if (!ctx) return [...DEFAULT_ACCENT_RGB, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = DEFAULT_ACCENT;
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  return { resolve, dispose: () => probe.remove() };
}
