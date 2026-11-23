import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatWithUnit, parseBoxValue } from "./number-box";

/**
 * The value box of a slider row (README §4.6): mono 11.5, with the unit
 * (`100%`, `12 px`). Typing edits a draft that commits on Enter or blur.
 */
export function ValueBox({
  value,
  min,
  max,
  step,
  unit,
  label,
  onChange,
  compact = false,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label: string;
  onChange: (value: number) => void;
  /** Beside an inline slider: 54 px instead of 64. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    const n = draft === null || cancelled.current ? null : parseBoxValue(draft, min, max, step);
    cancelled.current = false;
    if (n !== null && n !== value) onChange(n);
    setDraft(null);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${label} value`}
      value={draft ?? formatWithUnit(value, unit)}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-6.5 min-w-11 shrink-0 rounded-6 border border-ui-default bg-ui-app px-1.5 py-1 text-right",
        compact ? "w-13.5" : "w-16",
        "font-ui-mono text-micro text-ui-1 outline-none focus:border-ui-accent"
      )}
    />
  );
}
