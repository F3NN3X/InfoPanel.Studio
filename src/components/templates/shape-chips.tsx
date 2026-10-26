/**
 * The template galleries' shape filter (New InfoPanel profile, New screen): chips for All and each shape class,
 * the sections they show (one class, or All with the chosen size's class first), and how a class's cards are laid
 * out: long shapes get fewer, wider cards across, tall ones narrow cards, each thumbnail at its canvas's shape.
 */
import { cn } from "@/lib/utils";
import { SHAPE_CLASSES, type ShapeClass } from "@/lib/infopanel/templates/layout";

export type ShapeFilter = ShapeClass | "all";

export const CLASS_NAMES: Record<ShapeClass, string> = { strip: "Strip", wide: "Wide", standard: "Standard", tall: "Tall" };

export const COLUMNS: Record<ShapeClass, string> = {
  strip: "grid-cols-2 sm:grid-cols-3",
  wide: "grid-cols-2 sm:grid-cols-3",
  standard: "grid-cols-3 sm:grid-cols-4",
  tall: "grid-cols-3 sm:grid-cols-5",
};

/** A thumbnail keeps its canvas's shape, within 3:1 to 3:5. */
export const aspectOf = (width: number, height: number): number => Math.min(3, Math.max(0.6, width / height));

/** The sections a filter shows: the one class, or every class with the size's own first. */
export const sectionClasses = (filter: ShapeFilter, sizeClass: ShapeClass): ShapeClass[] =>
  filter === "all" ? [sizeClass, ...SHAPE_CLASSES.filter((c) => c !== sizeClass)] : [filter];

interface ShapeChipsProps {
  filter: ShapeFilter;
  onFilter: (f: ShapeFilter) => void;
}

export function ShapeChips({ filter, onFilter }: ShapeChipsProps) {
  return (
    <div role="radiogroup" aria-label="Shape" className="mb-2 flex flex-wrap gap-1.5">
      {(["all", ...SHAPE_CLASSES] as const).map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={filter === f}
          onClick={() => onFilter(f)}
          className={cn("h-7 rounded-[7px] border px-2.5 text-[12px]", filter === f ? "border-ui-accent bg-ui-accent/10 text-ui-1" : "border-ui-default text-ui-2 hover:bg-ui-hover")}
        >
          {f === "all" ? "All" : CLASS_NAMES[f]}
        </button>
      ))}
    </div>
  );
}
