/**
 * The New wizards' Size field: the panel presets in a row per shape class (Standard, Wide, Strip, Tall), a ★ on the
 * chosen template's own size and the physical panel as each one's tooltip; then Custom, a width and a height that
 * always show the size, where typing is choosing one. The header says whether the size follows the selection or was
 * set here, with a way back to the selection's own. The grouping is display-only: `SIZE_PRESETS` keeps its order.
 */
import { Star } from "lucide-react";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import { cn } from "@/lib/utils";
import { CLASS_NAMES, CLASS_ORDER } from "./shape-chips";
import { SIZE_PRESETS, hintOf, type Size } from "./size-presets";
import type { SizeChoice } from "./use-size-choice";

/** The largest size the editors take, either way. */
export const MAX_SIDE = 8192;

/** A typed side, or null when it is not a whole number from 1 to 8192. */
export function sideOf(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_SIDE ? n : null;
}

export const INPUT = "h-[30px] w-full min-w-0 rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent";

const same = (a: Size, b: Size | undefined) => !!b && a.width === b.width && a.height === b.height;

interface SizePickerProps {
  sized: SizeChoice;
  /** The selection's own size (★), and its name for the status ("Follows General"); no name for Blank. */
  own?: Size;
  owner?: string;
  /** "Use W × H": back to the selection's own size. */
  onUseOwn: () => void;
}

export function SizePicker({ sized, own, owner, onUseOwn }: SizePickerProps) {
  const { shown, invalid, touched } = sized;
  const preset = !invalid && SIZE_PRESETS.some((p) => same(p, shown));
  const status = touched ? "Set by you" : owner ? `Follows ${owner}` : "Default";
  const back = touched && own && !same(own, shown) ? own : undefined;
  const ratio = shown.width / shown.height;
  return (
    <div role="group" aria-label="Size" className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-caption text-ui-2">Size</span>
        <span className="flex-1" />
        <span className="whitespace-nowrap text-micro text-ui-4">{status}</span>
        {back && (
          <button type="button" onClick={onUseOwn} className="whitespace-nowrap text-micro text-ui-accent-text hover:underline">
            Use {back.width} × {back.height}
          </button>
        )}
      </div>
      {CLASS_ORDER.map((cls) => (
        <div key={cls} className="flex items-start gap-1">
          <span className="w-14 shrink-0 pt-[5px] text-micro text-ui-4">{CLASS_NAMES[cls]}</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {SIZE_PRESETS.filter((p) => shapeClassOf(p.width, p.height) === cls).map((p) => {
              const on = !invalid && same(p, shown);
              const mine = same(p, own);
              const hint = hintOf(p);
              return (
                <button
                  key={`${p.width}x${p.height}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.width} × ${p.height}`}
                  title={[hint, mine ? "this template’s own size" : undefined].filter(Boolean).join(" · ") || undefined}
                  onClick={() => sized.pick(p)}
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-ui-sm border px-[7px] font-ui-mono text-micro tabular-nums",
                    on ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default bg-ui-raised text-ui-2 hover:bg-ui-hover",
                  )}
                >
                  {p.width}×{p.height}
                  {mine && <Star aria-hidden className="h-3 w-3 text-ui-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="w-14 shrink-0 text-micro text-ui-4">Custom</span>
        <div
          className={cn(
            "flex h-[26px] items-center rounded-ui-sm border",
            invalid ? "border-ui-danger" : !preset ? "border-ui-accent bg-ui-accent/10" : "border-ui-default bg-ui-raised focus-within:border-ui-accent",
          )}
        >
          <input
            inputMode="numeric"
            aria-label="Width"
            aria-invalid={invalid && sideOf(sized.w) === null}
            value={sized.w}
            onChange={(e) => sized.onW(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-full w-[46px] bg-transparent text-center font-ui-mono text-micro text-ui-1 outline-none focus-visible:shadow-none"
          />
          <span aria-hidden className="text-[10px] text-ui-4">×</span>
          <input
            inputMode="numeric"
            aria-label="Height"
            aria-invalid={invalid && sideOf(sized.h) === null}
            value={sized.h}
            onChange={(e) => sized.onH(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-full w-[46px] bg-transparent text-center font-ui-mono text-micro text-ui-1 outline-none focus-visible:shadow-none"
          />
        </div>
        <span className={cn("ml-1.5 text-micro", invalid ? "text-ui-danger" : "text-ui-4")}>
          {invalid ? `Whole numbers, 1 to ${MAX_SIDE}` : preset ? "Type any size" : `${CLASS_NAMES[shapeClassOf(shown.width, shown.height)]} · ${ratio.toFixed(2)}:1`}
        </span>
      </div>
    </div>
  );
}
