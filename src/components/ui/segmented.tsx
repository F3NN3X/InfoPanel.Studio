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
        "flex flex-wrap border border-ui-control p-0.5",
        bar ? "gap-0.5 rounded-lg bg-ui-raised" : "rounded-[7px] bg-ui-app",
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
            "font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent",
            bar ? "rounded-md px-3.5 py-[5px] text-[12.5px]" : "rounded-[5px] px-[9px] py-1 text-[11.5px]",
            o.value === value ? "bg-ui-active text-ui-1" : "text-ui-4 hover:text-ui-1"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
