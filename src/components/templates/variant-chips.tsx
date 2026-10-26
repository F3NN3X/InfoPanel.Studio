/** The "Colours" row under a gallery: one chip per palette of the chosen template, with its three swatches. */
import { cn } from "@/lib/utils";

export interface VariantChip {
  id: string;
  name: string;
  swatch: readonly string[];
}

interface VariantChipsProps {
  variants: readonly VariantChip[];
  value: string;
  onChange: (id: string) => void;
}

export function VariantChips({ variants, value, onChange }: VariantChipsProps) {
  return (
    <div role="radiogroup" aria-label="Colours" className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] text-ui-3">Colours</span>
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={value === v.id}
          onClick={() => onChange(v.id)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[7px] border px-2 text-[12px]",
            value === v.id ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover",
          )}
        >
          {v.swatch.map((c, i) => (
            <span key={i} className="h-3 w-3 rounded-full border border-black/30" style={{ background: c }} />
          ))}
          {v.name}
        </button>
      ))}
    </div>
  );
}
