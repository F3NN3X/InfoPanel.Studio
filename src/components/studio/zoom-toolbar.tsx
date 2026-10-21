import { Grid3x3, Minus, Plus, RulerDimensionLine } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { ProfileView } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { KEYS } from "./use-studio-shortcuts";

interface ZoomToolbarProps {
  zoom: number;
  /** The zoom follows the fit (the Fit button shows active). */
  fitting: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  showRulers: boolean;
  onToggleRulers: () => void;
  onZoomStep: (dir: 1 | -1) => void;
  onFit: () => void;
  /** The profile shown on the canvas (resolution button). */
  profile: ProfileView;
  /** The size link: open Screens. */
  onOpenProfile: () => void;
  /** Distance from the canvas bottom (above the phone's sheet); 16 px by default. */
  bottom?: number;
}

const BAR_BUTTON = "h-7 w-7 rounded-md hover:bg-[#24242a]";
const TOGGLE_BUTTON = cn(BAR_BUTTON, "text-[#c9c9cf]");
const TEXT_BUTTON = "flex h-[26px] items-center gap-1 rounded-md px-2 text-[11.5px] text-[#c9c9cf] transition-colors hover:bg-[#24242a]";

function Divider() {
  return <div className="mx-1 h-[18px] w-px shrink-0 bg-ui-strong" />;
}

/**
 * The floating bar over the canvas (16 px from the bottom, centred): grid
 * and ruler toggles, zoom, Fit and the size link (Screens).
 */
export function ZoomToolbar({
  zoom,
  fitting,
  showGrid,
  onToggleGrid,
  showRulers,
  onToggleRulers,
  onZoomStep,
  onFit,
  profile,
  onOpenProfile,
  bottom,
}: ZoomToolbarProps) {
  return (
    <div
      style={bottom === undefined ? undefined : { bottom }}
      className={cn(
        // Narrower than the canvas (a phone), it scrolls sideways rather than widening the studio.
        "absolute bottom-4 left-1/2 z-30 flex h-9 max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto whitespace-nowrap px-1 [scrollbar-width:none] [&>*]:shrink-0",
        "rounded-[10px] border border-ui-strong bg-ui-raised font-ui shadow-ui-float"
      )}
    >
      <IconButton label="Toggle grid" className={TOGGLE_BUTTON} active={showGrid} aria-pressed={showGrid} onClick={onToggleGrid}>
        <Grid3x3 className="h-[18px] w-[18px]" />
      </IconButton>
      <IconButton label="Toggle rulers" className={TOGGLE_BUTTON} active={showRulers} aria-pressed={showRulers} onClick={onToggleRulers}>
        <RulerDimensionLine className="h-[18px] w-[18px]" />
      </IconButton>
      <Divider />
      <IconButton label={`Zoom out (${KEYS.zoomOut})`} className={BAR_BUTTON} onClick={() => onZoomStep(-1)}>
        <Minus className="h-[18px] w-[18px]" />
      </IconButton>
      <span className="min-w-11 text-center font-ui-mono text-[11.5px] text-ui-1">{Math.round(zoom * 100)}%</span>
      <IconButton label={`Zoom in (${KEYS.zoomIn})`} className={BAR_BUTTON} onClick={() => onZoomStep(1)}>
        <Plus className="h-[18px] w-[18px]" />
      </IconButton>
      <button
        type="button"
        onClick={onFit}
        aria-pressed={fitting}
        title={`Fit the page to the canvas and keep it fitted (${KEYS.fit})`}
        className={cn(
          "h-[26px] rounded-md px-[9px] text-[11.5px] font-medium transition-colors",
          fitting ? "bg-ui-active text-ui-1" : "text-[#8f8f99] hover:bg-[#24242a]"
        )}
      >
        Fit
      </button>
      <Divider />
      <button
        type="button"
        onClick={onOpenProfile}
        title="Screen size, grid and spacing: open Screens"
        className={cn(TEXT_BUTTON, "font-ui-mono text-[11px]")}
      >
        {profile.width}×{profile.height} ↗
      </button>
    </div>
  );
}
