import { cn } from "@/lib/utils";

/** `value` clamped into [min, max] and snapped to the step grid (NaN -> min). */
export function snapToRange(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const snapped = min + Math.round((value - min) / step) * step;
  // Trim float noise from fractional steps (0.1 + 0.2 ...).
  return Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
}

interface SliderFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name of both the slider and the value box. */
  label: string;
  className?: string;
}

/** An accent range slider with an editable mono value box. */
export function SliderField({ value, onChange, min = 0, max = 100, step = 1, label, className }: SliderFieldProps) {
  const commit = (v: number) => onChange(snapToRange(v, min, max, step));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => commit(e.currentTarget.valueAsNumber)}
        className="h-4 min-w-0 flex-1 cursor-pointer accent-[var(--ui-accent)]"
      />
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => e.currentTarget.value !== "" && commit(e.currentTarget.valueAsNumber)}
        className="h-[26px] w-[52px] rounded-md border border-ui-control bg-ui-app px-1.5 text-right font-ui-mono text-[11.5px] text-ui-1 focus:border-ui-accent focus:outline-none"
      />
    </div>
  );
}
