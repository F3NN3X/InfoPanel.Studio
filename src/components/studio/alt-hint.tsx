import type { CSSProperties } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cellRect, type PageGrid } from "@/lib/page-model/model";
import { cn } from "@/lib/utils";

/**
 * The pill at the top of the canvas while a drag holds Alt (Edit v3 SPEC §7.3): an item or element is placed freely,
 * or, for a widget, the reminder that widgets stay on their cells. Both canvases (a screen page's and an imported
 * profile's) show it.
 */
export function AltHint({ widget, className, style }: { widget: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div
      data-testid="alt-hint"
      data-shot-skip
      className={cn(
        "pointer-events-none flex h-[30px] items-center gap-2 whitespace-nowrap rounded-[8px] border border-ui-accent/60 bg-[#1a1a1f] px-3 font-ui text-[12px] text-ui-1 shadow-ui-float",
        className,
      )}
      style={style}
    >
      <Kbd>Alt</Kbd>
      {widget ? "Widgets always sit on the grid" : "Placing freely · release Alt to snap to cells"}
    </div>
  );
}

/**
 * Every cell of a page's grid as a faint dashed outline (SPEC §7.1), in the page's px; `k` page px per screen px keeps
 * the lines 1 screen px thin. Faded to 35 % while a part is placed freely.
 */
export function CellLines({ grid, k, faded }: { grid: PageGrid; k: number; faded: boolean }) {
  const cells = [];
  for (let row = 1; row <= grid.rows; row++) {
    for (let col = 1; col <= grid.cols; col++) {
      const r = cellRect(grid, { col, row, cols: 1, rows: 1 });
      cells.push(<rect key={`${col}:${row}`} x={r.x + k / 2} y={r.y + k / 2} width={Math.max(0, r.w - k)} height={Math.max(0, r.h - k)} />);
    }
  }
  return (
    <svg
      aria-hidden
      data-cell-lines=""
      data-shot-skip
      width={grid.width}
      height={grid.height}
      className="pointer-events-none absolute left-0 top-0"
      style={{ opacity: faded ? 0.35 : 1 }}
      fill="none"
      stroke="#ffffff0c"
      strokeWidth={k}
      strokeDasharray={`${4 * k} ${3 * k}`}
    >
      {cells}
    </svg>
  );
}
