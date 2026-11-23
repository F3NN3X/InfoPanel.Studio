import { useId, type ReactNode } from "react";
import { ChartSummary, chartSummary } from "./chart-summary";
import { cn } from "@/lib/utils";

/** The polyline's points for `samples` in a `width` × `height` box: oldest at the left, the range filling the height. */
export function sparkPoints(samples: readonly number[], width: number, height: number): string {
  if (samples.length < 2) return "";
  const low = Math.min(...samples);
  const span = Math.max(...samples) - low;
  const step = width / (samples.length - 1);
  return samples.map((v, i) => `${(i * step).toFixed(1)},${(span === 0 ? height / 2 : height - ((v - low) / span) * height).toFixed(1)}`).join(" ");
}

/** A chart's text for screen readers: "Package Temp, last 60 s, 58.8 to 67.7 °C". */
export function sparkSummary(name: string, samples: readonly number[], unit = ""): string {
  if (samples.length === 0) return `${name}, last 60 s, no readings yet`;
  const range = `${Math.min(...samples).toFixed(1)} to ${Math.max(...samples).toFixed(1)}`;
  return `${name}, last 60 s, ${range}${unit && ` ${unit}`}`;
}

interface SparklineProps {
  samples: readonly number[];
  /** The chart's text alternative. */
  label: string;
  /** The id of a `ChartSummary` with the range, latest and trend. */
  describedBy?: string;
  /** The row is selected: the line takes the accent. */
  selected?: boolean;
  className?: string;
}

/** A 72 × 20 line chart of the last 60 s; grey, accent only on the selected row. */
export function Sparkline({ samples, label, describedBy, selected, className }: SparklineProps) {
  return (
    <svg role="img" aria-label={label} aria-describedby={describedBy} viewBox="0 0 72 20" preserveAspectRatio="none" className={cn("h-5 w-18 shrink-0 overflow-visible", className)}>
      <polyline points={sparkPoints(samples, 72, 20)} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" className={selected ? "stroke-ui-accent" : "stroke-ui-source"} />
    </svg>
  );
}

interface SensorRowProps {
  /** The tile's 16 px icon. */
  icon: ReactNode;
  name: string;
  /** The sensor key, in mono. */
  sensorKey: string;
  samples: readonly number[];
  value: string;
  unit?: string;
  selected?: boolean;
  className?: string;
}

/** One sensor: icon tile, name over key, the 60 s sparkline, and the value in mono with its unit muted. */
export function SensorRow({ icon, name, sensorKey, samples, value, unit, selected, className }: SensorRowProps) {
  const summaryId = useId();
  return (
    <div className={cn("flex min-h-12 items-center gap-3", className)}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui-md bg-ui-raised text-ui-hint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-ui-1">{name}</span>
        <span className="block truncate font-ui-mono text-micro text-ui-hint">{sensorKey}</span>
      </span>
      <Sparkline samples={samples} label={`${name}, last 60 s`} describedBy={summaryId} selected={selected} />
      <ChartSummary id={summaryId} text={chartSummary({ name, span: "last 60 s", samples, unit })} />
      <span className="w-18 shrink-0 text-right font-ui-mono text-body tabular-nums text-ui-1">
        {value}
        {unit && <span className="text-ui-hint"> {unit}</span>}
      </span>
    </div>
  );
}
