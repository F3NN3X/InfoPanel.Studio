// Sensor's `readout` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's rooftop sensor. Under the standard header, the
// reading as a large readout with its decimals and unit set small over a solid-and-dotted rule, then, where there is room, a signal
// graph of the session's readings and their low, mean and high. Only the value and spark displays take it; the reading's own
// thresholds tint the readout as they tint the standard one.
import { Widget, shell, fmt, useHistory, TONES, HISTORY_LEN, type Tone } from "./kit";
import { LowMeanHigh, Reading, SignalGraph } from "./shared/layout-parts";
import type { SensorValueProps } from "./SensorValue";

/** The graph needs this much height and the trio this much more, px. */
const GRAPH_MIN_H = 130;
const TRIO_MIN = { w: 200, h: 210 };

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface SensorReadoutProps extends SensorValueProps {
  label: string;
  /** The reading as shown (a unit up past a thousand) and its unit. */
  value: number;
  unit: string;
  decimals: number;
  /** The reading's own value, for the history (the shown one rescales with the unit). */
  raw: number;
  /** How the shown value relates to the raw (1, or 1/1024 a unit up). */
  scale: number;
  tone: Tone;
}

export function SensorReadout(p: SensorReadoutProps) {
  // the readings as they came (no easing), so the low, mean and high are real ones
  const hist = useHistory(p.raw, HISTORY_LEN, 1).map((v) => v * p.scale);
  const color = p.tone !== "ok" ? TONES[p.tone] : undefined;
  const text = fmt(p.value, p.decimals);
  return (
    <Widget {...shell(p)} title={p.label} icon="sensors" compact={{ label: p.label, value: p.value, d: p.decimals, unit: p.unit, t: p.tone, hist: p.display === "spark" ? hist : undefined, kind: p.display === "spark" ? ("spark" as const) : ("value" as const) }}>
      {({ w, h }) => {
        const graph = h >= GRAPH_MIN_H && hist.length > 1;
        const trio = graph && w >= TRIO_MIN.w && h >= TRIO_MIN.h;
        // the readout fills the width its digits need, up to a third of the box (a quarter with the graph and the trio under it)
        const px = clamp(18, Math.min(w / (text.length * 0.62 + (p.unit ? 1.2 : 0)), h * (trio ? 0.22 : graph ? 0.3 : 0.5)), 96);
        const small = clamp(14, px * 0.34, 28);
        const [lo, hi] = [Math.min(...hist), Math.max(...hist)];
        return (
          <div data-layout="readout" className="flex h-full min-w-0 flex-col gap-2">
            <Reading value={p.value} decimals={p.decimals} unit={p.unit} px={px} color={color} />
            {/* a steady reading draws through the middle, between the range's own labels */}
            {graph && <SignalGraph series={[{ values: hist, color: color ?? "var(--w-accent)" }]} min={hi > lo ? lo : lo - 1} max={hi > lo ? hi : hi + 1} labels={[fmt(hi, p.decimals), fmt(lo, p.decimals)]} className="mt-1 min-h-10 flex-1" />}
            {trio && <LowMeanHigh values={hist} decimals={p.decimals} unit={p.unit} px={small} colors={{ high: TONES.warn }} />}
          </div>
        );
      }}
    </Widget>
  );
}
