/**
 * The template galleries' shape filter (the New wizards, the InfoPanel home, the first-run setup): chips for All and
 * each shape class, each with a small outline at the class's shape and, when given, how many templates match; the
 * sections they show (one class, or All with the chosen size's class first), and how a class's cards are laid out:
 * long shapes get fewer, wider cards across, tall ones narrow cards, each thumbnail at its canvas's shape.
 */
import { cn } from "@/lib/utils";
import { SHAPE_CLASSES, type ShapeClass } from "@/lib/infopanel/templates/layout";

export type ShapeFilter = ShapeClass | "all";

export const CLASS_NAMES: Record<ShapeClass, string> = { strip: "Strip", wide: "Wide", standard: "Standard", tall: "Tall" };

/** The order the New wizards list the classes in (chips, size rows, sections after the size's own). */
export const CLASS_ORDER: readonly ShapeClass[] = ["standard", "wide", "strip", "tall"];

export const COLUMNS: Record<ShapeClass, string> = {
  strip: "grid-cols-2 sm:grid-cols-3",
  wide: "grid-cols-2 sm:grid-cols-3",
  standard: "grid-cols-3 sm:grid-cols-4",
  tall: "grid-cols-3 sm:grid-cols-5",
};

/** Each class's outline on its chip, in px. */
const GLYPHS: Record<ShapeClass, [number, number]> = { standard: [12, 8], wide: [15, 6], strip: [16, 4], tall: [6, 12] };

/** A thumbnail keeps its canvas's shape, within 3:1 to 3:5. */
export const aspectOf = (width: number, height: number): number => Math.min(3, Math.max(0.6, width / height));

/** The sections a filter shows: the one class, or every class with the size's own first. */
export const sectionClasses = (filter: ShapeFilter, sizeClass: ShapeClass): ShapeClass[] =>
  filter === "all" ? [sizeClass, ...SHAPE_CLASSES.filter((c) => c !== sizeClass)] : [filter];

interface ShapeChipsProps {
  filter: ShapeFilter;
  onFilter: (f: ShapeFilter) => void;
  /** How many templates each chip would show; no counts while they load. */
  counts?: Readonly<Record<ShapeFilter, number>>;
  className?: string;
}

export function ShapeChips({ filter, onFilter, counts, className = "mb-2" }: ShapeChipsProps) {
  return (
    <div role="radiogroup" aria-label="Shape" className={cn("flex flex-wrap gap-1.5", className)}>
      {(["all", ...CLASS_ORDER] as const).map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={filter === f}
          onClick={() => onFilter(f)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[7px] border px-[9px] text-[12px]",
            filter === f ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover",
          )}
        >
          {f !== "all" && <span aria-hidden className="rounded-[1.5px] border-[1.25px] border-current opacity-70" style={{ width: GLYPHS[f][0], height: GLYPHS[f][1] }} />}
          {f === "all" ? "All" : CLASS_NAMES[f]}
          {counts && <span className="font-ui-mono text-[10.5px] text-ui-4">{counts[f]}</span>}
        </button>
      ))}
    </div>
  );
}
