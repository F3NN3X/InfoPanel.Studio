/**
 * The template dialogs' size row (New InfoPanel profile, New screen): the panel size presets as radios, and Custom
 * with a width and a height typed as whole pixels.
 */
import { cn } from "@/lib/utils";
import { SIZE_PRESETS, type Size } from "./size-presets";

/** The largest size the editors take, either way. */
export const MAX_SIDE = 8192;

/** A preset's index, or a custom size. */
export type SizeChoice = number | "custom";

/** A typed side, or null when it is not a whole number from 1 to 8192. */
export function sideOf(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_SIDE ? n : null;
}

/** The size chosen: a preset's, or the typed one (a side that isn't a valid number is null). */
export const sizeOfChoice = (choice: SizeChoice, w: string, h: string): { width: number | null; height: number | null } =>
  choice === "custom" ? { width: sideOf(w), height: sideOf(h) } : SIZE_PRESETS[choice];

/** The preset that is this size, else Custom (with the size typed in). */
export const choiceOfSize = (size: Size): SizeChoice => {
  const i = SIZE_PRESETS.findIndex((p) => p.width === size.width && p.height === size.height);
  return i < 0 ? "custom" : i;
};

export const INPUT = "h-8 w-full min-w-0 rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent";

interface SizePickerProps {
  choice: SizeChoice;
  onChoice: (c: SizeChoice) => void;
  w: string;
  h: string;
  onW: (w: string) => void;
  onH: (h: string) => void;
}

export function SizePicker({ choice, onChoice, w, h, onW, onH }: SizePickerProps) {
  const size = sizeOfChoice(choice, w, h);
  return (
    <div role="radiogroup" aria-label="Size">
      <span className="mb-1 block text-[12px] text-ui-3">Size</span>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {SIZE_PRESETS.map((s, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={choice === i}
            onClick={() => onChoice(i)}
            className={cn("h-8 rounded-[7px] border text-[12px] tabular-nums", choice === i ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover")}
          >
            {s.width} × {s.height}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={choice === "custom"}
          onClick={() => onChoice("custom")}
          className={cn("col-span-3 h-8 rounded-[7px] border text-[12px] sm:col-span-6", choice === "custom" ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover")}
        >
          Custom
        </button>
      </div>
      {choice === "custom" && (
        <div className="mt-2 flex items-center gap-2">
          <input inputMode="numeric" aria-label="Width" value={w} onChange={(e) => onW(e.target.value)} className={cn(INPUT, sideOf(w) === null && "border-ui-danger")} />
          <span className="text-ui-4">×</span>
          <input inputMode="numeric" aria-label="Height" value={h} onChange={(e) => onH(e.target.value)} className={cn(INPUT, sideOf(h) === null && "border-ui-danger")} />
        </div>
      )}
      {choice === "custom" && (size.width === null || size.height === null) && (
        <p className="mt-1.5 text-[11.5px] text-ui-danger">Width and height are whole numbers from 1 to {MAX_SIDE}.</p>
      )}
    </div>
  );
}
