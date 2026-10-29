import { useEffect, useRef } from "react";
import { readCpuFlat } from "@/lib/system-metrics";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, get, num, fmt, heat, rampColor, accentOf, hw, Num, useIpTag, type ShellProps } from "./kit";
import { meta } from "./meta/CoreHeatmap";

export { meta };

const HEX = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
const arc = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) => {
  const p = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
};

type Metric = "load" | "clock" | "power" | "vid";

export interface CoreHeatmapProps extends ShellProps {
  look?: ModuleSettings;
  cpu?: string;
  shape?: "grid" | "hex" | "radial" | "waterfall";
  ramp?: "accent" | "thermal" | "viridis" | "magma" | "ice" | "synth" | "mono";
  metric?: Metric;
  showValues?: boolean;
  /** Waterfall columns. */
  history?: number;
  /** Load above which a grid cell gets an outline. */
  hotOutline?: number;
}

interface Core {
  i: number;
  load: number;
  mhz: number;
  w: number;
  vid: number;
}

export default function CoreHeatmap(p: CoreHeatmapProps) {
  const d = p.data;
  const id = p.cpu ?? hw(d).cpu;
  const k = (s: string) => num(get(d, `libre.${id}_${s}`));
  const tag = useIpTag();
  const metric = p.metric ?? "load",
    ramp = p.ramp ?? "accent",
    shape = p.shape ?? "grid";
  // Tagged only on the studio canvas, so the kiosk draws the label as it did.
  const ip = metric === "load" && Object.keys(tag("x")).length > 0;
  // loads by role (AMD's, Intel's and HWiNFO's thread keys); per-core clock, power and voltage in AMD's keys, else Intel's
  const either = (a: number, b: number) => (Number.isFinite(a) ? a : b);
  const cores: Core[] = (id ? readCpuFlat(d ?? {}, id).cores : []).slice(0, 64).map((load, n) => {
    const i = n + 1;
    return {
      i,
      load,
      mhz: either(k(`core__${i}__effective`), k(`cpu_core__${i}_clock`)),
      w: either(k(`core__${i}__smu`), k(`cpu_core__${i}_power`)),
      vid: either(k(`core__${i}_vid`), k(`cpu_core__${i}_voltage`)),
    };
  });
  const raw = (c: Core) => ({ load: c.load, clock: c.mhz, power: c.w, vid: c.vid })[metric];
  const maxV = metric === "load" ? 100 : Math.max(1e-6, ...cores.map(raw));
  const norm = (c: Core) => (raw(c) / maxV) * 100;
  const label = (c: Core) => (metric === "clock" ? fmt(c.mhz / 1000, 1) : metric === "power" ? fmt(c.w, 1) : metric === "vid" ? fmt(c.vid, 2) : fmt(c.load, 0));
  const total = k("cpu_total");
  const hot = cores.reduce<Core | null>((a, c) => (c.load > (a?.load ?? -1) ? c : a), null) ?? { i: 0, load: 0 };
  const hotLine = p.hotOutline ?? 80;
  const hist = useRef<number[][]>([]);
  const sig = cores.map(norm).join(",");
  const lastSig = useRef("");
  if (sig !== lastSig.current) {
    lastSig.current = sig;
    hist.current = [...hist.current, cores.map(norm)].slice(-(p.history ?? 60));
  }
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || shape !== "waterfall") return;
    const { width: w, height: h } = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, w * dpr);
    cv.height = Math.max(1, h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const acc = accentOf(cv),
      cols = p.history ?? 60,
      rows = cores.length || 1,
      cw = w / cols,
      rh = h / rows;
    hist.current.forEach((col, x) =>
      col.forEach((v, y) => {
        ctx.fillStyle = ramp === "accent" ? rampColor(v / 100, "accent", acc) : rampColor(v / 100, ramp);
        ctx.fillRect((cols - hist.current.length + x) * cw, y * rh, Math.ceil(cw) + 0.5, Math.max(1, rh - 1));
      })
    );
  });
  const text = (v: number) => (v > 58 && ramp !== "magma" && ramp !== "viridis" ? "#0c0c0e" : "var(--w-fg)");
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? `Cores · ${metric}`}
      icon="grid_on"
      studio={{ label: `CPU · ${cores.length} cores`, value: total, unit: "%", cells: cores.map(norm), sub: metric }}
      right={
        <span className="tabular-nums text-[color:var(--w-muted)]">
          {fmt(total, 0)}%{cores.length ? ` · hottest T${hot.i} ${fmt(hot.load, 0)}%` : ""}
        </span>
      }
    >
      {({ w, h, size }) => {
        const n = cores.length || 1;
        if (shape === "waterfall")
          return (
            <div className="flex h-full min-h-0 gap-2">
              {size !== "xs" && (
                <div className="flex flex-col justify-between py-0.5 text-[9px] tabular-nums text-[color:var(--w-faint)]">
                  {cores.filter((_, i) => i % Math.ceil(n / Math.max(2, Math.floor(h / 16))) === 0).map((c) => (
                    <span key={c.i}>{c.i}</span>
                  ))}
                </div>
              )}
              <canvas ref={canvas} className="h-full min-w-0 flex-1 rounded-md" style={{ imageRendering: "pixelated" }} />
            </div>
          );
        if (shape === "hex") {
          const ratio = w / Math.max(1, h);
          const cols = Math.max(2, Math.min(n, Math.round(Math.sqrt(n * ratio * 1.15))));
          const rowsN = Math.ceil(n / cols);
          const r = 10,
            dx = r * Math.sqrt(3),
            dy = r * 1.5;
          const vw = cols * dx + dx / 2,
            vh = (rowsN - 1) * dy + 2 * r;
          return (
            <svg viewBox={`0 0 ${vw} ${vh}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
              {cores.map((c, i) => {
                const col = i % cols,
                  row = Math.floor(i / cols);
                const cx = dx / 2 + col * dx + (row % 2 ? dx / 2 : 0),
                  cy = r + row * dy;
                const v = norm(c);
                return (
                  <g key={c.i}>
                    <title>{`Core ${c.i} · ${fmt(c.load, 0)}% · ${fmt(c.mhz, 0)} MHz`}</title>
                    <polygon points={HEX(cx, cy, r * 0.92)} fill={heat(v, ramp)} style={{ transition: "fill .7s" }} data-wp-ring="" />
                    {(p.showValues ?? size !== "xs") && (
                      <text x={cx} y={cy + 2.2} textAnchor="middle" fontSize="6" fontWeight="600" fill={text(v)} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {label(c)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          );
        }
        if (shape === "radial") {
          const gap = 0.035;
          return (
            <div className="relative flex h-full items-center justify-center">
              <svg viewBox="0 0 100 100" className="aspect-square h-full max-w-full">
                {cores.map((c, i) => {
                  const a0 = (i / n) * 2 * Math.PI + gap,
                    a1 = ((i + 1) / n) * 2 * Math.PI - gap;
                  const v = norm(c);
                  return (
                    <g key={c.i}>
                      <title>{`Core ${c.i} · ${fmt(c.load, 0)}%`}</title>
                      <path d={arc(50, 50, 30, 47, a0, a1)} fill="var(--w-track)" />
                      <path d={arc(50, 50, 30, 30 + 17 * Math.max(0.06, v / 100), a0, a1)} fill={heat(v, ramp)} style={{ transition: "d .7s, fill .7s" }} data-wp-ring="" />
                    </g>
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <Num className={`${size === "xs" ? "text-base" : "text-2xl"} font-semibold`}>
                  {fmt(total, 0)}
                  <span className="text-[0.5em] text-[color:var(--w-muted)]">%</span>
                </Num>
                {size !== "xs" && <span className="text-[10px] text-[color:var(--w-faint)]">{n} cores</span>}
              </div>
            </div>
          );
        }
        const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (w / Math.max(1, h))))));
        return (
          <div className="grid h-full gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
            {cores.map((c) => {
              const v = norm(c);
              return (
                <div
                  key={c.i}
                  title={`Core ${c.i} · ${fmt(c.load, 0)}% · ${fmt(c.mhz, 0)} MHz · ${fmt(c.vid, 2)} V`}
                  className="flex min-h-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums"
                  style={{ background: `color-mix(in srgb, ${heat(v, ramp)} ${Math.round(18 + v * 0.82)}%, var(--w-track))`, color: text(v), outline: v > hotLine ? "2px solid #F2665E" : "none", outlineOffset: -2 }}
                >
                  {/* the load is tagged for the InfoPanel conversion; the other metrics are scaled, so they stay in its picture */}
                  {(p.showValues ?? size !== "xs") && (ip ? <span {...tag(`libre.${id}_cpu_core__${c.i}`)}>{label(c)}</span> : label(c))}
                </div>
              );
            })}
          </div>
        );
      }}
    </Widget>
  );
}
