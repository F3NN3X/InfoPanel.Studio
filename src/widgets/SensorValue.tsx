import { useContext, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { ModuleSettings } from "@/modules/types";
import { isImageUrl } from "@/lib/image";
import { widgetImage } from "./data-adapter";
import { IpTagCtx, Widget, shell, get, num, fmt, has, Metric, Ring, Spark, Bar, Num, useHistory, tone, TONES, type ShellProps, type WidgetMeta } from "./kit";

export const meta: WidgetMeta = {
  id: "SensorValue",
  name: "Sensor",
  category: "Generic",
  icon: "sensors",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  blurb: "Any single value as number, gauge or bar",
  tags: "bind value custom",
  description: "Bind any single data point. Shows it as a value, gauge, bar or sparkline with thresholds.",
};

export interface SensorValueProps extends ShellProps {
  look?: ModuleSettings;
  /** The data key to bind. */
  sensor?: string;
  label?: string;
  display?: "value" | "gauge" | "bar" | "spark" | "line" | "figure";
  /** A figure: the unit at a small size beside the number. */
  smallUnit?: boolean;
  /** A line: the value follows the label (default: it sits at the end). */
  lineValue?: "meter" | "end" | "next" | "only";
  min?: number;
  max?: number;
  warn?: number;
  crit?: number;
  decimals?: number;
  /** Overrides the unit read from the value. */
  unit?: string;
  /** Where the value comes from (a plugin name): a quiet line under the value. */
  source?: string;
}

interface LineProps {
  label: string;
  value?: number;
  text?: string;
  unit?: string;
  ranged: boolean;
  min: number;
  max: number;
  tone: ReturnType<typeof tone>;
  /** Where the value goes: at the end with a meter between when the reading has a range, at the end, after the label, or alone and quiet. */
  place?: "meter" | "end" | "next" | "only";
  w: number;
  h: number;
}

/** A reading in the next unit up once it passes a thousand (13,493 KB/s as 13.2 MB/s, 5,414 MB as 5.3 GB). */
const NEXT_UNIT: Record<string, string> = { "KB/s": "MB/s", MB: "GB" };
export function readingText(value: number | undefined, unit: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const up = unit !== undefined && unit in NEXT_UNIT && Math.abs(value) >= 1000;
  const shown = up ? value / 1024 : value;
  return `${shown.toFixed(Math.abs(shown) < 10 || up ? 1 : 0)}${up ? NEXT_UNIT[unit!] : (unit ?? "")}`;
}

/**
 * One console line: the label, a meter when the reading has a range (a % or a °C one, or a set maximum), then the value
 * and its unit, the text sized from the line's height. Without a sensor the label alone, as a caption line; without a
 * label the value alone, quiet.
 */
function Line({ label, value, text, unit, ranged, min, max, tone: t, place = "meter", w, h }: LineProps) {
  const px = Math.max(8, Math.min(h * 0.36, w / (value === undefined && text === undefined ? 18 : place === "meter" ? 27 : 14)));
  const metered = value !== undefined && ranged && place === "meter";
  const shown = text ?? readingText(value, unit);
  return (
    <div className="flex h-full min-w-0 items-center gap-[1.1em] whitespace-nowrap leading-none" style={{ fontSize: px, paddingInline: "0.9em" }}>
      {place !== "only" && <span className="shrink-0 truncate text-[color:var(--accent)]" style={{ minWidth: metered ? "4.2em" : undefined, textTransform: "var(--wp-label-case, none)" as CSSProperties["textTransform"] }}>{label}</span>}
      {metered && <Bar value={value - min} max={max - min} t={t} className="h-[0.8em] min-w-0 flex-1" style="segments" segments={Math.max(8, Math.round(w / px / 1.1))} />}
      {shown !== undefined && (
        <Num
          className={cn("shrink-0", metered ? "text-right" : place !== "next" && "ml-auto", place === "only" && "text-[color:var(--w-muted)]")}
          style={{ ...(metered ? { minWidth: "4.6em" } : null), ...(t !== "ok" ? { color: TONES[t] } : null) }}
        >
          {shown}
        </Num>
      )}
    </div>
  );
}

/** A figure: the label small and quiet on top, the reading below as large as the box allows, light, its unit as big as it. */
function Figure({ label, text, unit, w, h }: { label: string; text: string; unit?: string; w: number; h: number }) {
  const small = Math.max(9, Math.min(h * 0.1, w / 14));
  // With a small unit the number is what the box holds; the unit beside it takes 0.4 of its size.
  const chars = unit ? text.length + unit.length * 0.4 : text.length;
  const px = Math.max(14, Math.min((h - small * 2) * 0.62, w / (chars * 0.55)));
  return (
    <div className="flex h-full min-w-0 flex-col leading-none" style={{ paddingInline: "0.25em" }}>
      <span className="truncate text-[color:var(--w-muted)]" style={{ fontSize: small }}>{label}</span>
      <div className="flex min-h-0 flex-1 items-center">
        <Num className="whitespace-nowrap" style={{ fontSize: px, fontWeight: 300, letterSpacing: "-0.02em" }}>
          {text}
          {unit && <span style={{ fontSize: "0.4em", marginLeft: "0.2em" }}>{unit}</span>}
        </Num>
      </div>
    </div>
  );
}

/** A number with an optional unit ("62.5 %", "1,234 MB/s"); IPs, times, versions and resolutions stay text. */
export const isNumericText = (raw: string): boolean => /^-?\d[\d,]*(?:\.\d+)?(?:\s*[^\s\d.,:x/-][^\s\d]*)?$/.test(raw.trim());

export default function SensorValue(p: SensorValueProps) {
  const d = p.data;
  // The studio canvas hints at the missing binding; the kiosk stays quiet.
  const onCanvas = useContext(IpTagCtx);
  const raw = get(d, p.sensor ?? "");
  const v = num(raw);
  const unit = p.unit ?? String(raw).replace(/^[-\d.,\s]+/, "").trim().replace(/Â(?=[°²³µ])/g, "");
  const numeric = Number.isFinite(v) && isNumericText(String(raw));
  const hist = useHistory(v);
  const min = p.min ?? 0,
    max = p.max ?? (unit === "%" ? 100 : unit.includes("°") ? 100 : Math.max(1, ...hist) * 1.1);
  const t = tone(v, p.warn, p.crit);
  const label = p.label ?? p.title ?? String(p.sensor ?? "").split(".").pop()!.replace(/[_-]+/g, " ");
  const disp = p.display ?? "value";
  const source = p.source ? (
    <span className="mt-1 shrink-0 truncate text-center text-[11px] text-[color:var(--w-faint)]" title={p.source}>
      {p.source}
    </span>
  ) : null;
  return (
    <Widget
      {...shell(p)}
      title={label}
      icon="sensors"
      compact={
        numeric && disp !== "line" && disp !== "figure"
          ? { label, value: v, d: p.decimals ?? (Math.abs(v) < 10 ? 1 : 0), unit, sub: p.source, t, hist: disp === "spark" ? hist : undefined, pct: disp === "bar" || disp === "gauge" ? ((v - min) / (max - min)) * 100 : undefined, kind: ({ gauge: "ring", bar: "bar", spark: "spark" } as const)[disp as "gauge" | "bar" | "spark"] ?? "value" }
          : undefined
      }
    >
      {({ size, w, h }) =>
        disp === "line" ? (
          <Line label={label} value={p.sensor && numeric ? v : undefined} text={p.sensor && !numeric ? (has(raw) ? String(raw) : "–") : undefined} unit={unit} ranged={max !== undefined && (p.max !== undefined || unit === "%" || unit.includes("°"))} min={min} max={max} tone={t} place={p.lineValue} w={w} h={h} />
        ) : disp === "figure" ? (
          <Figure label={label} text={numeric ? (p.smallUnit ? fmt(v, p.decimals ?? (Math.abs(v) < 10 ? 1 : 0)) : (readingText(v, unit) ?? "")) : has(raw) ? String(raw) : "–"} unit={numeric && p.smallUnit ? unit : undefined} w={w} h={h} />
        ) : !p.sensor ? (
          onCanvas ? <div className="flex h-full items-center text-xs text-[color:var(--w-faint)]">Pick a sensor</div> : null
        ) : !numeric ? (
          <div className="flex h-full flex-col justify-center">
            {size === "xs" && p.look?.showTitle !== false && <span className="text-[11px] text-[color:var(--w-muted)]">{label}</span>}
            {has(raw) && isImageUrl(raw, p.sensor) ? (
              <img src={widgetImage(raw)} alt="" loading="lazy" className="max-h-full min-h-0 w-auto self-center rounded-md object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : (
              <span className="min-h-0 overflow-y-auto whitespace-pre-line break-words text-base font-medium">{has(raw) ? raw : "—"}</span>
            )}
            {source}
          </div>
        ) : disp === "gauge" ? (
          <div className="flex h-full items-center justify-center">
            <Ring value={v - min} max={max - min} t={t} thickness={size === "xs" ? 10 : 8} className="h-full max-w-full">
              <Num className={`${size === "xs" ? "text-base" : size === "sm" ? "text-2xl" : "text-4xl"} font-semibold`}>{fmt(v, p.decimals ?? 0)}</Num>
              <span className="text-[10.5px] text-[color:var(--w-muted)]">{unit}</span>
            </Ring>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center gap-2">
            <Metric label={size === "xs" ? label : null} value={v} d={p.decimals ?? (Math.abs(v) < 10 ? 1 : 0)} unit={unit} t={t} scale={{ xs: "lg", sm: "xl", md: "2xl", lg: "2xl" }[size] as "lg" | "xl" | "2xl"} />
            {disp === "bar" && <Bar value={v - min} max={max - min} t={t} className="h-2" />}
            {disp === "spark" && <Spark values={hist} className="min-h-0 flex-1" />}
            {source}
          </div>
        )
      }
    </Widget>
  );
}
