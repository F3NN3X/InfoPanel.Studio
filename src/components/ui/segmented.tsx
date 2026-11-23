import type { ReactNode } from "react";
import { onRovingKeyDown } from "@/lib/roving";
import { cn } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label?: string;
  /** `bar` is the top bar's Design | Sources variant (bigger, on the raised surface). */
  size?: "field" | "bar";
  className?: string;
}

/** One selected-state treatment for every segmented row: the active segment is raised, the rest are plain text. */
export const SEGMENT_ON = "bg-ui-active text-ui-1";
export const SEGMENT_OFF = "text-ui-3 hover:text-ui-1";

/** Segmented control (Solid | Pattern style): a radiogroup on the chrome tokens, with a roving tab stop and arrow keys. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "field",
  className,
}: SegmentedProps<T>) {
  const bar = size === "bar";
  const tabStop = options.some((o) => o.value === value) ? value : options[0]?.value;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => onRovingKeyDown(e, '[role="radio"]')}
      className={cn(
        "flex flex-wrap border border-ui-strong p-0.5",
        bar ? "gap-0.5 rounded-ui-md bg-ui-raised" : "rounded-ui-md bg-ui-chrome",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === tabStop ? 0 : -1}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "transition-colors duration-(--ui-dur-fast) ease-ui focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent",
            bar ? "rounded-ui-sm px-3.5 py-1.25 text-body" : "rounded-ui-sm px-2.25 py-1 text-caption",
            o.value === value ? SEGMENT_ON + " forced-colors:forced-color-adjust-none forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText]" : SEGMENT_OFF
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
