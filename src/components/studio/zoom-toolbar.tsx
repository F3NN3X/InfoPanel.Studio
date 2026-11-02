import { Grid3x3, Minus, Plus, RefreshCw, RulerDimensionLine, Snowflake } from "lucide-react";
import type { PreviewDataState } from "@/hooks/use-preview-data";
import { openSettings } from "@/lib/desktop";
import { IconButton } from "@/components/ui/icon-button";
import type { ProfileView } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { KEYS } from "./use-studio-shortcuts";

interface ZoomToolbarProps {
  zoom: number;
  /** The zoom follows the fit (the Fit button shows active). */
  fitting: boolean;
  /** Both off outside the studio canvas: the InfoPanel editor has no dot grid. */
  showGrid?: boolean;
  onToggleGrid?: () => void;
  showRulers: boolean;
  onToggleRulers: () => void;
  onZoomStep: (dir: 1 | -1) => void;
  onFit: () => void;
  /** The profile shown on the canvas (resolution button). */
  profile: ProfileView;
  /** The size link: open Screens. */
  onOpenProfile: () => void;
  /** The size link's tooltip, when it opens something other than Screens. */
  sizeTitle?: string;
  /** Distance from the canvas bottom (above the phone's sheet); 16 px by default. */
  bottom?: number;
  /** The Design preview data (a `Frozen` chip while frozen); none outside Design. */
  preview?: PreviewDataState;
  /** The page's Snap items (Edit v3 SPEC §7.2): the bar says how parts snap; unset outside Edit. */
  snapItems?: boolean;
  /**
   * `Studio | InfoPanel` (decision Q10): on a screen made for InfoPanel too, the canvas drawn as it is or as the page
   * exports; unset otherwise.
   */
  exportView?: ExportView;
}

/** The canvas's view on a screen made for InfoPanel too: true draws the page as it exports. */
export interface ExportView {
  infoPanel: boolean;
  onChange: (infoPanel: boolean) => void;
}

const BAR_BUTTON = "h-7 w-7 rounded-md hover:bg-ui-default";
const TOGGLE_BUTTON = cn(BAR_BUTTON, "text-ui-2");
const TEXT_BUTTON = "flex h-[26px] items-center gap-1 rounded-md px-2 text-[11.5px] text-ui-2 transition-colors hover:bg-ui-default";

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
  sizeTitle = "Screen size, grid and spacing: open Screens",
  bottom,
  preview,
  snapItems,
  exportView,
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
      {onToggleGrid && (
        <IconButton label="Toggle grid" className={TOGGLE_BUTTON} active={showGrid} aria-pressed={showGrid} onClick={onToggleGrid}>
          <Grid3x3 className="h-[18px] w-[18px]" />
        </IconButton>
      )}
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
          fitting ? "bg-ui-active text-ui-1" : "text-ui-4 hover:bg-ui-default"
        )}
      >
        Fit
      </button>
      <Divider />
      <button
        type="button"
        onClick={onOpenProfile}
        title={sizeTitle}
        className={cn(TEXT_BUTTON, "font-ui-mono text-micro")}
      >
        {profile.width}×{profile.height} ↗
      </button>
      {snapItems !== undefined && (
        <>
          <Divider />
          <span data-testid="snap-label" className="px-2 text-[11.5px] text-ui-3">
            {snapItems ? "Snap: cells · Alt frees items" : "Items: free · widgets: cells"}
          </span>
        </>
      )}
      {exportView && (
        <>
          <Divider />
          <ExportViewSwitch view={exportView} />
        </>
      )}
      {preview?.frozen && <FrozenChip preview={preview} />}
    </div>
  );
}

/** `Studio | InfoPanel`: the page as Studio draws it, or as InfoPanel will after export. */
function ExportViewSwitch({ view }: { view: ExportView }) {
  const option = (infoPanel: boolean, label: string, title: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={view.infoPanel === infoPanel}
      title={title}
      onClick={() => view.onChange(infoPanel)}
      className={cn("h-[22px] rounded-[5px] px-2 text-[11.5px] transition-colors", view.infoPanel === infoPanel ? "bg-ui-active text-ui-1" : "text-ui-4 hover:text-ui-1")}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="View as" data-testid="export-view" className="flex h-[26px] items-center gap-0.5 rounded-md bg-ui-app p-0.5">
      {option(false, "Studio", "The page as Studio panels show it")}
      {option(true, "InfoPanel", "The page as it exports to InfoPanel: items drawn by InfoPanel, the parts left out hidden")}
    </div>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** `Frozen · HH:MM` while the Design preview shows a snapshot: Refresh, and Go live for this session. */
function FrozenChip({ preview }: { preview: PreviewDataState }) {
  const { snapshot } = preview;
  const label =
    snapshot.status === "loading" && snapshot.takenAt === null
      ? "Freezing…"
      : snapshot.status === "empty"
        ? "Frozen · No data yet"
        : `Frozen · ${snapshot.takenAt === null ? "" : clock(snapshot.takenAt)}`;
  return (
    <>
      <Divider />
      <button
        type="button"
        onClick={() => void openSettings("studio")}
        title={`The canvas shows a snapshot of the sensor values, with weather, visualisers and other effects still (Design preview data: ${preview.mode === "frozenWhenUnfocused" ? "frozen when unfocused" : "frozen"}). Clocks still tick. The Data view, sensor pickers, kiosks and Kiosk view stay live. Click to change it in Settings › Studio.`}
        className={cn(TEXT_BUTTON, "text-sky-300")}
      >
        <Snowflake className="h-[14px] w-[14px]" aria-hidden />
        {label}
      </button>
      <IconButton label={`Refresh the snapshot (${KEYS.refreshPreview})`} className={BAR_BUTTON} onClick={preview.refresh}>
        <RefreshCw className="h-[16px] w-[16px]" />
      </IconButton>
      <button type="button" onClick={() => preview.setSession("live")} title={`Show live data until the page reloads; the setting stays (${KEYS.togglePreview})`} className={TEXT_BUTTON}>
        Go live for this session
      </button>
    </>
  );
}