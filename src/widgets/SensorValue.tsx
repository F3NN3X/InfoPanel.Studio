import type { ModuleSettings } from "@/modules/types";
import { isImageUrl } from "@/lib/image";
import { widgetImage } from "./data-adapter";
import { Widget, shell, get, num, fmt, has, Metric, Ring, Spark, Bar, Num, useHistory, tone, type ShellProps, type WidgetMeta } from "./kit";

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
  display?: "value" | "gauge" | "bar" | "spark";
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

/** A number with an optional unit ("62.5 %", "1,234 MB/s"); IPs, times, versions and resolutions stay text. */
export const isNumericText = (raw: string): boolean => /^-?\d[\d,]*(?:\.\d+)?(?:\s*[^\s\d.,:x/-][^\s\d]*)?$/.test(raw.trim());

export default function SensorValue(p: SensorValueProps) {
  const d = p.data;
  const raw = get(d, p.sensor ?? "");
  const v = num(raw);
  const unit = p.unit ?? String(raw).replace(/^[-\d.,\s]+/, "").trim();
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
        numeric
          ? { label, value: v, d: p.decimals ?? (Math.abs(v) < 10 ? 1 : 0), unit, sub: p.source, t, hist: disp === "spark" ? hist : undefined, pct: disp === "bar" || disp === "gauge" ? ((v - min) / (max - min)) * 100 : undefined, kind: ({ gauge: "ring", bar: "bar", spark: "spark" } as const)[disp as "gauge" | "bar" | "spark"] ?? "value" }
          : undefined
      }
    >
      {({ size }) =>
        !numeric ? (
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
            <Ring value={v - min} max={max - min} t={t} thickness={size === "xs" ? 10 : 8} className="h-full">
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
