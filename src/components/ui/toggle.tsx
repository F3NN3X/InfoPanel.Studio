import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./button";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (the visible label usually sits next to the toggle). */
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Studio switch: a 30×18 track with a 14 px knob (off-white when on, not blue: accent is for selection). */
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-4.5 w-7.5 shrink-0 rounded-full transition-colors duration-(--ui-dur-fast) ease-ui after:absolute after:-inset-1 after:content-['']",
        FOCUS_RING,
        "disabled:opacity-40",
        "forced-colors:forced-color-adjust-none forced-colors:border forced-colors:border-[color:ButtonText] forced-colors:bg-[color:Canvas] disabled:forced-colors:border-[color:GrayText]",
        checked ? "bg-ui-strong-text forced-colors:border-[color:Highlight] forced-colors:bg-[color:Highlight]" : "bg-ui-control",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full transition-[transform,background-color] duration-(--ui-dur-fast) ease-ui",
          "forced-colors:bg-[color:ButtonText]",
          checked ? "translate-x-3 bg-ui-inverse-fg forced-colors:bg-[color:HighlightText]" : "bg-ui-soft"
        )}
      />
    </button>
  );
}
