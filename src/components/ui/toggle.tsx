import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (the visible label usually sits next to the toggle). */
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Studio switch: a 30×18 track with a 14 px knob (accent when on). */
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
        "relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60 disabled:opacity-40",
        checked ? "bg-ui-accent" : "bg-ui-control",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150",
          checked && "translate-x-3"
        )}
      />
    </button>
  );
}
