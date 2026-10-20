import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileInput,
  FileOutput,
  Info,
  Keyboard,
  Maximize,
  MoreHorizontal,
  Pin,
  PinOff,
  Redo2,
  RotateCcw,
  Search,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { BUILD_ID } from "@/lib/buildInfo";
import { isTauri } from "@/lib/desktop";
import type { MonitorProfile } from "@/lib/layout";
import { zoneCount } from "@/lib/pages";
import { cn } from "@/lib/utils";
import { copyProfileJson } from "./config-file";
import { ResetConfigDialog } from "./reset-config-dialog";
import { StudioLogo } from "./studio-logo";
import { WindowControls } from "./window-controls";
import { KEYS } from "./use-studio-shortcuts";

/** Library, Gauges and Theme are full pages of their own, opened from the rail (Sources toggles from the rail). */
export type StudioMode = "design" | "sources" | "library" | "gauges" | "theme";

interface StudioTopBarProps {
  profiles: MonitorProfile[];
  /** The config's activeProfile: a pinned id, or "auto". */
  activeProfile: string;
  /** The profile displays show: the active one, or what "auto" resolves to for the window. */
  displayedId: string;
  /** The profile on the canvas (the pinned one, else the one displays show). */
  profile: MonitorProfile;
  /** The profile pinned for editing, if any. */
  pinnedId: string | undefined;
  /** Pin a profile for editing, or unpin with undefined. */
  onPin: (id: string | undefined) => void;
  /** Show a profile id on displays, or "auto" to match the window size. */
  onActivate: (id: string) => void;
  /** The profile name opens the Profiles left panel. */
  onOpenProfiles: () => void;
  /** Briefly true after a save (shows "Saved"). */
  saved: boolean;
  /** Edits the server does not have yet (the dot on Save). */
  unsaved: boolean;
  /** The last push could not reach the server: "Offline · edits kept locally". */
  offline: boolean;
  onSave: () => void;
  onExitStudio: () => void;
  onExport: () => void;
  /** Open the file picker for "Import config…". */
  onImport: () => void;
  /** Import an InfoPanel profile (the Import dialog). */
  onImportInfoPanel: () => void;
  /** Export the profile's canvas zone (the Export dialog); off without one. */
  onExportInfoPanel: () => void;
  canExportInfoPanel: boolean;
  onReset: () => void;
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
 * The profile being edited (its name opens the Profiles panel) with a chevron menu to pin it, or to
 * choose what displays show (a profile or Auto) without opening the panel. Pinned, the name carries
 * a pin and, when displays show another profile, a muted "Displays: …".
 */
function ProfileSwitcher({
  profiles,
  activeProfile,
  displayedId,
  profile,
  pinnedId,
  onPin,
  onActivate,
  onOpenProfiles,
}: Pick<
  StudioTopBarProps,
  "profiles" | "activeProfile" | "displayedId" | "profile" | "pinnedId" | "onPin" | "onActivate" | "onOpenProfiles"
>) {
  const auto = activeProfile === "auto";
  const pinned = pinnedId !== undefined;
  const displayedName = auto ? "Auto" : (profiles.find((p) => p.id === activeProfile)?.name ?? "Auto");
  return (
    // One hover target: the name opens the Profiles panel, the chevron the switch menu.
    <div className="flex min-w-0 items-center rounded-md transition-colors hover:bg-ui-hover">
      <button
        type="button"
        onClick={onOpenProfiles}
        title={pinned ? "Profiles (pinned for editing)" : auto ? "Profiles (auto-picked by window size)" : "Profiles"}
        className="flex h-8 min-w-0 items-center gap-1.5 py-1 pl-1.5 text-[13px] font-semibold text-ui-1"
      >
        <span className="truncate">{profile.name}</span>
        {pinned && <Pin aria-label="Pinned for editing" className="h-3 w-3 shrink-0 text-ui-3" />}
        {pinned && displayedId !== profile.id && (
          <span className="shrink-0 whitespace-nowrap text-[11.5px] font-normal text-ui-4 max-md:hidden">
            Displays: {displayedName}
          </span>
        )}
      </button>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Switch profile"
          title="Switch profile"
          className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-ui-3 transition-colors hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
        >
          <ChevronDown className="h-[18px] w-[18px]" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" sideOffset={4} align="start">
            <Menu.Popup className={POPUP}>
              <Menu.Item className={ITEM} onClick={() => onPin(pinned ? undefined : profile.id)}>
                {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                <span className="flex-1">{pinned ? "Unpin" : "Pin this profile for editing"}</span>
              </Menu.Item>
              <Menu.Separator className={SEPARATOR} />
              <Menu.Group>
                <Menu.GroupLabel className="px-2 pb-0.5 pt-1 text-[10.5px] font-medium uppercase tracking-wide text-ui-4">
                  Show on displays
                </Menu.GroupLabel>
                <Menu.Item className={ITEM} onClick={() => onActivate("auto")}>
                  <Wand2 className="h-3.5 w-3.5" />
                  <span className="flex-1">Auto (match window)</span>
                  {auto && <Check className="h-3.5 w-3.5" />}
                </Menu.Item>
                <Menu.Separator className={SEPARATOR} />
                {profiles.map((p) => (
                  <Menu.Item key={p.id} className={ITEM} onClick={() => onActivate(p.id)}>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="font-ui-mono text-[10.5px] text-ui-4">
                      {p.width}×{p.height}
                    </span>
                    <span className="w-3.5">{!auto && p.id === activeProfile && <Check className="h-3.5 w-3.5" />}</span>
                  </Menu.Item>
                ))}
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/** `1920 × 550 · 12 × 6 · Fill · 10 zones`, with `· 3 pages` when there are several. */
export function profileSummary(p: MonitorProfile): string {
  const zones = zoneCount(p);
  const pages = p.pages.length > 1 ? ` · ${p.pages.length} pages` : "";
  return `${p.width} × ${p.height} · ${p.cols} × ${p.rows} · ${p.fit === "fill" ? "Fill" : "Scroll"} · ${zones} ${zones === 1 ? "zone" : "zones"}${pages}`;
}

/**
 * "⋯": export / import / copy profile JSON / reset, the command palette
 * and shortcut sheet, and the build id.
 */
function MoreMenu({
  profile,
  onExport,
  onImport,
  onImportInfoPanel,
  onExportInfoPanel,
  canExportInfoPanel,
  onReset,
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
  | "onReset"
  | "onPalette"
  | "onShortcuts"
  | "canUndo"
  | "canRedo"
  | "onUndo"
  | "onRedo"
>) {
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

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
              <Menu.Item className={cn(ITEM, "text-ui-danger")} onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset everything…
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
      <ResetConfigDialog open={confirmReset} onOpenChange={setConfirmReset} onExport={onExport} onReset={onReset} />
    </>
  );
}

/** Import / Export: plain text buttons before Save; hidden on a phone (they stay in the "⋯" menu). */
const TEXT_BUTTON =
  "flex h-8 items-center whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:text-ui-5 disabled:hover:bg-transparent max-md:hidden";

/** Undo / redo: #c9c9cf when they can act, #4a4a52 when they cannot. */
const HISTORY_BUTTON = "text-[#c9c9cf] disabled:text-[#4a4a52] disabled:opacity-100";

/**
 * The studio's top bar: profile switcher and meta, then undo / redo, Kiosk view, Save and the "⋯" menu.
 */
export function StudioTopBar(props: StudioTopBarProps) {
  const { profile, saved, unsaved, offline, onSave, onExitStudio, canUndo, canRedo, onUndo, onRedo } = props;
  return (
    // In the desktop app this bar is the window's title bar: its empty space drags the window
    // (data-tauri-drag-region only acts on the element itself) and the caption buttons sit at the end.
    <header
      data-tauri-drag-region
      className={cn(
        "grid h-12 shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-3 font-ui max-sm:flex max-sm:gap-1.5 max-sm:px-2",
        isTauri() && "pr-0"
      )}
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2.5 max-sm:flex-1">
        <StudioLogo className="h-[26px] w-[26px] shrink-0 max-sm:hidden" />
        <ProfileSwitcher {...props} />
        <span data-tauri-drag-region className="min-w-0 truncate font-ui-mono text-[11px] text-ui-4 max-sm:hidden">
          {profileSummary(profile)}
        </span>
        {offline && (
          <span role="status" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ui-3 max-sm:hidden">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ui-warning" />
            Offline · edits kept locally
          </span>
        )}
      </div>

      <div data-tauri-drag-region className="flex items-center justify-end gap-1.5 self-stretch max-sm:gap-1">
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
        <div className="mx-1 h-5 w-px bg-ui-default max-sm:hidden" />
        <button
          type="button"
          onClick={onExitStudio}
          title="Kiosk view"
          className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 max-sm:px-2"
        >
          <Maximize className="h-[17px] w-[17px]" strokeWidth={1.75} /> <span className="max-sm:sr-only">Kiosk view</span>
        </button>
        <button
          type="button"
          onClick={props.onImportInfoPanel}
          title="Import an InfoPanel profile: .infopanel, folder, installed or saved canvas"
          className={TEXT_BUTTON}
        >
          Import
        </button>
        <button
          type="button"
          onClick={props.onExportInfoPanel}
          disabled={!props.canExportInfoPanel}
          title={props.canExportInfoPanel ? "Export the canvas zone as .infopanel or .canvas.zip" : "Export needs a canvas zone on this page"}
          className={TEXT_BUTTON}
        >
          Export
        </button>
        <button
          type="button"
          onClick={onSave}
          title={`Save to the dashboard server and refresh the kiosk view (${KEYS.save})`}
          className="flex h-8 items-center gap-[7px] whitespace-nowrap rounded-[7px] bg-ui-inverse px-3.5 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
        >
          {!saved && unsaved && (
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.62_0.17_255)]" aria-label="Unsaved changes" />
          )}
          {saved ? "Saved" : "Save"}
        </button>
        <MoreMenu {...props} />
        <WindowControls />
      </div>
    </header>
  );
}
