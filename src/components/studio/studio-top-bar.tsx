import { lazy, Suspense, useState, type ReactNode } from "react";
import { ChevronRight, Pencil, Play, Redo2, Search, Undo2 } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusDot } from "@/components/ui/status-chip";
import { isTauri } from "@/lib/desktop";
import type { ControlKiosk, ControlState } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import type { SaveChip } from "./editor/save-chip";
import { LiveControl } from "./live-popover";
import { focusSoon } from "./focus-soon";
import { RenameInput } from "./rename-input";
import { ScreenSwitcher } from "./screen-switcher";
import { WindowControls } from "./window-controls";
import { KEYS } from "./use-studio-shortcuts";

/** Every view but Design is a full page of its own: the rail's (Sources is Data) and Screens. */
export type StudioMode = "design" | "sources" | "library" | "widgets" | "gauges" | "theme" | "alerts" | "screens";

export interface StudioTopBarProps {
  profiles: MonitorProfile[];
  /** The profile on the canvas. */
  profile: MonitorProfile;
  /** The page on the canvas. */
  pageId: string;
  /** Edit a screen on a page (the switcher). */
  onSelectScreen: (profileId: string, pageId: string) => void;
  /** The breadcrumb's Screens, and "Manage screens…". */
  onManageScreens: () => void;
  /** The breadcrumb's "Screen settings…": Screens with the current screen selected (PLAN decision 24). */
  onScreenSettings: () => void;
  /** The pencil: a new name for the screen (one undo step). */
  onRename: (name: string) => void;
  /** The page tabs, in the bar from 960 px; a narrow window keeps them in their own row. */
  tabs?: ReactNode;
  /** Edit's Page / Pinned toggle (P3), after the tabs; unset where there is no pinned layer to edit. */
  layerToggle?: ReactNode;
  /** A phone: the bar has no room for the file actions, and no sidebar holds Live. */
  phone: boolean;
  /** The Live popover, on a phone (the sidebar holds it elsewhere). */
  liveOpen: boolean;
  onLiveOpenChange: (open: boolean) => void;
  kiosks: readonly ControlKiosk[];
  /** The runtime state the Live controls read (null while the server is unreachable). */
  control: ControlState | null;
  /** Preview (Q25) and Live's "Open kiosk view". */
  onExitStudio: () => void;
  /** The saved state (P-1). */
  saved: SaveChip;
  /** Push now: the chip, the phone's menu and Ctrl+S. */
  onSave: () => void;
  /** The Export & back up sheet (a phone's menu). */
  onExport: () => void;
  /** The Import door (a phone's menu). */
  onImport: () => void;
  /** The File menu. */
  fileMenu?: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  /** What Undo and Redo would change, when it can be named. */
  undoName?: string;
  redoName?: string;
  onUndo: () => void;
  onRedo: () => void;
  onPalette: () => void;
}

/** "⋯", on a phone only, in its own chunk with what it reads (a desktop window and the kiosk never fetch it). */
const MoreMenu = lazy(() => import("./more-menu"));

/** Undo / redo: #c9c9cf when they can act, #4a4a52 when they cannot. */
const HISTORY_BUTTON = "text-ui-2 disabled:text-ui-glyph-off disabled:opacity-100";

/** The tooltip: `Undo: Outer ring → VRAM (Ctrl+Z)`, plain while the step has no name. */
const historyLabel = (verb: string, name: string | undefined, keys: string) => `${verb}${name ? `: ${name}` : ""} (${keys})`;

/** The breadcrumb's Screens › name and pencil (Q27): the name switches screen and page, the pencil renames it where it stands. */
function Breadcrumb(props: StudioTopBarProps) {
  const { profiles, profile, pageId, phone, onRename } = props;
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      {!phone && (
        <>
          <button type="button" onClick={props.onManageScreens} className={cn("h-7 shrink-0 rounded-ui-md px-1.5 text-body text-ui-3 transition-colors hover:text-ui-1 max-[1279px]:hidden", FOCUS_RING)}>
            Screens
          </button>
          <ChevronRight className="h-4 w-4 shrink-0 text-ui-hint max-[1279px]:hidden" aria-hidden />
        </>
      )}
      {renaming ? (
        <span className="w-44 px-1">
          <RenameInput
            label="Screen name"
            initial={profile.name}
            onDone={(name, byKey) => {
              setRenaming(false);
              if (name && name !== profile.name) onRename(name);
              if (byKey) focusSoon('button[aria-label="Rename screen"]');
            }}
          />
        </span>
      ) : (
        <ScreenSwitcher
          profiles={profiles}
          profile={profile}
          pageId={pageId}
          compact={props.tabs === undefined}
          onSelect={props.onSelectScreen}
          onManage={props.onManageScreens}
          onScreenSettings={props.onScreenSettings}
        />
      )}
      {!renaming && !phone && (
        <IconButton label="Rename screen" size={26} onClick={() => setRenaming(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
      )}
    </div>
  );
}

/**
 * The editor's top bar (56 px; the window's title bar on desktop, and on a phone on every page, where it is 40 px and
 * keeps the screen, search, Live and "⋯"): the breadcrumb, the page tabs, search, undo and redo that say what they
 * change, the saved state, Preview and File.
 */
export function StudioTopBar(props: StudioTopBarProps) {
  const { profiles, profile, saved, onSave, canUndo, canRedo, undoName, redoName, onUndo, onRedo, onPalette, phone, tabs } = props;
  return (
    // In the desktop app this bar is the window's title bar: its empty space drags the window
    // (data-tauri-drag-region only acts on the element itself) and the caption buttons sit at the end.
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome pl-4 pr-4 font-ui max-[959px]:h-10 max-[959px]:gap-2 max-[959px]:pl-2 max-[959px]:pr-2",
        isTauri() && "pr-0 max-[959px]:pr-0"
      )}
    >
      <Breadcrumb {...props} />
      {tabs}
      {props.layerToggle}
      <div data-tauri-drag-region className="flex min-w-8 flex-1 justify-center">
        <button
          type="button"
          onClick={onPalette}
          title={`Search or run a command (${KEYS.palette})`}
          aria-label="Search or run a command"
          className={cn(
            "flex h-8 min-w-8 max-w-[300px] flex-1 items-center gap-2 rounded-ui-md border border-ui-strong bg-ui-panel px-2.5 text-body text-ui-3 transition-colors hover:text-ui-1 max-[1279px]:w-8 max-[1279px]:flex-none max-[1279px]:justify-center max-[1279px]:px-0",
            FOCUS_RING
          )}
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left max-[1279px]:sr-only">Search or run a command</span>
          <kbd className="rounded-ui-sm border border-ui-strong px-1.5 font-ui-mono text-micro text-ui-hint max-[1279px]:hidden">{KEYS.palette}</kbd>
        </button>
      </div>
      {!phone && (
        <>
          <span className="flex shrink-0 items-center gap-0.5">
            <IconButton label={historyLabel("Undo", undoName, KEYS.undo)} size={32} className={HISTORY_BUTTON} disabled={!canUndo} onClick={onUndo}>
              <Undo2 className="h-4 w-4" />
            </IconButton>
            <IconButton label={historyLabel("Redo", redoName, KEYS.redo)} size={32} className={HISTORY_BUTTON} disabled={!canRedo} onClick={onRedo}>
              <Redo2 className="h-4 w-4" />
            </IconButton>
          </span>
          <div className="h-5 w-px shrink-0 bg-ui-strong" />
          <button
            type="button"
            data-testid="save-chip"
            data-tone={saved.tone}
            onClick={onSave}
            title={saved.tip}
            aria-label={saved.text}
            className={cn(
              "flex h-7 min-w-0 shrink items-center gap-2 whitespace-nowrap rounded-ui-md px-1.5 text-caption transition-colors hover:bg-ui-hover",
              FOCUS_RING,
              saved.tone === "danger" ? "text-ui-danger" : saved.tone === "warn" ? "text-ui-warn" : "text-ui-2"
            )}
          >
            <StatusDot tone={saved.tone} />
            <span role="status" className="min-w-0 truncate max-[1279px]:sr-only">
              {saved.text}
            </span>
          </button>
          <button
            type="button"
            onClick={props.onExitStudio}
            title="Open kiosk view"
            className={cn("flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body text-ui-1 transition-colors hover:bg-ui-hover max-[1279px]:w-8 max-[1279px]:justify-center max-[1279px]:px-0", FOCUS_RING)}
          >
            <Play className="h-3.5 w-3.5" aria-hidden /> <span className="max-[1279px]:sr-only">Preview</span>
          </button>
          {props.fileMenu}
        </>
      )}
      {phone && (
        <>
          <LiveControl
            open={props.liveOpen}
            onOpenChange={props.onLiveOpenChange}
            profiles={profiles}
            kiosks={props.kiosks}
            screen={profile}
            control={props.control}
            onOpenKioskView={props.onExitStudio}
          />
          <Suspense fallback={<div className="h-8 w-8 shrink-0" />}>
            <MoreMenu {...props} />
          </Suspense>
        </>
      )}
      <WindowControls />
    </header>
  );
}
