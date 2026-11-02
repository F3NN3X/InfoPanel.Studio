import type { ReactNode } from "react";
import { onRovingKeyDown } from "@/lib/roving";
import { cn } from "@/lib/utils";

export interface IconGridItem {
  /** Stored value ("" = none). */
  id: string;
  label: string;
  icon: ReactNode;
}

interface IconGridProps {
  icons: IconGridItem[];
  value: string;
  onChange: (id: string) => void;
  columns?: number;
  /** Accessible name of the grid. */
  label?: string;
  className?: string;
}

/** A grid of icon cells (30 px high); the selected one has an accent border and tint. */
export function IconGrid({ icons, value, onChange, columns = 5, label, className }: IconGridProps) {
  const tabStop = icons.some((i) => i.id === value) ? value : icons[0]?.id;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => onRovingKeyDown(e, '[role="radio"]')}
      className={cn("grid gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {icons.map((i) => {
        const selected = i.id === value;
        return (
          <button
            key={i.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i.id === tabStop ? 0 : -1}
            aria-label={i.label}
            title={i.label}
            onClick={() => onChange(i.id)}
            className={cn(
              "flex h-[30px] items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-accent text-ui-3 transition-colors [&>svg]:h-4 [&>svg]:w-4",
              selected
                ? "border-ui-accent bg-ui-accent-soft text-ui-accent-text"
                : "border-ui-default bg-ui-app hover:bg-ui-hover hover:text-ui-1"
            )}
          >
            {i.icon}
          </button>
        );
      })}
    </div>
  );
}
