// The pieces the layout variants (`src/widgets/layouts.ts`) draw with: a notched box, a section label with its count, a readout with
// its decimals and unit set small over a solid-and-dotted rule, a signal graph and a low / mean / high trio. Every colour is a card
// variable or the caller's, and every number is a `num` part, so a pack's CSS and variants reach them as they reach the standard
// layouts. Local to the layouts until the shared readout and slab primitives land (lane K); they keep the same props.
import type { CSSProperties, ReactNode } from "react";
import { fmt } from "../core/data";
import { Num } from "../core/primitives";

/** A box with its bottom-right corner cut by `cut` px (the kit's notch). */
export const notch = (cut: number): CSSProperties => ({ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)` });

/** The kit's 45-degree hatch in `color` at `alpha` %, a 1 px line every 6 px (a weekend column, a quiet cell). */
export const hatch = (alpha: number, color = "var(--w-accent)"): string =>
  `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} ${alpha}%, transparent) 0 1px, transparent 1px 6px)`;

/** Upper-case tracked text in the accent: a section's name. */
export function SectionLabel({ children, right, className = "" }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 items-baseline justify-between gap-2 leading-none ${className}`}>
      <span data-part="label" className="truncate text-micro font-semibold uppercase tracking-[0.08em] text-[color:var(--w-accent)]">{children}</span>
      {right !== undefined && <span className="shrink-0 text-micro">{right}</span>}
    </div>
  );
}

/** A reading as the kit's readout: the whole number at `px`, the decimals and the unit smaller, over a solid rule and a dotted one in `ruleColor` (else `color`, else the accent). */
export function Readout({ value, decimals, unit, px, color, ruleColor, rule = true, ip }: { value: number; decimals: number; unit?: string; px: number; color?: string; ruleColor?: string; rule?: boolean; ip?: Record<string, string | number> }) {
  const text = Number.isFinite(value) ? fmt(value, decimals) : "–";
  const dot = text.lastIndexOf(".");
  const [whole, frac] = dot > 0 && decimals > 0 ? [text.slice(0, dot), text.slice(dot)] : [text, ""];
  return (
    <div className="flex min-w-0 flex-col items-start" style={{ gap: Math.max(2, px * 0.08) }}>
      <Num ip={ip} className="whitespace-nowrap leading-none text-[color:var(--w-fg)]" style={{ fontSize: px, ...(color ? { color } : null) }}>
        {whole}
        {frac && <span style={{ fontSize: "0.55em" }}>{frac}</span>}
        {unit && <span data-part="unit" className="uppercase" style={{ fontSize: "max(11px, 0.32em)", marginLeft: "0.25em" }}>{unit}</span>}
      </Num>
      {rule && (
        <span aria-hidden className="flex w-full items-center gap-0.75" style={{ color: ruleColor ?? color ?? "var(--w-accent)", maxWidth: Math.max(40, px * 2.6) }}>
          <span className="h-0.5 shrink-0 bg-current" style={{ width: Math.max(12, px * 0.55) }} />
          <span className="h-0.5 flex-1" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1.2px)", backgroundSize: "5px 2px", opacity: 0.8 }} />
        </span>
      )}
    </div>
  );
}

/** The low, mean and high of `values`, each a small readout under its label (the session's own readings: nothing is made up). */
export function LowMeanHigh({ values, decimals, unit, px, colors }: { values: readonly number[]; decimals: number; unit?: string; px: number; colors?: { low?: string; mean?: string; high?: string } }) {
  const seen = values.filter(Number.isFinite);
  const [low, high] = seen.length ? [Math.min(...seen), Math.max(...seen)] : [Number.NaN, Number.NaN];
  const mean = seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : Number.NaN;
  const cells: [string, number, string | undefined][] = [["Low", low, colors?.low], ["Mean", mean, colors?.mean], ["High", high, colors?.high]];
  return (
    <div className="grid min-w-0 grid-cols-3 gap-3">
      {cells.map(([name, v, color]) => (
        <div key={name} className="flex min-w-0 flex-col gap-1">
          <SectionLabel>{name}</SectionLabel>
          <Readout value={v} decimals={decimals} unit={unit} px={px} color={color} />
        </div>
      ))}
    </div>
  );
}

/** Where a series sits in a plot `h` high over `min`..`max`. */
const yOf = (v: number, min: number, max: number, h: number) => h - ((v - min) / (max - min || 1)) * h;

/**
 * The kit's signal graph: dashed rules at 0, 50 and 100 % with the top and bottom values in the plot, each series a line over a faint
 * area in its colour, and a square marker on the last reading of the first. Drawn in a 100-wide box that stretches to the element.
 */
export function SignalGraph({ series, min = 0, max, labels, className = "", style }: { series: { values: readonly number[]; color: string; area?: boolean }[]; min?: number; max?: number; labels?: [string, string]; className?: string; style?: CSSProperties }) {
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const top = max ?? Math.max(min + 1, ...all);
  const H = 40;
  const path = (values: readonly number[]) => values.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, values.length - 1)) * 100).toFixed(2)} ${yOf(v, min, top, H).toFixed(2)}`).join(" ");
  const lead = series[0]?.values;
  const last = lead && lead.length > 1 ? lead[lead.length - 1] : undefined;
  return (
    <div data-part="spark" className={`relative min-h-0 ${className}`} style={style}>
      <svg aria-hidden viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1="0" x2="100" y1={H * f} y2={H * f} stroke="var(--w-faint)" strokeOpacity={0.45} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" strokeWidth={1} />
        ))}
        {series.map((s, i) =>
          s.values.length > 1 ? (
            <g key={i}>
              {s.area !== false && <path d={`${path(s.values)} L100 ${H} L0 ${H} Z`} fill={s.color} fillOpacity={0.12} />}
              <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </g>
          ) : null,
        )}
      </svg>
      {last !== undefined && (
        <span aria-hidden className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-[color:var(--w-fg)]" style={{ left: "100%", top: `${(yOf(last, min, top, H) / H) * 100}%` }} />
      )}
      {labels && (
        <>
          <span className="absolute left-1 top-0.5 text-micro leading-none text-[color:var(--w-muted)]">{labels[0]}</span>
          <span className="absolute bottom-0.5 left-1 text-micro leading-none text-[color:var(--w-muted)]">{labels[1]}</span>
        </>
      )}
    </div>
  );
}
