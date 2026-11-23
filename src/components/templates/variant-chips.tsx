/** The "Variant" field: one chip per variant of the chosen template, with its three colours as overlapping dots. */
import { cn } from "@/lib/utils";

export interface VariantChip {
  id: string;
  name: string;
  /** Three colours the chip shows. */
  swatch: readonly string[];
}

interface VariantChipsProps {
  variants: readonly VariantChip[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function VariantChips({ variants, value, onChange, className = "mt-3" }: VariantChipsProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-caption text-ui-2">Variant</span>
      <div role="radiogroup" aria-label="Variant" className="flex flex-wrap items-center gap-1.5">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={value === v.id}
            onClick={() => onChange(v.id)}
            className={cn(
              "flex h-6.5 items-center gap-1.5 rounded-ui-md border pl-1.5 pr-2.25 text-caption",
              value === v.id ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default bg-ui-raised text-ui-2 hover:bg-ui-hover",
            )}
          >
            <span aria-hidden className="flex">
              {v.swatch.map((c, i) => (
                <span key={i} className={cn("h-2.75 w-2.75 rounded-full border border-black/30", i > 0 && "-ml-0.75")} style={{ background: c }} />
              ))}
            </span>
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
