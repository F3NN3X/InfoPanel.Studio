import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./button";

/** `value` clamped into [min, max] and snapped to the step grid (NaN -> min). */
export function snapToRange(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const snapped = min + Math.round((value - min) / step) * step;
  // Trim float noise from fractional steps (0.1 + 0.2 ...).
  return Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
}

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max" | "step" | "aria-label"> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name. */
  label: string;
  /** What a screen reader says for the value when the number alone is not it ("40 px", "Off"). */
  valueText?: string;
}

/**
 * The bare range slider: an off-white fill, a focus ring, dimmed and still when disabled. Arrows, Home, End and the
 * page keys come from the native range input, which also keeps its pointer events for callers that commit on release.
 * Its width comes from `className` (`flex-1` to fill a flex row).
 */
export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, valueText, className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
      className={cn("m-0 block h-4 min-w-0 cursor-pointer rounded-ui-sm accent-ui-strong-text disabled:cursor-default disabled:opacity-40", FOCUS_RING, className)}
      {...props}
    />
  );
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

/** A range slider with an editable mono value box. */
export function SliderField({ value, onChange, min = 0, max = 100, step = 1, label, className }: SliderFieldProps) {
  const commit = (v: number) => onChange(snapToRange(v, min, max, step));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Slider label={label} min={min} max={max} step={step} value={value} onChange={commit} className="flex-1" />
      <input
        type="number"
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => e.currentTarget.value !== "" && commit(e.currentTarget.valueAsNumber)}
        className="h-6.5 w-13 rounded-md border border-ui-control bg-ui-app px-1.5 text-right font-ui-mono text-label text-ui-1 focus:border-ui-accent focus:outline-none"
      />
    </div>
  );
}
