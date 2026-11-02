// Primitives: icons, numerals, meters, rings, graphs, chips, images and the inline visualiser.
// Text and track colours come from the shell's --w-* variables (decision 5); labels, alignment and gaps follow
// the standard look's --wp-* variables, with the primitive's own value as the fallback.
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { has, clamp, fmt } from "./data";
import { mix } from "./tokens";
import { useSkin, STATE, TONES, tone, numGlowStyle } from "./theme";
import { iconFor } from "./icons";
import type { Tone } from "./types";
import { cn } from "@/lib/utils";
import { labelStyle, ws } from "@/components/widget-style";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTick } from "@/hooks/use-tick";
import { AMBIENT_FPS } from "@/lib/ticker";
import { alternate } from "@/lib/curves";
import { appIconName, weatherKind } from "@/lib/weather-icons";
import { RangeEaser, SmoothScroll, scrollWaitMs, useAnimationFrame, type ScrollPoint } from "./smoothing";
import { HISTORY_LEN } from "./layout";
import { scaleX, slideX } from "./motion";

/* ───────── primitives ───────── */
// Material Symbols names rendered as lucide icons (see icons.ts); sized by the font size like the glyphs were.
export function Icon({ name, className = "", fill }: { name?: string; className?: string; fill?: boolean }) {
  const Cmp = iconFor(name);
  return <Cmp aria-hidden size="1em" className={`inline-block shrink-0 select-none ${className}`} {...(fill ? { fill: "currentColor", fillOpacity: 0.25 } : null)} />;
}

const SCALES = ["sm", "md", "lg", "xl", "2xl"] as const;
type Scale = (typeof SCALES)[number];
/** Back to a plain glow for text inside a stroked numeral (a unit, a tone glyph): the outline is sized for the numeral. */
const SMALL_GLOW: CSSProperties = { WebkitTextStroke: "0", textShadow: "0 0 4px var(--accent)" };
const NUM_TINT: CSSProperties = { color: "color-mix(in oklab, var(--accent) 55%, var(--w-fg))" };
const NUM_HALO = "0 0 30px color-mix(in oklab, var(--accent) 50%, transparent)";

/** A small glyph and screen-reader word beside a number whose colour says warn or crit, so the state is not colour alone. Nothing for ok. */
export function ToneCue({ t, size = "max(8px, 0.45em)" }: { t?: Tone; size?: string }) {
  const sk = useSkin();
  const skip = useContext(IpTagCtx) ? { "data-ip-skip": "" } : undefined;
  if (!t || t === "ok") return null;
  return (
    <>
      <span {...skip} aria-hidden className="mr-[0.2em] inline-block align-middle leading-none" style={{ fontSize: size, ...(sk.numStroke ? SMALL_GLOW : null) }}>{t === "warn" ? "▲" : "✕"}</span>
      <span {...skip} className="sr-only">{t === "warn" ? "warning: " : "critical: "}</span>
    </>
  );
}

export interface MetricProps {
  label?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  d?: number;
  scale?: Scale;
  sub?: ReactNode;
  t?: Tone;
  align?: "left" | "center";
  className?: string;
  /** The Data API key the number shows: tags it for the InfoPanel conversion (`data-ip-key`). */
  ipKey?: string;
  /** The number's size in px, fitted by the caller; replaces `scale`. */
  px?: number;
}
export function Metric({ label, value, unit, d = 0, scale = "md", sub, t = "ok", align = "left", className = "", ipKey: key, px }: MetricProps) {
  const ipKey = useContext(IpTagCtx) ? key : undefined;
  const sk = useSkin();
  const sc = sk.numUp ? SCALES[Math.min(4, SCALES.indexOf(scale) + 1)] : scale;
  const big = { sm: "text-lg", md: "text-2xl", lg: "text-4xl", xl: "text-5xl", "2xl": "text-7xl" }[sc];
  const shown = typeof value === "number" ? fmt(value, d) : value;
  return (
    <div className={`flex min-w-0 flex-col ${align === "center" ? "items-center text-center" : ""} ${className}`} style={align === "center" ? { alignItems: "var(--wp-x-cross, center)", textAlign: "var(--wp-text-align, center)" as CSSProperties["textAlign"] } : { alignItems: "var(--wp-x-cross, stretch)" }}>
      {label && <span className="max-w-full truncate text-[11px] font-medium text-[color:var(--w-muted)]" style={labelStyle("none")}>{label}</span>}
      <span data-ip-key={ipKey} data-ip-kind={ipKey ? "value" : undefined} data-ip-unit={ipKey && typeof unit === "string" ? unit : undefined} data-ip-decimals={ipKey ? d : undefined} className={`${px ? "" : big} font-semibold leading-none tracking-tight tabular-nums`} style={{ ...(px ? { fontSize: px } : null), fontFamily: sk.num, fontWeight: sk.numWeight, fontStretch: sk.numStretch, ...(sk.numGlow ? { ...NUM_TINT, ...numGlowStyle(sk, NUM_HALO) } : null), ...(t !== "ok" ? { color: TONES[t] } : null) }}>
        <ToneCue t={t} />
        {shown}
        {unit && <span className="ml-0.5 inline-block align-top leading-none text-[0.45em] font-medium text-[color:var(--w-muted)]" style={sk.numStroke ? SMALL_GLOW : undefined}>{unit}</span>}
      </span>
      {sub && <span className="mt-1 max-w-full truncate text-[11px] text-[color:var(--w-faint)]">{sub}</span>}
    </div>
  );
}

// Meter styles: bar · pill · segments · blocks (btop gradient) · hair · wave · square
const blockColor = (i: number, n: number) => `oklch(0.78 0.16 ${150 - (i / Math.max(1, n - 1)) * 125})`;
export interface BarProps {
  value: number;
  max?: number;
  t?: Tone;
  className?: string;
  track?: string;
  style?: string;
  /** Cells of the segments / blocks styles (default 24 / 14). */
  segments?: number;
}
/** How long a smooth bar or ring glides to a new reading: about one sample interval of the feed. */
const GLIDE_MS = 1000;
/** A ring glide is a main-thread repaint every frame, so it is kept short. */
const RING_GLIDE_MS = 300;

/**
 * A bar or graph that carries the Data API key it draws, for the InfoPanel conversion (`lib/infopanel/native/decompose.ts`):
 * the key's box is found by `data-ip-key`. Without a key the primitive is drawn as it was.
 */
/** On in the studio canvas only, where the InfoPanel conversion reads the tags; the kiosk and the previews draw without them. */
export const IpTagCtx = createContext(false);

/** What a tag can say besides its key: `kind` (default value), and how a value is shown (`unit`, `decimals`, `mul`) or a clock's .NET `format`. */
export interface IpTagExtra {
  kind?: "value" | "bar" | "ring" | "graph" | "clock" | "meter" | "image" | "table";
  unit?: string;
  decimals?: number;
  mul?: number;
  max?: number;
  format?: string;
  /** A table's rows shown. */
  rows?: number;
}

/**
 * For modules that draw a value themselves: `tag(key)` gives the `data-ip-*` attributes to spread on the node that
 * shows it (nothing outside the studio canvas, or without a key).
 */
export function useIpTag(): (key: string | undefined, extra?: IpTagExtra) => Record<string, string | number> {
  const on = useContext(IpTagCtx);
  return (key, extra = {}) => {
    if (!on || !key) return {};
    const out: Record<string, string | number> = { "data-ip-key": key, "data-ip-kind": extra.kind ?? "value" };
    if (extra.unit !== undefined) out["data-ip-unit"] = extra.unit;
    if (extra.decimals !== undefined) out["data-ip-decimals"] = extra.decimals;
    if (extra.mul !== undefined) out["data-ip-mul"] = extra.mul;
    if (extra.max !== undefined) out["data-ip-max"] = extra.max;
    if (extra.format !== undefined) out["data-ip-format"] = extra.format;
    if (extra.rows !== undefined) out["data-ip-rows"] = extra.rows;
    return out;
  };
}

/** A `Bar` with a tick at each of `ticks` (in the bar's own units): where a limit sits against the value. Ticks are decoration; the limits are in the text beside. */
export function TickBar({ ticks, max = 100, className = "h-1.5", ...bar }: BarProps & { ticks: number[] }) {
  return (
    <div className="relative">
      <Bar max={max} className={className} {...bar} />
      {ticks.map((at) => (
        <span key={at} aria-hidden className="absolute -inset-y-[3px] w-0.5 -translate-x-1/2 rounded-full bg-[color:var(--w-fg)] opacity-60" style={{ left: `${clamp((at / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function Bar(p: BarProps & { ipKey?: string }) {
  const tagging = useContext(IpTagCtx);
  const { ipKey, ...rest } = p;
  if (!ipKey || !tagging) return <BarBase {...rest} />;
  return (
    <div data-ip-key={ipKey} data-ip-kind="bar" data-ip-max={rest.max ?? 100} className={rest.className ?? "h-1.5"}>
      <BarBase {...rest} className="h-full" />
    </div>
  );
}

function BarBase({ value, max = 100, t = "ok", className = "h-1.5", track = "bg-[color:var(--w-track)]", style: meterStyle, segments }: BarProps) {
  const sk = useSkin();
  const m = meterStyle ?? sk.meter ?? "bar";
  const pct = clamp((value / max) * 100);
  // Smooth graph updates: glide linearly over about one sample interval instead of easing.
  const glide = sk.smooth ? { transition: `transform ${GLIDE_MS}ms linear` } : null;
  if (m === "segments" || m === "blocks") {
    const n = segments ?? (m === "blocks" ? 14 : 24),
      lit = Math.round((pct / 100) * n);
    return (
      <div className={cn("flex w-full gap-[2px]", className)}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="min-w-0 flex-1 rounded-[1px]" style={{ background: i < lit ? (m === "blocks" ? blockColor(i, n) : TONES[t]) : "var(--w-track)" }} />
        ))}
      </div>
    );
  }
  if (m === "wave")
    return (
      <div className={cn("relative w-full min-h-[8px]", className)}>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <line x1={pct} y1="5" x2="100" y2="5" stroke="var(--w-track)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path
            d={Array.from({ length: Math.max(2, Math.round(pct / 2)) + 1 }, (_, i) => {
              const x = Math.min(pct, i * 2);
              return `${i ? "L" : "M"}${x.toFixed(2)},${(5 + Math.sin(i * 1.15) * 2.6).toFixed(2)}`;
            }).join("")}
            fill="none" stroke={TONES[t]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  if (m === "square")
    return (
      <div className={cn("w-full border border-[color:var(--w-fg)]/70 bg-transparent p-[1px] min-h-[8px]", className)}>
        <div className="h-full w-full transition-transform duration-500" style={{ ...scaleX(pct), background: TONES[t], ...glide }} />
      </div>
    );
  if (m === "hair")
    return (
      <div className={cn("relative w-full", className)}>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[color:var(--w-track)]" />
        <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 transition-transform duration-500" style={{ ...scaleX(pct), background: TONES[t], ...glide }} />
      </div>
    );
  return (
    <div className={cn("w-full overflow-hidden rounded-full", m === "pill" ? "bg-[color:var(--w-track)] min-h-[6px]" : track, className)}>
      <div className="h-full w-full rounded-full transition-transform duration-500 ease-out" style={{ ...slideX(pct), background: m === "pill" && t === "ok" ? `linear-gradient(90deg, ${mix(70, "#fff")}, var(--accent))` : TONES[t], ...glide }} />
    </div>
  );
}

export interface BarRowProps {
  label: ReactNode;
  value: number;
  max?: number;
  display?: ReactNode;
  hint?: ReactNode;
  t?: Tone;
  warn?: number;
  crit?: number;
}
export function BarRow({ label, value, max = 100, display, hint, t, warn, crit }: BarRowProps) {
  const tt = t ?? tone((value / max) * 100, warn, crit);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="truncate text-[color:var(--w-fg)]" style={labelStyle("none")}>{label}</span>
        {hint && <span className="truncate text-[11px] text-[color:var(--w-faint)]">{hint}</span>}
        <span className="ml-auto shrink-0 font-medium tabular-nums">{display ?? `${fmt(value, 0)}%`}</span>
      </div>
      <Bar value={value} max={max} t={tt} />
    </div>
  );
}

export interface RingProps {
  value: number;
  max?: number;
  thickness?: number;
  t?: Tone;
  /** Stroke colour; replaces the tone's. */
  color?: string;
  /** The Data API key the ring shows: tags it for the InfoPanel conversion (`data-ip-key`). */
  ipKey?: string;
  /** Track colour (default `--w-track`). */
  track?: string;
  /** Degrees of the arc (default 360, a full ring); less leaves the gap at the bottom. */
  sweep?: number;
  children?: ReactNode;
  className?: string;
}
export function Ring({ value, max = 100, thickness: th0 = 8, t = "ok", color, track, sweep = 360, children, className = "", ipKey: key }: RingProps) {
  const ipKey = useContext(IpTagCtx) ? key : undefined;
  // On the value arc itself, so the track stays in the picture the conversion takes of the rest.
  const tag = ipKey ? { "data-ip-key": ipKey, "data-ip-kind": "ring", "data-ip-max": max, "data-ip-start": sweep < 360 ? -sweep / 2 : 0, "data-ip-sweep": Math.min(360, sweep) } : undefined;
  const sk = useSkin();
  const thickness = Math.max(1.5, th0 * (sk.ring ?? 1));
  const r = 50 - thickness / 2,
    c = 2 * Math.PI * r,
    pct = clamp(value / max, 0, 1);
  const cap = sk.skin === "hud" || sk.skin === "tui" ? "butt" : "round";
  const glide = sk.smooth ? { transition: `stroke-dashoffset ${RING_GLIDE_MS}ms linear` } : undefined;
  if (sweep < 360) {
    // an open arc centred on the top: it starts `sweep / 2` before 12 o'clock (the svg is already turned to start there)
    const arc = (c * clamp(sweep, 1, 360)) / 360;
    return (
      <div className={`relative aspect-square ${className}`}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <g transform={`rotate(${-sweep / 2} 50 50)`}>
            <circle cx="50" cy="50" r={r} fill="none" stroke={track ?? "var(--w-track)"} strokeWidth={thickness} strokeLinecap={cap} strokeDasharray={`${arc} ${c}`} />
            <circle cx="50" cy="50" r={r} fill="none" stroke={color ?? TONES[t]} strokeWidth={thickness} strokeLinecap={cap}
              strokeDasharray={`${arc * pct} ${c}`} style={sk.smooth ? { transition: `stroke-dasharray ${RING_GLIDE_MS}ms linear` } : undefined} data-wp-ring="" {...tag} />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      </div>
    );
  }
  return (
    <div className={`relative aspect-square ${className}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track ?? "var(--w-track)"} strokeWidth={thickness} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color ?? TONES[t]} strokeWidth={thickness} strokeLinecap={cap}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={glide} data-wp-ring="" {...tag} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// Concentric rings, outermost first (SystemOverview tile, GpuRings). `track` defaults to --w-track.
export interface RingStackRing {
  v: number;
  color: string;
  track?: string;
  /** The Data API key the ring shows: tags it for the InfoPanel conversion (`data-ip-key`). */
  ipKey?: string;
}
export interface RingStackProps {
  rings: RingStackRing[];
  thickness?: number;
  gap?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}
export function RingStack({ rings, thickness: th0 = 9, gap = 3, children, className = "", style }: RingStackProps) {
  const sk = useSkin();
  const tagging = useContext(IpTagCtx);
  const thickness = Math.max(1.5, th0 * (sk.ring ?? 1));
  const cap = sk.skin === "hud" || sk.skin === "tui" ? "butt" : "round";
  return (
    <div className={`relative ${className}`} style={style}>
      {/* rotate the drawing, not the svg: a rotated non-square svg's box pokes out of its zone */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
        <g transform="rotate(-90 50 50)">
          {rings.map(({ v, color, track, ipKey }, i) => {
            const r = Math.max(thickness / 2 + 1, 50 - thickness / 2 - i * (thickness + gap)),
              c = 2 * Math.PI * r;
            return (
              <g key={i}>
                <circle cx="50" cy="50" r={r} fill="none" stroke={track ?? "var(--w-track)"} strokeWidth={thickness} />
                <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap={cap}
                  strokeDasharray={c} strokeDashoffset={c * (1 - clamp(v || 0) / 100)} style={sk.smooth ? { transition: `stroke-dashoffset ${RING_GLIDE_MS}ms linear` } : undefined} data-wp-ring=""
                  {...(tagging && ipKey ? { "data-ip-key": ipKey, "data-ip-kind": "ring", "data-ip-max": 100 } : null)} />
              </g>
            );
          })}
        </g>
      </svg>
      {children != null && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

// Smooth (Catmull-Rom → cubic Bézier) area sparkline. Stretches to any box.
type Pt = [number, number];
const smoothPath = (pts: Pt[]) =>
  pts.reduce((acc, p, i, a) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const p0 = a[i - 2] ?? a[i - 1],
      p1 = a[i - 1],
      p3 = a[i + 1] ?? p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6];
    const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    return `${acc}C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  }, "");
const BR_L = [0x01, 0x02, 0x04, 0x40],
  BR_R = [0x08, 0x10, 0x20, 0x80];
/** Braille columns that fit `width`; `charW` is the measured advance, as the glyph may fall back to a wider font. */
export const brailleCols = (width: number, charW: number) => Math.max(1, Math.floor(width / (charW > 0 ? charW : 6.02)));
// btop-style braille area graph: 2×4 dots per character, rows tinted accent → red toward the top
function Braille({ values, lo, hi, className }: { values: number[]; lo: number; hi: number; className: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dim, setDim] = useState({ c: 0, r: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // measure the real glyph advance and the layout width in the same (zoom-adjusted) units
      const probe = document.createElement("span");
      // Out of the flow: the probe must not resize the element this observer watches (a ResizeObserver loop).
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
      probe.textContent = "⣿".repeat(40);
      el.appendChild(probe);
      const charW = probe.getBoundingClientRect().width / 40 / (el.getBoundingClientRect().width / (el.clientWidth || 1) || 1);
      el.removeChild(probe);
      // no row under 10px: a squeezed graph draws nothing rather than a clipped row
      setDim({ c: brailleCols(el.clientWidth, charW), r: Math.floor(el.clientHeight / 10) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { c: cols, r: nRows } = dim,
    n = cols * 2,
    span = hi - lo || 1;
  const hts = Array.from({ length: n }, (_, i) => {
    const x = (values.length - 1) * (n > 1 ? i / (n - 1) : 1),
      a = values[Math.floor(x)],
      b = values[Math.ceil(x)];
    return Math.round(((a + (b - a) * (x % 1) - lo) / span) * nRows * 4);
  });
  const lines = Array.from({ length: nRows }, (_, cy) => {
    let s = "";
    for (let cx = 0; cx < cols; cx++) {
      let bits = 0;
      for (let sub = 0; sub < 4; sub++) {
        const lvl = (nRows - 1 - cy) * 4 + (3 - sub);
        if (lvl < hts[cx * 2]) bits |= BR_L[sub];
        if (lvl < hts[cx * 2 + 1]) bits |= BR_R[sub];
      }
      s += String.fromCharCode(0x2800 + bits);
    }
    return s;
  });
  return (
    <div ref={ref} className={`overflow-hidden whitespace-pre font-mono text-[10px] leading-[10px] ${className}`} style={{ fontFamily: "'JetBrains Mono','Geist Mono',monospace" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: `color-mix(in oklab, var(--accent) ${Math.round(100 - (1 - i / Math.max(1, nRows - 1)) * 70)}%, ${STATE.crit})` }}>{l}</div>
      ))}
    </div>
  );
}

/** Where `v` sits in a graph over [lo, hi], in % from the top (a 3 % margin, clamped to 2–98): lines drawn over a Spark line up with it. */
export const sparkY = (v: number, lo: number, hi: number): number => Math.min(98, Math.max(2, 100 - ((v - lo) / (hi - lo || 1)) * 94 - 3));

/** One marked sample: its index, value, and position in % of the graph (x from the left, y from the top, as `sparkY`). */
export interface SparkMark {
  i: number;
  v: number;
  x: number;
  y: number;
}

/**
 * The marks a graph over [lo, hi] can carry: the last sample, and the lowest and highest (a tie takes the latest). Non-finite
 * samples are skipped. `min` / `max` are null when they add nothing: a flat series, or the extreme is the last sample itself.
 */
export function sparkMarks(values: readonly number[], lo: number, hi: number): { last: SparkMark | null; min: SparkMark | null; max: SparkMark | null } {
  const at = (i: number): SparkMark => ({ i, v: values[i], x: values.length > 1 ? (i / (values.length - 1)) * 100 : 100, y: sparkY(values[i], lo, hi) });
  let last = -1,
    min = -1,
    max = -1;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    last = i;
    if (min < 0 || v <= values[min]) min = i;
    if (max < 0 || v >= values[max]) max = i;
  });
  if (last < 0) return { last: null, min: null, max: null };
  const flat = values[max] - values[min] < 1e-9;
  return { last: at(last), min: flat || min === last ? null : at(min), max: flat || max === last ? null : at(max) };
}

/** The line and area paths of a line / area / step graph over [lo, hi]; the points' x runs 0–100. `curve` false: straight segments. */
function sparkPaths(pts: readonly ScrollPoint[], lo: number, hi: number, step: boolean, curve = true): { line: string; area: string } {
  const P: Pt[] = pts.map(([x, v]) => [x, sparkY(v, lo, hi)]);
  const line = step
    ? P.reduce((a, p, i) => (i ? `${a}H${p[0].toFixed(2)}V${p[1].toFixed(2)}` : `M${p[0].toFixed(2)},${p[1]}`), "")
    : curve
      ? smoothPath(P)
      : P.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("");
  const x0 = P[0][0].toFixed(2);
  return { line, area: step ? `${line}V100H${x0}Z` : `${line}L100,100L${x0},100Z` };
}

/** The auto range of a graph: the given bounds, else the data's (headroom on top). */
const sparkRange = (values: readonly number[], min?: number, max?: number): [number, number] => [min ?? Math.min(...values), max ?? Math.max(...values) * 1.08];

interface GraphPathsProps {
  values: number[];
  min?: number;
  max?: number;
  step: boolean;
  /** Draw the area (or the step fill) under the line. */
  fill: boolean;
  fillId: string;
  color: string;
  strokeWidth: number;
  /** The graph glows: a filter (`data-wp-glow`) or, under `data-glow-static`, a wide faint copy of the line. */
  glow?: boolean;
  /** A curve through the samples (default); false draws straight segments, for spiky data a curve would overshoot. */
  curve?: boolean;
}

/** The fill gradient, fill and line of a line / area / step graph. */
function GraphPaths({ line, area, step, fill, fillId, color, strokeWidth, glow, refs }: { line: string; area: string; step: boolean; fill: boolean; fillId: string; color: string; strokeWidth: number; glow?: boolean; refs?: { line: RefObject<SVGPathElement | null>; area: RefObject<SVGPathElement | null>; glow?: RefObject<SVGPathElement | null> } }) {
  return (
    <>
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".32" />
          <stop offset=".7" stopColor={color} stopOpacity=".06" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path ref={refs?.area} d={area} fill={step ? color : `url(#${fillId})`} opacity={step ? 0.08 : undefined} />}
      {glow && <path ref={refs?.glow} data-wp-glow-line="" d={line} fill="none" stroke={color} strokeWidth={strokeWidth * 3} opacity={0.3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
      <path ref={refs?.line} d={line} fill="none" stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}

/**
 * A line / area / step graph that scrolls smoothly (`smoothing: smooth`): every sample sits at its
 * arrival time and the graph moves at a steady speed, two (eased) intervals behind the feed (`SmoothScroll`), so
 * the segment into the newest reading slides in and uneven arrivals neither jump nor stop it; the
 * auto range eases. React renders once per sample; the animation loop writes the paths.
 */
function SmoothGraph({ values, min, max, step, fill, fillId, color, strokeWidth, glow, curve = true, className }: GraphPathsProps & { className: string }) {
  const line = useRef<SVGPathElement>(null);
  const glowLine = useRef<SVGPathElement>(null);
  const area = useRef<SVGPathElement>(null);
  const scroll = useRef(new SmoothScroll(HISTORY_LEN));
  const easer = useRef(new RangeEaser(300));
  const fixed = min !== undefined && max !== undefined;
  // The loop stops once the curve has converged on its target (three identical paths in a row) and restarts with new values.
  const [settled, setSettled] = useState(false);
  const still = useRef({ d: "", n: 0 });
  const svg = useRef<SVGSVGElement>(null);
  // Redraws wait until the line has moved about half a pixel (`scrollWaitMs`); `widthPx` is read once per sample.
  const pace = useRef({ widthPx: 0, waited: 0, easing: false });
  // before paint: a frame drawn between the new history and its arrival time would be skipped (a hitch)
  useLayoutEffect(() => {
    scroll.current.arrive(values.length, performance.now());
    pace.current.widthPx = (svg.current?.getBoundingClientRect().width ?? 0) * (window.devicePixelRatio || 1);
    still.current.n = 0;
    setSettled(false);
  }, [values]);
  // A new range or step redraws the curve too.
  useLayoutEffect(() => {
    still.current.n = 0;
    setSettled(false);
  }, [min, max, step]);
  useAnimationFrame((now, tickMs) => {
    const pc = pace.current;
    pc.waited += tickMs;
    // A rescale eases at every frame; a plain scroll waits.
    if (!pc.easing && pc.waited < scrollWaitMs(pc.widthPx, scroll.current.windowMs)) return;
    const dt = pc.waited;
    pc.waited = 0;
    const pts = line.current && scroll.current.frame(values, now, dt);
    if (!pts) return;
    const shown = pts.filter(([x]) => x >= -5 && x <= 105).map((p) => p[1]);
    const target = sparkRange(shown.length > 1 ? shown : values, min, max);
    const d = sparkPaths(pts, ...(fixed ? target : easer.current.next(target, dt)), step, curve);
    pc.easing = !fixed && easer.current.moving(target);
    line.current!.setAttribute("d", d.line);
    glowLine.current?.setAttribute("d", d.line);
    area.current?.setAttribute("d", d.area);
    const s = still.current;
    s.n = d.line === s.d ? s.n + 1 : 0;
    s.d = d.line;
    if (s.n >= 3) setSettled(true);
  }, !settled, "graph:smooth");
  // The first paint only: after mount the loop owns `d`. A path recomputed per render would make
  // React write the static layout on every new sample, flashing it for a frame.
  const [first] = useState(() => sparkPaths(values.map((v, i) => [(i / (values.length - 1)) * 100, v]), ...sparkRange(values, min, max), step, curve));
  return (
    <svg ref={svg} viewBox="0 0 100 100" preserveAspectRatio="none" className={`block w-full overflow-hidden ${className}`} data-wp-glow={glow ? "" : undefined}>
      <GraphPaths line={first.line} area={first.area} step={step} fill={fill} fillId={fillId} color={color} strokeWidth={strokeWidth} glow={glow} refs={{ line, area, glow: glowLine }} />
    </svg>
  );
}

export interface SparkProps {
  values?: number[];
  min?: number;
  max?: number;
  className?: string;
  fill?: boolean;
  color?: string;
  width?: number;
  graph?: string;
  /** false: straight segments between samples instead of a curve (line / area graphs). */
  curve?: boolean;
  /**
   * Off by default. Marks the last sample with a dot and the lowest and highest with their values (a graph over a fixed
   * range prints its scale instead); `"last"` is the dot alone. Not drawn under braille or a smooth-scrolling graph.
   */
  marks?: boolean | "last";
  /** The text of a mark's value; default the reading to one decimal, none from 100. */
  format?: (v: number) => string;
}
// Graph styles: area · line · step · bars · dots · braille (from the skin, or pass graph=)
export function Spark(p: SparkProps & { ipKey?: string }) {
  const tagging = useContext(IpTagCtx);
  const { ipKey, ...rest } = p;
  if (!ipKey || !tagging) return <SparkBase {...rest} />;
  return (
    <div data-ip-key={ipKey} data-ip-kind="graph" data-ip-max={rest.max} className={rest.className ?? "h-10"}>
      <SparkBase {...rest} className="h-full" />
    </div>
  );
}

/** The scrolling graph (`smoothing: smooth`) draws line / area / step once there is a history to scroll. */
const scrollsSmooth = (smooth: boolean | undefined, reduced: boolean, mode: string, n: number): boolean => !!smooth && !reduced && (mode === "area" || mode === "line" || mode === "step") && n >= 6;

/** `Spark`, plus the marks over it when asked for (a wrapper only then: the svg stretches, so dots and text are HTML). */
function SparkBase(p: SparkProps) {
  const sk = useSkin();
  const reduced = useReducedMotion();
  const mode = p.graph ?? sk.graph ?? "area";
  const values = p.values ?? [];
  if (!p.marks || values.length < 2 || mode === "braille" || scrollsSmooth(sk.smooth, reduced, mode, values.length)) return <SparkGraph {...p} />;
  return (
    <div className={/\b(?:absolute|relative)\b/.test(p.className ?? "") ? p.className : `relative ${p.className ?? "h-10"}`}>
      <SparkGraph {...p} className="h-full" />
      <SparkMarks values={values} min={p.min} max={p.max} last={p.marks === "last"} bars={mode === "bars" || mode === "dots"} color={p.color || "var(--accent)"} format={p.format} glow={!!sk.numGlow} />
    </div>
  );
}

/** The last-sample dot, the lowest and highest values (or, over a fixed range, its scale), over a graph's box. Decoration: the reading is in the widget's text. */
function SparkMarks({ values, min, max, last: lastOnly, bars, color, format, glow }: { values: number[]; min?: number; max?: number; last: boolean; bars: boolean; color: string; format?: (v: number) => string; glow: boolean }) {
  const [lo, hi] = sparkRange(values, min, max);
  const m = sparkMarks(values, lo, hi);
  const text = format ?? ((v: number) => fmt(v, Math.abs(v) >= 100 ? 0 : 1));
  const label = "absolute whitespace-nowrap text-micro leading-none tabular-nums text-[color:var(--w-faint)]";
  // a label hangs off its point toward the middle: right-aligned near the right edge, left-aligned near the left
  const side = (x: number): CSSProperties => (x > 85 ? { right: `${100 - x}%` } : x < 15 ? { left: `${x}%` } : { left: `${x}%`, transform: "translateX(-50%)" });
  const crowded = !!m.min && !!m.max && Math.abs(m.min.x - m.max.x) < 14 && m.min.y - m.max.y < 45;
  const fixed = min !== undefined && max !== undefined;
  return (
    <>
      {m.last && (
        <span aria-hidden className="absolute h-1.5 w-1.5 rounded-full" style={{ left: `${bars ? 100 - 50 / values.length : m.last.x}%`, top: `${m.last.y}%`, transform: "translate(-50%,-50%)", background: color, boxShadow: `0 0 0 2px rgba(0,0,0,.35)${glow ? ", 0 0 6px var(--accent)" : ""}` }} />
      )}
      {!lastOnly && fixed && (
        <>
          <span aria-hidden className={`${label} right-0 top-0`}>{text(hi)}</span>
          <span aria-hidden className={`${label} bottom-0 right-0`}>{text(lo)}</span>
        </>
      )}
      {!lastOnly && !fixed && m.max && (
        <span aria-hidden className={label} style={{ top: `calc(${m.max.y}% + 5px)`, ...side(m.max.x) }}>{text(m.max.v)}</span>
      )}
      {!lastOnly && !fixed && m.min && !crowded && (
        <span aria-hidden className={label} style={{ bottom: `calc(${100 - m.min.y}% + 5px)`, ...side(m.min.x) }}>{text(m.min.v)}</span>
      )}
    </>
  );
}

function SparkGraph({ values = [], min, max, className = "h-10", fill = true, color: own, width = 1.75, graph, curve = true }: SparkProps) {
  // An unset color setting arrives as "": the accent, as when none is passed.
  const color = own || "var(--accent)";
  const id = `sp${useId().replace(/:/g, "")}`;
  const sk = useSkin();
  const reduced = useReducedMotion();
  const mode = graph ?? sk.graph ?? "area";
  if (values.length < 2) return <div className={className} />;
  const [lo, hi] = sparkRange(values, min, max);
  if (mode === "braille") return <Braille values={values} lo={lo} hi={hi} className={className} />;
  const glow = !!sk.glow;
  const step = mode === "step";
  const strokeWidth = (sk.skin === "ink" ? 1 : width) * sk.stroke;
  const showFill = fill && (mode === "area" || step);
  if (scrollsSmooth(sk.smooth, reduced, mode, values.length))
    return <SmoothGraph values={values} min={min} max={max} step={step} fill={showFill} fillId={id} color={color} strokeWidth={strokeWidth} glow={glow} curve={curve} className={className} />;
  const Y = (v: number) => sparkY(v, lo, hi);
  const svg = (kids: ReactNode) => (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`block w-full overflow-visible ${className}`} data-wp-glow={glow ? "" : undefined}>
      {kids}
    </svg>
  );
  if (mode === "bars" || mode === "dots") {
    const w = 100 / values.length;
    return svg(
      values.map((v, i) =>
        mode === "bars" ? (
          <rect key={i} x={i * w + w * 0.15} y={Y(v)} width={w * 0.7} height={100 - Y(v)} fill={color} opacity={0.35 + 0.65 * (i / values.length)} />
        ) : (
          <rect key={i} x={i * w + w * 0.2} y={Y(v) - 2} width={w * 0.6} height="4" rx="1" fill={color} opacity={0.3 + 0.7 * (i / values.length)} />
        )
      )
    );
  }
  const d = sparkPaths(values.map((v, i) => [(i / (values.length - 1)) * 100, v]), lo, hi, step, curve);
  return svg(<GraphPaths line={d.line} area={d.area} step={step} fill={showFill} fillId={id} color={color} strokeWidth={strokeWidth} glow={glow} />);
}

export const Dot = ({ ok, className = "" }: { ok?: boolean; className?: string }) => (
  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} style={{ background: ok ? "#4ade80" : "#52525b", boxShadow: ok ? "0 0 6px #4ade80" : "none" }} />
);
export const Chip = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[color:var(--w-track)] px-1.5 py-0.5 text-micro font-medium text-[color:var(--w-fg)] ${className}`}>{children}</span>
);
export const Stat = ({ label, value, className = "", tag }: { label?: ReactNode; value?: ReactNode; className?: string; tag?: Record<string, string | number> }) => (
  <div className={`flex min-w-0 flex-col gap-0.5 ${className}`} style={{ alignItems: "var(--wp-x-cross, stretch)" }}>
    <span className="max-w-full truncate text-micro text-[color:var(--w-faint)]" style={labelStyle("none")}>{label}</span>
    <span {...tag} className="max-w-full truncate text-[13px] font-medium tabular-nums text-[color:var(--w-fg)]">{value}</span>
  </div>
);
/** A footer row of label/value stats under a rule, `cols` per row (3 or 4). */
export function StatGrid({ items, cols = 4 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: 3 | 4 }) {
  return (
    <div className={`grid ${cols === 3 ? "grid-cols-3" : "grid-cols-4"} border-t border-[color:var(--w-track)] pt-3`} style={{ gap: ws.gap("0.75rem") }}>
      {items.map((x, i) => (
        <Stat key={i} label={x.label} value={x.value} />
      ))}
    </div>
  );
}
/** One legend line: colour swatch, label, trailing value. A null colour keeps the column but draws no swatch. */
export function LegendRow({ color, label, value, className = "text-[12.5px]", tag }: { color?: string | null; label: ReactNode; value?: ReactNode; className?: string; tag?: Record<string, string | number> }) {
  return (
    <div className={`grid min-w-0 grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 ${className}`}>
      <i className={`h-2.5 w-2.5 rounded-[3px] ${color ? "ring-1 ring-inset ring-[color:var(--w-fg)]/15" : ""}`} style={{ background: color ?? "transparent" }} />
      <span className="truncate text-[color:var(--w-muted)]" style={labelStyle("none")}>{label}</span>
      <span {...tag} className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
/** A dark frosted pill for overlays on artwork. */
export const GlassPill = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-zinc-100 ring-1 ring-white/10 backdrop-blur-md ${className}`} data-wp-inner-blur="">{children}</span>
);
/** Set by the QA page (`widget-qa/Frame.tsx`): `Empty` then marks itself `data-wp-empty`, so its parity check can tell an empty state from content. Elsewhere the markup stays as it is. */
export const MarkEmptyCtx = createContext(false);

export function Empty({ icon = "sensors_off", label = "No data" }: { icon?: string; label?: ReactNode }) {
  const mark = useContext(MarkEmptyCtx);
  return (
    <div data-wp-empty={mark ? "" : undefined} className="flex h-full flex-col items-center justify-center gap-1 text-[color:var(--w-faint)]">
      <Icon name={icon} className="text-xl" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
// Image with graceful fallback (localhost cover art, Steam CDN, …)
export function Img({ src, className = "", icon = "image", alt = "", style }: { src?: string; className?: string; icon?: string; alt?: string; style?: CSSProperties }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!has(src) || bad)
    return (
      <div className={`flex items-center justify-center bg-[color:var(--w-track)] text-[color:var(--w-faint)] ${className}`} style={style}>
        <Icon name={icon} className="text-[1.6em]" />
      </div>
    );
  return <img src={src} alt={alt} onError={() => setBad(true)} className={`object-cover ${className}`} style={style} />;
}

/* ───────── shared building blocks (extracted from widgets during the audit) ───────── */
// Skin-aware big numerals (font, weight, stretch, glow). Use for every hero number.
export function Num({ children, className = "", style, weight = 700, ipKey: key, ipUnit, ipMul, ip }: { children?: ReactNode; className?: string; style?: CSSProperties; weight?: number; ipKey?: string; ipUnit?: string; ipMul?: number; ip?: Record<string, string | number> }) {
  const sk = useSkin();
  const ipKey = useContext(IpTagCtx) ? key : undefined;
  return (
    <span data-ip-key={ipKey} data-ip-kind={ipKey ? "value" : undefined} data-ip-unit={ipKey ? ipUnit : undefined} data-ip-mul={ipKey ? ipMul : undefined} {...ip} className={`tabular-nums ${className}`} style={{ fontFamily: sk.num, fontWeight: sk.numWeight ?? weight, fontStretch: sk.numStretch, ...numGlowStyle(sk), ...style }}>
      {children}
    </span>
  );
}
// Status pill: state 'ok' | 'warn' | 'crit' | 'off' — filled dot for live states, hollow dot for off.
const PILL: Record<string, string> = { ok: STATE.ok, warn: STATE.warn, crit: STATE.crit, off: "#a1a1aa" };
export function Pill({ state = "ok", children, className = "" }: { state?: Tone | "off"; children?: ReactNode; className?: string }) {
  const c = PILL[state] ?? PILL.off;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${className}`} style={{ color: c, background: state === "off" ? "var(--w-track)" : `color-mix(in oklab, ${c} 13%, transparent)` }}>
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={state === "off" ? { border: "1.5px solid currentColor" } : { background: "currentColor" }} />
      {children}
    </span>
  );
}
// Segmented control: options [[value, label]]
export function Segmented<T extends string>({ value, options, onChange, className = "" }: { value: T; options: [T, ReactNode][]; onChange?: (v: T) => void; className?: string }) {
  return (
    <span className={`inline-flex rounded-md bg-[color:var(--w-track)] p-[2px] ${className}`}>
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange?.(v)} className={`whitespace-nowrap rounded px-2 py-0.5 text-micro ${value === v ? "bg-[color:var(--w-fg)]/[0.12] text-[color:var(--w-fg)]" : "text-[color:var(--w-muted)]"}`}>
          {l}
        </button>
      ))}
    </span>
  );
}
// Weather condition text / icon slug → Material Symbols name (Yr + OpenWeatherMap)
export const weatherIcon = (text = ""): string => appIconName(weatherKind(undefined, text));
// Slow pan/zoom background image (stepped on the shared ticker at the ambient rate: Max FPS caps it, reduced motion stops it)
export function KenBurns({ src, className = "", on = true, ip }: { src?: string; className?: string; on?: boolean; ip?: Record<string, string | number> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const live = on && !reduced;
  const start = useRef<number | null>(null);
  useTick((now) => {
    const el = ref.current;
    if (!el) return;
    start.current ??= now;
    const p = alternate(now - start.current, 22000);
    el.style.transform = `scale(${1.06 + 0.12 * p}) translate(${-2.5 * p}%,${-1.5 * p}%)`;
  }, live, AMBIENT_FPS, "kenburns");
  useEffect(() => {
    start.current = null;
    return () => {
      if (ref.current) ref.current.style.transform = "";
    };
  }, [live, src]);
  // the art is scaled past its box; its own clip keeps that bleed out of the widget's scroll area
  return (
    <div data-qa-bleed {...ip} className="absolute inset-0 overflow-hidden">
      <div ref={ref} className={`absolute inset-0 ${className}`}>
        <Img src={src} icon="sports_esports" className="h-full w-full" />
      </div>
    </div>
  );
}
// Logo image that falls back to a typeset title when the URL can't load (uppercase inline: a name, not a label, so the label case leaves it)
export function Logo({ src, name, className = "", size = "text-3xl", ip }: { src?: string; name?: string; className?: string; size?: string; ip?: Record<string, string | number> }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!has(src) || bad) return <span style={{ textTransform: "uppercase" }} className={`block font-black leading-[0.9] tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] ${size} ${className}`}>{name}</span>;
  return <img src={src} alt={name} onError={() => setBad(true)} {...ip} className={`object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,.7)] ${className}`} />;
}

/** A peak-hold tick at `at` % along a meter. A full-size wrapper slides with transform (percent of itself = of the meter). */
export function HoldMark({ at, vertical }: { at: number; vertical?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-transform duration-150"
      style={{ transform: vertical ? `translateY(${-at}%)` : `translateX(${at}%)` }}
    >
      <span className="absolute rounded-full bg-[color:var(--w-fg)]" style={vertical ? { bottom: -1, left: -1, right: -1, height: 2 } : { left: -1, top: -1, bottom: -1, width: 2 }} />
    </span>
  );
}

export interface LedLadderProps {
  /** 0..100 */
  value: number;
  n?: number;
  vertical?: boolean;
  /** Horizontal ladders fill from the right (the mirrored left channel). */
  reverse?: boolean;
  /** Where the amber and the red zone start, in % of the scale. */
  zones?: [warn: number, clip: number];
  /** Peak-hold marker position in %; none when unset. */
  hold?: number;
  /** Colour of the safe zone, default the accent. */
  color?: string;
  /** Colour of the clip zone, default red. */
  hotColor?: string;
  /** The Data API key of the level: tags the ladder for the InfoPanel conversion, which redraws it as a segmented gauge. */
  ipKey?: string;
}
// Segmented level ladder, accent → amber → red; a segment is lit when its centre is at or below the value.
const UNLIT = 12;
export function LedLadder({ value, n = 24, vertical, reverse, zones = [72, 90], hold, color = "var(--accent)", hotColor = STATE.crit, ipKey }: LedLadderProps) {
  const v = clamp(value);
  const tagging = useContext(IpTagCtx) && ipKey;
  // The zone colours as CSS (the conversion resolves them on the page), the unlit one last.
  const tag = tagging
    ? { "data-ip-key": ipKey, "data-ip-kind": "meter", "data-ip-segments": n, "data-ip-zones": `${zones[0]},${zones[1]}`, "data-ip-colors": JSON.stringify([color, STATE.warn, hotColor, `color-mix(in oklab, ${color} ${UNLIT}%, var(--w-track))`]), ...(vertical ? { "data-ip-vertical": "" } : {}), ...(reverse ? { "data-ip-reverse": "" } : {}) }
    : undefined;
  return (
    <div {...tag} className={`relative flex flex-1 gap-[2px] ${vertical ? "w-full flex-col-reverse" : `h-full ${reverse ? "flex-row-reverse" : "flex-row"}`}`}>
      {Array.from({ length: n }, (_, i) => {
        const at = ((i + 0.5) / n) * 100;
        const c = at > zones[1] ? hotColor : at > zones[0] ? STATE.warn : color;
        // unlit segments are the surface's track tinted by their zone, so they read on light surfaces as well as dark
        return <span key={i} className="min-h-0 min-w-0 flex-1 rounded-[2px]" style={at <= v ? { background: c, opacity: 1 } : { background: `color-mix(in oklab, ${c} ${UNLIT}%, var(--w-track))` }} />;
      })}
      {hold !== undefined && hold > 0 && <HoldMark at={clamp(hold)} vertical={vertical} />}
    </div>
  );
}
