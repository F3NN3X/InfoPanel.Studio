import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronRight, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import type { Placement } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { placementTitle } from "./studio-modules";
import { KEYS } from "./use-studio-shortcuts";
import { toolbarPosition as chipPosition, type ToolbarPosition as ChipPosition } from "./zone-toolbar-position";

interface SelectionChipProps {
  /** The primary selected zone (the chip sits above it). */
  placement: Placement;
  /** How many zones are selected: with more than one the chip reads "N selected". */
  count?: number;
  /** Whether any selected zone shows (hide them all), else show them all. */
  anyVisible?: boolean;
  /** The selected panel widget's name: a second crumb after the zone's. */
  widgetLabel?: string;
  /** Open the widget picker for this zone (Change widget). */
  onPickWidget: () => void;
  onToggleVisible: () => void;
  /** Open the zone context menu below the More button (viewport px). */
  onMore: (x: number, y: number) => void;
  /** The zone context menu is open (More's `aria-expanded`). */
  moreOpen?: boolean;
}

const CHIP_BUTTON =
  "flex h-6 shrink-0 items-center justify-center rounded-md px-1 transition-colors hover:bg-black/15";

/**
 * The selected zone's chip: its name (opens Change widget), size, Hide and
 * More. The size steps, duplicate, delete, Style and deselect that the old
 * toolbar had are in More (the zone context menu).
 */
export function SelectionChip({
  placement: p,
  count = 1,
  anyVisible = p.visible,
  widgetLabel,
  onPickWidget,
  onToggleVisible,
  onMore,
  moreOpen = false,
}: SelectionChipProps) {
  const multi = count > 1;
  return (
    <div className="flex h-7 items-center gap-0.5 whitespace-nowrap rounded-ui-sm bg-ui-accent px-1 font-ui text-body font-bold text-ui-inverse-fg">
      {multi ? (
        <span className="px-1.5">{count} selected</span>
      ) : (
        <>
          <button
            type="button"
            onClick={onPickWidget}
            title="Change widget"
            className={cn(CHIP_BUTTON, "max-w-44 px-1.5")}
          >
            <span className="truncate">{placementTitle(p)}</span>
                      </button>
          {widgetLabel !== undefined && (
            <span
              className="flex max-w-36 items-center gap-0.5"
              title={`Selected widget — ${KEYS.deselect} selects the panel`}
            >
              <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate rounded-sm bg-black/15 px-1">{widgetLabel}</span>
            </span>
          )}
        </>
      )}
      <span className="px-1 font-ui-mono font-medium tabular-nums opacity-70" title="Widget size (grid cells)">
        {p.colSpan}×{p.rowSpan}
      </span>
      <button
        type="button"
        onClick={onToggleVisible}
        title={`${anyVisible ? "Hide" : "Show"} ${multi ? "widgets" : "widget"} (${KEYS.hide})`}
        aria-label={`${anyVisible ? "Hide" : "Show"} ${multi ? "widgets" : "widget"}`}
        className={cn(CHIP_BUTTON, "w-6")}
      >
        {anyVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onMore(r.left, r.bottom + 4);
        }}
        title="More"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        className={cn(CHIP_BUTTON, "w-6")}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface SelectionChipLayerProps {
  /** The canvas scroll container (the chip is placed over it). */
  scrollRef: RefObject<HTMLDivElement | null>;
  zoneId: string;
  /** Changes whenever the zone can have moved (zoom, box, grid). */
  layoutKey: string;
  children: ReactNode;
}

/**
 * Keeps the chip next to the zone's frame. It lives outside the zoomed
 * canvas (constant size) and follows scrolling, zoom and resizes.
 */
export function SelectionChipLayer({ scrollRef, zoneId, layoutKey, children }: SelectionChipLayerProps) {
  const chipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<ChipPosition | null>(null);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const chip = chipRef.current;
    if (!scroller || !chip) return;
    const frame = scroller.querySelector(`[data-zone-id="${CSS.escape(zoneId)}"]`);
    const update = () => {
      if (!frame) return setPos(null);
      const s = scroller.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      setPos(
        chipPosition(
          { left: f.left - s.left, top: f.top - s.top, width: f.width, height: f.height },
          { width: scroller.clientWidth, height: scroller.clientHeight },
          { width: chip.offsetWidth, height: chip.offsetHeight }
        )
      );
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(chip);
    if (frame) observer.observe(frame);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollRef, zoneId, layoutKey]);

  return (
    <div
      ref={chipRef}
      data-selection-chip
      className="absolute z-30"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {children}
    </div>
  );
}
