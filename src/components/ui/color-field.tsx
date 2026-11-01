import { cn } from "@/lib/utils";

interface ColorFieldProps {
  /** A #rrggbb color; "" = Auto (inherit). */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name. */
  label: string;
  autoLabel?: string;
  className?: string;
}

/** "Auto" or the hex value plus a swatch that opens the native color picker. */
export function ColorField({ value, onChange, label, autoLabel = "Auto", className }: ColorFieldProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className={cn("font-ui-mono text-[11.5px]", value ? "text-ui-2" : "text-ui-4")}>
        {value ? value.toUpperCase() : autoLabel}
      </span>
      <label
        className={cn(
          "relative h-[22px] w-[22px] shrink-0 cursor-pointer overflow-hidden rounded-md border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-accent",
          value ? "border-ui-strong" : "border-dashed border-ui-strong"
        )}
        style={value ? { backgroundColor: value } : undefined}
      >
        <input
          type="color"
          aria-label={label}
          value={value || "#000000"}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {value && (
        <button
          type="button"
          aria-label={`Reset ${label} to ${autoLabel}`}
          onClick={() => onChange("")}
          className="text-[11px] text-ui-4 hover:text-ui-1"
        >
          {autoLabel}
        </button>
      )}
    </div>
  );
}
