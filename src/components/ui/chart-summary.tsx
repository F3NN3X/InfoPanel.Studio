interface ChartSummaryInput {
  /** What the chart shows ("Package Temp"). */
  name: string;
  /** The window it covers, as spoken ("last 60 s"). */
  span: string;
  samples: readonly number[];
  unit?: string;
}

type Trend = "rising" | "falling" | "steady";

/** The change from the first to the last sample, steady when it is under a tenth of the range. */
function trendOf(samples: readonly number[]): Trend {
  const delta = samples[samples.length - 1] - samples[0];
  const span = Math.max(...samples) - Math.min(...samples);
  if (Math.abs(delta) <= span * 0.1) return "steady";
  return delta > 0 ? "rising" : "falling";
}

/** A chart's text for screen readers: "Package Temp, last 60 s: 58.8 to 67.7 °C, latest 60.0 °C, rising." */
export function chartSummary({ name, span, samples, unit = "" }: ChartSummaryInput): string {
  if (samples.length === 0) return `${name}, ${span}: no readings yet.`;
  const suffix = unit && ` ${unit}`;
  const range = `${Math.min(...samples).toFixed(1)} to ${Math.max(...samples).toFixed(1)}${suffix}`;
  const latest = `${samples[samples.length - 1].toFixed(1)}${suffix}`;
  if (samples.length < 2) return `${name}, ${span}: ${range}, latest ${latest}.`;
  return `${name}, ${span}: ${range}, latest ${latest}, ${trendOf(samples)}.`;
}

interface ChartSummaryProps {
  id: string;
  text: string;
}

/** The summary as screen-reader-only text; the chart points at it with `aria-describedby`. */
export function ChartSummary({ id, text }: ChartSummaryProps) {
  return (
    <span id={id} className="sr-only">
      {text}
    </span>
  );
}
