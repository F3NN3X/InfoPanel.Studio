import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { Placement } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { isToggleClick } from "./selection";
import { placementTitle } from "./studio-modules";
import { moduleIcon } from "./zone-icons";
import { sortZones } from "./zone-geometry";

interface LayersPanelProps {
  placements: Placement[];
  /** The selected zones, the primary last. */
  selectedIds: string[];
  /**
   * Select the zone and bring it into view on the canvas, or (`toggle`:
   * Shift / Ctrl / ⌘ click) add it to or remove it from the selection.
   */
  onSelect: (id: string, toggle: boolean) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  /** A right-click on a row (viewport coordinates): the canvas builds the zone menu. */
  onContextMenu?: (id: string, x: number, y: number) => void;
}

/** Hide and delete show on hover (or keyboard focus) of the row. */
const ROW_BUTTON =
  "h-6 w-6 rounded-[5px] text-[#7c7c86] opacity-0 hover:bg-[#26262c] focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100";

/** The Layers tab: every zone of the profile in grid reading order. */
export function LayersPanel({
  placements,
  selectedIds,
  onSelect,
  onToggle,
  onRemove,
  onContextMenu,
}: LayersPanelProps) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
        {placements.length === 0 && <p className="px-2 py-5 text-center text-xs text-ui-4">No widgets yet.</p>}
        {sortZones(placements).map((p) => {
          const Icon = moduleIcon(p.module);
          const hidden = p.visible === false;
          const selected = selectedIds.includes(p.id);
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              title={`C${p.colStart}·R${p.rowStart} ${p.colSpan}×${p.rowSpan}`}
              // Shift+click would extend a text selection over the rows.
              onMouseDown={(e) => isToggleClick(e) && e.preventDefault()}
              onClick={(e) => onSelect(p.id, isToggleClick(e))}
              onContextMenu={
                onContextMenu
                  ? (e) => {
                      e.preventDefault();
                      onContextMenu(p.id, e.clientX, e.clientY);
                    }
                  : undefined
              }
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(p.id, false);
                }
              }}
              className={cn(
                "group flex cursor-pointer items-center gap-[9px] rounded-[7px] py-1.5 pl-2 pr-1.5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
                selected ? "bg-ui-accent-soft" : "hover:bg-ui-hover",
                hidden && "opacity-50"
              )}
            >
              <Icon
                className={cn("h-[17px] w-[17px] shrink-0", selected ? "text-[oklch(0.80_0.12_255)]" : "text-[#8a8a94]")}
                strokeWidth={1.5}
              />
              <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", selected ? "text-white" : "text-[#d4d4da]")}>
                {placementTitle(p)}
              </span>
              {Object.values(p.follow ?? {}).includes(false) && (
                <Pencil
                  className="h-[13px] w-[13px] shrink-0 text-ui-accent"
                  aria-label="Custom style"
                  // The SVG title carries the tooltip.
                >
                  <title>Custom style — a section does not follow the theme</title>
                </Pencil>
              )}
              <span className="shrink-0 font-ui-mono text-[10.5px] text-[#6f6f79]">
                {p.colSpan}×{p.rowSpan}
              </span>
              <IconButton
                label={hidden ? "Show" : "Hide"}
                className={ROW_BUTTON}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(p.id);
                }}
              >
                {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
              <IconButton
                label="Delete"
                danger
                className={ROW_BUTTON}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(p.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          );
        })}
      </div>
      <p className="shrink-0 text-pretty border-t border-ui-subtle px-3.5 py-3 text-[11.5px] leading-[1.45] text-[#7c7c86]">
        Shift-click to select several. Hidden widgets stay editable but don't show in kiosk view.
      </p>
    </>
  );
}
