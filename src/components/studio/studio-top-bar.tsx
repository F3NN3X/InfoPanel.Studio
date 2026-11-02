import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { Download, FileInput, FileOutput, MoreHorizontal, Radio, Redo2, Search, Tv, Undo2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { isTauri } from "@/lib/desktop";
import type { ControlKiosk, ControlState } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import { importedFromInfoPanel } from "@/lib/screens/list";
import { cn } from "@/lib/utils";
import { LiveControl } from "./live-popover";
import { ScreenSwitcher } from "./screen-switcher";
import { StudioLogo } from "./studio-logo";
import { WindowControls } from "./window-controls";
import { KEYS } from "./use-studio-shortcuts";

/** Every view but Design is a full page of its own: the rail's (Sources is Data) and Screens. */
export type StudioMode = "design" | "sources" | "library" | "gauges" | "theme" | "alerts" | "screens";

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
  /** The breadcrumb's "Screen settings…": Screens with the current screen selected (PLAN decision 24). */
  onScreenSettings: () => void;
  /** The Live popover (the status bar's Kiosks item opens it too). */
  liveOpen: boolean;
  onLiveOpenChange: (open: boolean) => void;
  kiosks: readonly ControlKiosk[];
  /** The runtime state the Live controls read (null while the server is unreachable). */
  control: ControlState | null;
  /** Live's "Open kiosk view". */
  onExitStudio: () => void;
  /** Briefly true after a save (shows "Saved"). */
  saved: boolean;
  /** Edits the server does not have yet (the dot on Save). */
  unsaved: boolean;
  onSave: () => void;
  /** The Export & back up sheet. */
  onExport: () => void;
  /** The Import door. */
  onImport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPalette: () => void;
}

const POPUP =
  "min-w-52 rounded-ui-menu border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const ITEM =
  "flex h-[30px] cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:text-ui-hint data-highlighted:bg-ui-active data-highlighted:text-ui-1 data-highlighted:shadow-[inset_2px_0_0_var(--ui-accent)]";
const SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";

/**
 * "⋯", on a phone only (the bar has no room there for Undo / Redo, Import and Export). Wider windows have the
 * buttons; the shortcut list is in Help (and `?`) and the build id in Settings › App › About.
 */
function MoreMenu({
  onExport,
  onImport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onLiveOpenChange,
}: Pick<StudioTopBarProps, "onExport" | "onImport" | "canUndo" | "canRedo" | "onUndo" | "onRedo" | "onLiveOpenChange">) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="More actions"
        title="More actions"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ui-3 sm:hidden transition-colors hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={POPUP}>
            <Menu.Item className={ITEM} disabled={!canUndo} onClick={onUndo}>
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Menu.Item>
            <Menu.Item className={ITEM} disabled={!canRedo} onClick={onRedo}>
              <Redo2 className="h-3.5 w-3.5" /> Redo
            </Menu.Item>
            <Menu.Separator className={SEPARATOR} />
            <Menu.Item className={ITEM} onClick={() => onLiveOpenChange(true)}>
              <Radio className="h-3.5 w-3.5" /> Live control…
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onImport}>
              <FileInput className="h-3.5 w-3.5" /> Import…
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onExport}>
              <FileOutput className="h-3.5 w-3.5" /> Export &amp; back up…
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Import / Export: outlined buttons before Live; icon-only under 960 px, in the "⋯" menu on a phone. */
const FILE_BUTTON =
  "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-strong px-2.5 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 max-sm:hidden max-[959px]:px-1.5";

/** Undo / redo: #c9c9cf when they can act, #4a4a52 when they cannot. */
const HISTORY_BUTTON = "text-ui-2 disabled:text-[#4a4a52] disabled:opacity-100";

/** The one Import and one Export button (SPEC §3.1): the Import door and the Export & back up sheet. */
function FileButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" title={label} onClick={onClick} className={FILE_BUTTON}>
      {icon}
      <span className="max-[959px]:sr-only">{label}</span>
    </button>
  );
}

/** The screen's kind beside the breadcrumb (Edit v3 SPEC §6.1): imported from InfoPanel, or a screen made here. */
function KindTag({ profile }: { profile: MonitorProfile }) {
  const imported = importedFromInfoPanel(profile);
  const Icon = imported ? Download : Tv;
  return (
    <span className="flex h-5 shrink-0 items-center gap-1 rounded-[5px] border border-ui-default bg-ui-hover px-1.5 text-micro text-ui-3 max-[959px]:hidden">
      <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
      {imported ? "Imported from InfoPanel" : "Screen"}
    </span>
  );
}

/**
 * The studio's title bar (40 px; the window's title bar on desktop): mark, screen / page breadcrumb and kind tag, the command
 * entry, undo / redo, Import, Export, Live, Save, the phone's "⋯" menu and the window controls.
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
        onScreenSettings={props.onScreenSettings}
      />
      <KindTag profile={profile} />
      <div data-tauri-drag-region className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={onPalette}
          title={`Search settings or run a command (${KEYS.palette})`}
          className="flex h-8 min-w-8 max-w-[380px] flex-1 items-center gap-2 rounded-[7px] border border-ui-default bg-ui-app px-2 text-[12.5px] text-ui-4 transition-colors hover:border-ui-strong hover:text-ui-3 max-[959px]:flex-none max-[959px]:justify-center max-[959px]:px-0 max-[959px]:w-8"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left max-[959px]:sr-only">Search settings or run a command</span>
          <kbd className="rounded border border-ui-default px-1.5 font-ui-mono text-micro text-ui-4 max-[959px]:hidden">{KEYS.palette}</kbd>
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
      <FileButton label="Import" icon={<FileInput className="h-4 w-4" strokeWidth={1.75} />} onClick={props.onImport} />
      <FileButton label="Export" icon={<FileOutput className="h-4 w-4" strokeWidth={1.75} />} onClick={props.onExport} />
      <LiveControl
        open={props.liveOpen}
        onOpenChange={props.onLiveOpenChange}
        profiles={profiles}
        kiosks={props.kiosks}
        screen={profile}
        control={props.control}
        onOpenKioskView={props.onExitStudio}
      />
      <button
        type="button"
        onClick={onSave}
        title={`Save to the dashboard server and refresh the kiosk view (${KEYS.save})`}
        className="flex h-7 items-center gap-[7px] whitespace-nowrap rounded-[7px] bg-ui-inverse px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
      >
        {!saved && unsaved && (
          <span role="img" className="h-1.5 w-1.5 rounded-full bg-[oklch(0.62_0.17_255)]" aria-label="Unsaved changes" />
        )}
        {saved ? "Saved" : "Save"}
      </button>
      <MoreMenu {...props} />
      <WindowControls />
    </header>
  );
}
