import type { ReactNode } from "react";
import { onRovingKeyDown } from "@/lib/roving";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./button";

interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Dimmed and out of the arrow-key order (a tab with nothing in it). */
  disabled?: boolean;
  /** Tooltip, e.g. why the tab is off. */
  title?: string;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tablist. */
  label?: string;
  /** `underline` (default): an accent line under the selected tab. `pill`: the selected tab is a raised chip in a rounded track. */
  variant?: "underline" | "pill";
  /** On the tablist (spacing, a border). */
  className?: string;
  /** On every tab (a height, equal widths). */
  tabClassName?: string;
}

const LIST = {
  underline: "flex gap-4 border-b border-ui-subtle",
  pill: "flex gap-0.5 rounded-ui-md bg-ui-app p-0.5",
} as const;

const TAB = {
  underline: "-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-t-ui-sm border-b-2 text-body",
  pill: "inline-flex min-w-0 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-ui-sm px-2 text-caption font-medium",
} as const;

const SELECTED = {
  underline: "border-ui-accent font-medium text-ui-1",
  pill: "bg-ui-active text-ui-1",
} as const;

const IDLE = {
  underline: "border-transparent text-ui-3 enabled:hover:text-ui-1",
  pill: "text-ui-3 enabled:hover:text-ui-1",
} as const;

/** Tabs switch what you're looking at (Segmented picks a value): one tab stop, arrows move and select. */
export function Tabs<T extends string>({ tabs, value, onChange, label, variant = "underline", className, tabClassName }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} onKeyDown={(e) => onRovingKeyDown(e, '[role="tab"]')} className={cn(LIST[variant], className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          disabled={t.disabled}
          title={t.title}
          onClick={() => onChange(t.value)}
          className={cn(
            TAB[variant],
            "transition-colors duration-(--ui-dur-fast) ease-ui disabled:cursor-not-allowed disabled:opacity-40",
            FOCUS_RING,
            t.value === value ? SELECTED[variant] : IDLE[variant],
            tabClassName,
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
