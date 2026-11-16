// The builder's block icons (Layers, "Add a block", the Block tab's header), one per block type as the mockup draws them.
import { Columns3, Gauge, Grid3x3, Hash, Image, LayoutGrid, List, LoaderCircle, Rows3, SlidersHorizontal, Square, SunMedium, TrendingUp, Type, type LucideIcon } from "lucide-react";
import type { Block, BlockType } from "@/widgets/recipe/types";

const ICON: Readonly<Record<BlockType, LucideIcon>> = {
  ring: LoaderCircle,
  gauge: Gauge,
  bar: SlidersHorizontal,
  sparkline: TrendingUp,
  value: Hash,
  label: Type,
  "weather-icon": SunMedium,
  image: Image,
  heatmap: Grid3x3,
  row: Columns3,
  grid: LayoutGrid,
  repeat: Rows3,
  card: Square,
};

/** A block type's icon; a row laid out as a column is a list. */
export function BlockIcon({ block, type, className = "h-4 w-4" }: { block?: Block; type?: BlockType; className?: string }) {
  const t = block?.type ?? type ?? "card";
  const Icon = block?.type === "row" && block.direction === "column" ? List : ICON[t];
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
