import { useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  Check,
  Copy,
  Download,
  FileInput,
  FileOutput,
  Info,
  Keyboard,
  MoreHorizontal,
  Redo2,
  Search,
  Undo2,
  Upload,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { BUILD_ID } from "@/lib/buildInfo";
import { isTauri } from "@/lib/desktop";
import type { ControlKiosk } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { copyProfileJson } from "./config-file";
import { LiveControl, type LiveRotate } from "./live-popover";
import { ScreenSwitcher } from "./screen-switcher";
import { StudioLogo } from "./studio-logo";
import { WindowControls } from "./window-controls";
import { KEYS } from "./use-studio-shortcuts";

/** Every view but Design is a full page of its own: the rail's (Sources is Data) and the two interim ones (Gauges, Screens). */
export type StudioMode = "design" | "sources" | "library" | "gauges" | "theme" | "alerts" | "screens" | "settings";

interface StudioTopBarProps {
  profiles: MonitorProfile[];
  /** The profile on the canvas. */
  profile: MonitorProfile;
  /** The page on the canvas. */
  pageId: string;
  /** Edit a screen on a page (the switcher). */
  onSelectScreen: (profileId: string, pageId: string) => void;
  /** "Manage screens…". */
  onManageScreens: () => void;
  /** The Live popover (the status bar's Kiosks item opens it too). */
  liveOpen: boolean;
  onLiveOpenChange: (open: boolean) => void;
  kiosks: readonly ControlKiosk[];
  /** The edited screen's runtime rotation (the Live popover's interim Pause / Play). */
  rotate: LiveRotate;
  /** Live's "Open kiosk view". */
  onExitStudio: () => void;
  /** Briefly true after a save (shows "Saved"). */
  saved: boolean;
  /** Edits the server does not have yet (the dot on Save). */
  unsaved: boolean;
  onSave: () => void;
  onExport: () => void;
  /** Open the file picker for "Import config…". */
  onImport: () => void;
  /** Import an InfoPanel profile (the Import dialog). */
  onImportInfoPanel: () => void;
  /** Export the profile's canvas zone (the Export dialog); off without one. */
  onExportInfoPanel: () => void;
  canExportInfoPanel: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPalette: () => void;
  onShortcuts: () => void;
}

const POPUP =
  "min-w-52 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const ITEM =
  "flex h-[30px] cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:text-ui-5 data-highlighted:bg-ui-hover";
const SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";

/**
 * "⋯": export / import / copy profile JSON, the command palette
 * and shortcut sheet, and the build id.
 */
function MoreMenu({
  profile,
  onExport,
  onImport,
  onImportInfoPanel,
  onExportInfoPanel,
  canExportInfoPanel,
  onPalette,
  onShortcuts,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Pick<
  StudioTopBarProps,
  | "profile"
  | "onExport"
  | "onImport"
  | "onImportInfoPanel"
  | "onExportInfoPanel"
  | "canExportInfoPanel"
  | "onPalette"
  | "onShortcuts"
  | "canUndo"
  | "canRedo"
  | "onUndo"
  | "onRedo"
>) {
  const [copied, setCopied] = useState(false);

  const copyProfile = () => {
    copyProfileJson(profile)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label="More actions"
          title={copied ? "Profile JSON copied" : "More actions"}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ui-3 transition-colors hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
        >
          {copied ? <Check className="h-4 w-4 text-ui-success" /> : <MoreHorizontal className="h-4 w-4" />}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
            <Menu.Popup className={POPUP}>
              {/* On a phone the bar has no room for Undo / Redo: they move in here. */}
              <div className="sm:hidden">
                <Menu.Item className={ITEM} disabled={!canUndo} onClick={onUndo}>
                  <Undo2 className="h-3.5 w-3.5" /> Undo
                </Menu.Item>
                <Menu.Item className={ITEM} disabled={!canRedo} onClick={onRedo}>
                  <Redo2 className="h-3.5 w-3.5" /> Redo
                </Menu.Item>
                <Menu.Separator className={SEPARATOR} />
              </div>
              {/* On a phone Import / Export have no room in the bar: they move in here. */}
              <div className="sm:hidden">
                <Menu.Item className={ITEM} onClick={onExport}>
                  <Download className="h-3.5 w-3.5" /> Export config
                </Menu.Item>
                <Menu.Item className={ITEM} onClick={onImport}>
                  <Upload className="h-3.5 w-3.5" /> Import config…
                </Menu.Item>
                <Menu.Item className={ITEM} onClick={onImportInfoPanel}>
                  <FileInput className="h-3.5 w-3.5" /> Import InfoPanel profile…
                </Menu.Item>
                <Menu.Item className={ITEM} disabled={!canExportInfoPanel} onClick={onExportInfoPanel}>
                  <FileOutput className="h-3.5 w-3.5" /> Export InfoPanel canvas…
                </Menu.Item>
                <Menu.Separator className={SEPARATOR} />
              </div>
              <Menu.Item className={ITEM} onClick={copyProfile}>
                <Copy className="h-3.5 w-3.5" /> Copy profile JSON
              </Menu.Item>
              <Menu.Separator className={SEPARATOR} />
              <Menu.Item className={ITEM} onClick={onPalette}>
                <Search className="h-3.5 w-3.5" />
                <span className="flex-1">Command palette…</span>
                <span className="font-ui-mono text-[10.5px] text-ui-4">{KEYS.palette}</span>
              </Menu.Item>
              <Menu.Item className={ITEM} onClick={onShortcuts}>
                <Keyboard className="h-3.5 w-3.5" />
                <span className="flex-1">Keyboard shortcuts</span>
                <span className="font-ui-mono text-[10.5px] text-ui-4">{KEYS.cheatsheet}</span>
              </Menu.Item>
              <Menu.Separator className={SEPARATOR} />
              <Menu.Item className={ITEM} disabled>
                <Info className="h-3.5 w-3.5" />
                <span className="font-ui-mono text-[10.5px]">build {BUILD_ID}</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}

/** Import / Export: outlined buttons before Live; icon-only under 960 px, in the "⋯" menu on a phone. */
const FILE_BUTTON =
  "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-strong px-2.5 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover max-sm:hidden max-[959px]:px-1.5";

/** Undo / redo: #c9c9cf when they can act, #4a4a52 when they cannot. */
const HISTORY_BUTTON = "text-[#c9c9cf] disabled:text-[#4a4a52] disabled:opacity-100";

/**
 * The one Import and one Export button (SPEC §3.1). Until Phase 6 builds the Import door and the Export sheet
 * each opens a small menu over the existing dialogs and file pickers.
 */
function FileMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger title={label} className={FILE_BUTTON}>
        {icon}
        <span className="max-[959px]:sr-only">{label}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={POPUP}>{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * The studio's title bar (40 px; the window's title bar on desktop): mark, screen / page switcher, the command
 * entry, undo / redo, Import, Export, Live, Save, the "⋯" menu and the window controls.
 */
export function StudioTopBar(props: StudioTopBarProps) {
  const { profiles, profile, pageId, saved, unsaved, onSave, canUndo, canRedo, onUndo, onRedo, onPalette } = props;
  return (
    // In the desktop app this bar is the window's title bar: its empty space drags the window
    // (data-tauri-drag-region only acts on the element itself) and the caption buttons sit at the end.
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-ui-subtle bg-ui-chrome px-3 font-ui max-sm:gap-1.5 max-sm:px-2",
        isTauri() && "pr-0"
      )}
    >
      <StudioLogo className="pointer-events-none h-5 w-5 shrink-0 max-sm:hidden" />
      <ScreenSwitcher
        profiles={profiles}
        profile={profile}
        pageId={pageId}
        onSelect={props.onSelectScreen}
        onManage={props.onManageScreens}
      />
      <div data-tauri-drag-region className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={onPalette}
          title={`Search settings or run a command (${KEYS.palette})`}
          className="flex h-8 min-w-8 max-w-[340px] flex-1 items-center gap-2 rounded-[7px] border border-ui-default bg-ui-app px-2 text-[12.5px] text-ui-4 transition-colors hover:border-ui-strong hover:text-ui-3 max-[959px]:flex-none max-[959px]:justify-center max-[959px]:px-0 max-[959px]:w-8"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left max-[959px]:sr-only">Search settings or run a command</span>
          <kbd className="rounded border border-ui-default px-1.5 font-ui-mono text-[10.5px] text-ui-4 max-[959px]:hidden">{KEYS.palette}</kbd>
        </button>
      </div>
      <IconButton
        label={`Undo (${KEYS.undo})`}
        size={32}
        className={cn(HISTORY_BUTTON, "max-sm:hidden")}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 className="h-[19px] w-[19px]" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={`Redo (${KEYS.redo})`}
        size={32}
        className={cn(HISTORY_BUTTON, "max-sm:hidden")}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 className="h-[19px] w-[19px]" strokeWidth={1.75} />
      </IconButton>
      <div className="h-[18px] w-px shrink-0 bg-ui-default max-sm:hidden" />
      <FileMenu label="Import" icon={<FileInput className="h-4 w-4" strokeWidth={1.75} />}>
        <Menu.Item className={ITEM} onClick={props.onImportInfoPanel}>
          <FileInput className="h-3.5 w-3.5" /> InfoPanel profile…
        </Menu.Item>
        <Menu.Item className={ITEM} onClick={props.onImport}>
          <Upload className="h-3.5 w-3.5" /> Config file…
        </Menu.Item>
      </FileMenu>
      <FileMenu label="Export" icon={<FileOutput className="h-4 w-4" strokeWidth={1.75} />}>
        <Menu.Item className={ITEM} onClick={props.onExport}>
          <Download className="h-3.5 w-3.5" /> Config file
        </Menu.Item>
        <Menu.Item className={ITEM} disabled={!props.canExportInfoPanel} onClick={props.onExportInfoPanel}>
          <FileOutput className="h-3.5 w-3.5" /> InfoPanel canvas…
        </Menu.Item>
      </FileMenu>
      <LiveControl
        open={props.liveOpen}
        onOpenChange={props.onLiveOpenChange}
        profiles={profiles}
        kiosks={props.kiosks}
        rotate={props.rotate}
        onOpenKioskView={props.onExitStudio}
      />
      <button
        type="button"
        onClick={onSave}
        title={`Save to the dashboard server and refresh the kiosk view (${KEYS.save})`}
        className="flex h-7 items-center gap-[7px] whitespace-nowrap rounded-[7px] bg-ui-inverse px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
      >
        {!saved && unsaved && (
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.62_0.17_255)]" aria-label="Unsaved changes" />
        )}
        {saved ? "Saved" : "Save"}
      </button>
      <MoreMenu {...props} />
      <WindowControls />
    </header>
  );
}
