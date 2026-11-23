import { Menu } from "@/components/ui/menu";
import { ChevronUp, Grid3x3, Hand, Maximize, Minus, MousePointer2, PanelRight, Plus, RefreshCw, Snowflake } from "lucide-react";
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
  /** The 100% preset and Zoom to selection (the widget fills most of the canvas); unset outside the studio canvas. */
  onActualSize?: () => void;
  onZoomSelection?: () => void;
  /** A widget is selected; Zoom to selection is disabled without one. */
  hasSelection?: boolean;
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
  /** The bar says how parts snap (the InfoPanel editor's; on a grid page the status bar does). */
  snapItems?: boolean;
  /** Select and Pan: Pan keeps the hand tool on (Space and the middle button still hold it); unset outside the studio canvas. */
  tool?: { hand: boolean; onHand: (hand: boolean) => void };
  /** Add widget: the left panel's Add tab. */
  onAdd?: () => void;
  /** A floating inspector's opener (a narrow window: it starts closed). */
  inspector?: { open: boolean; onToggle: () => void };
}

const BAR_BUTTON = "h-7 w-7 rounded-ui-md hover:bg-ui-hover";
const TEXT_BUTTON = "flex h-7 items-center gap-1 rounded-ui-md px-2 text-micro text-ui-2 transition-colors hover:bg-ui-hover";

function Divider() {
  return <div className="mx-1 h-4.5 w-px shrink-0 bg-ui-strong" />;
}

/**
 * The bottom toolbar over the canvas (16 px from the bottom, centred): Select and Pan, Add widget, zoom, Fit and the
 * grid with its menu (rulers, 100%, Zoom to selection and the size link). The Frozen chip
 * follows while it applies.
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
  onActualSize,
  onZoomSelection,
  hasSelection = false,
  profile,
  onOpenProfile,
  sizeTitle = "Screen size, grid and spacing: open Screens",
  bottom,
  preview,
  snapItems,
  tool,
  onAdd,
  inspector,
}: ZoomToolbarProps) {
  const actual = !fitting && Math.abs(zoom - 1) < 0.005;
  return (
    <div
      style={bottom === undefined ? undefined : { bottom }}
      className={cn(
        "absolute bottom-4 left-1/2 z-30 flex h-10.5 max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 px-1.5",
        "rounded-ui-menu border border-ui-strong bg-ui-raised font-ui shadow-ui-float"
      )}
    >
      {/* Narrower than the canvas (a phone), the controls scroll sideways rather than widening the studio; the inspector's opener stays. */}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&>*]:shrink-0">
        {tool && (
          <>
            <IconButton label="Select" className={BAR_BUTTON} active={!tool.hand} aria-pressed={!tool.hand} onClick={() => tool.onHand(false)}>
              <MousePointer2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="Pan (hold Space)" className={BAR_BUTTON} active={tool.hand} aria-pressed={tool.hand} onClick={() => tool.onHand(true)}>
              <Hand className="h-4 w-4" />
            </IconButton>
            <Divider />
          </>
        )}
        {onAdd && (
          <>
            <button type="button" onClick={onAdd} className="flex h-7 items-center gap-1.5 rounded-ui-md border border-ui-strong px-2.5 text-caption font-medium text-ui-1 transition-colors hover:bg-ui-hover">
              <Plus className="h-4 w-4" aria-hidden /> Add widget
            </button>
            <Divider />
          </>
        )}
        <IconButton label={`Zoom out (${KEYS.zoomOut})`} className={BAR_BUTTON} onClick={() => onZoomStep(-1)}>
          <Minus className="h-4 w-4" />
        </IconButton>
        <span className="min-w-11 text-center font-ui-mono text-caption tabular-nums text-ui-1">{Math.round(zoom * 100)}%</span>
        <IconButton label={`Zoom in (${KEYS.zoomIn})`} className={BAR_BUTTON} onClick={() => onZoomStep(1)}>
          <Plus className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={onFit}
          aria-label="Fit"
          aria-pressed={fitting}
          title={`Fit the page to the canvas and keep it fitted (${KEYS.fit})`}
          className={cn("grid h-7 w-7 place-items-center rounded-ui-md transition-colors", fitting ? "bg-ui-active text-ui-1" : "text-ui-3 hover:bg-ui-hover hover:text-ui-1")}
        >
          <Maximize className="h-4 w-4" aria-hidden />
        </button>
        <Divider />
        {onToggleGrid && (
          <IconButton label="Toggle grid" className={BAR_BUTTON} active={showGrid} aria-pressed={showGrid} onClick={onToggleGrid}>
            <Grid3x3 className="h-4 w-4" />
          </IconButton>
        )}
        <Menu.Root>
          <Menu.Trigger aria-label="View options" title="View options" className="grid h-7 w-5 place-items-center rounded-ui-md text-ui-3 transition-colors hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover">
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </Menu.Trigger>
          <Menu.Content side="top" sideOffset={8} align="end">
            <Menu.Item onClick={onToggleRulers}>
              {showRulers ? "Hide rulers" : "Show rulers"}
            </Menu.Item>
            {onActualSize && (
              <Menu.Item disabled={actual} onClick={onActualSize}>
                Show at 100%
              </Menu.Item>
            )}
            {onZoomSelection && (
              <Menu.Item disabled={!hasSelection} onClick={onZoomSelection}>
                Zoom to selection <span className="text-micro text-ui-hint">{KEYS.zoomSelection}</span>
              </Menu.Item>
            )}
            <Menu.Item onClick={onOpenProfile} title={sizeTitle}>
              <span className="font-ui-mono">
                {profile.width} × {profile.height}
              </span>{" "}
              ↗
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
        {snapItems !== undefined && (
          <>
            <Divider />
            <span data-testid="snap-label" className="px-2 text-micro text-ui-3">
              {snapItems ? "Snap to cells · hold Alt to place freely" : "Items: free · widgets: cells"}
            </span>
          </>
        )}
        {preview?.frozen && <FrozenChip preview={preview} />}
      </div>
      {inspector && (
        <>
          <Divider />
          <IconButton label="All settings" className={cn(BAR_BUTTON, "shrink-0")} active={inspector.open} aria-pressed={inspector.open} onClick={inspector.onToggle}>
            <PanelRight className="h-4 w-4" />
          </IconButton>
        </>
      )}
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
        className={cn(TEXT_BUTTON, "text-ui-2")}
      >
        <Snowflake className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
      <IconButton label={`Refresh the snapshot (${KEYS.refreshPreview})`} className={BAR_BUTTON} onClick={preview.refresh}>
        <RefreshCw className="h-4 w-4" />
      </IconButton>
      <button type="button" onClick={() => preview.setSession("live")} title={`Show live data until the page reloads; the setting stays (${KEYS.togglePreview})`} className={TEXT_BUTTON}>
        Go live for this session
      </button>
    </>
  );
}
