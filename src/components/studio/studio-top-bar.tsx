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
  Redo2,
  RotateCcw,
  Search,
  Settings,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { BUILD_ID } from "@/lib/buildInfo";
import { isTauri, openSettings } from "@/lib/desktop";
import type { MonitorProfile } from "@/lib/layout";
import { zoneCount } from "@/lib/pages";
import { cn } from "@/lib/utils";
import { copyProfileJson } from "./config-file";
import { ResetConfigDialog } from "./reset-config-dialog";
import { StudioLogo } from "./studio-logo";
import { WindowControls } from "./window-controls";
import { KEYS } from "./use-studio-shortcuts";

/** Library and Gauges are full pages of their own, opened from the rail (not part of the Design | Sources switch). */
export type StudioMode = "design" | "sources" | "library" | "gauges";

interface StudioTopBarProps {
  profiles: MonitorProfile[];
  /** The config's activeProfile: a pinned id, or "auto". */
  activeProfile: string;
  /** The profile on the canvas (pinned, or what "auto" resolves to). */
  profile: MonitorProfile;
  /** Pin a profile id, or "auto" to match the window size. */
  onActivate: (id: string) => void;
  /** The profile name opens the Profiles left panel. */
  onOpenProfiles: () => void;
  mode: StudioMode;
  onMode: (mode: StudioMode) => void;
  /** Briefly true after a save (shows "Saved"). */
  saved: boolean;
  /** Edits the server does not have yet (the dot on Save). */
  unsaved: boolean;
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

const MODES = [
  { value: "design" as const, label: "Design" },
  { value: "sources" as const, label: "Sources", title: "Data sources: bind widgets to their data" },
];

const POPUP =
  "min-w-52 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const ITEM =
  "flex h-[30px] cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:text-ui-5 data-highlighted:bg-ui-hover";
const SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";

/** Design | Sources: raised container, active segment lifted. */
function ModeSwitch({ mode, onMode }: Pick<StudioTopBarProps, "mode" | "onMode">) {
  return (
    <div
      role="radiogroup"
      aria-label="Mode"
      className="flex gap-0.5 rounded-lg border border-ui-default bg-ui-raised p-0.5"
      onKeyDown={(e) => {
        // Radio-group keys: arrows pick the neighbour (wrapping) and move focus to it.
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (step === 0) return;
        e.preventDefault();
        const at = MODES.findIndex((m) => m.value === mode);
        const next = MODES[(at + step + MODES.length) % MODES.length];
        onMode(next.value);
        e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[MODES.indexOf(next)]?.focus();
      }}
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={m.value === mode}
          tabIndex={m.value === mode ? 0 : -1}
          title={m.title}
          onClick={() => onMode(m.value)}
          className={cn(
            "rounded-md px-3.5 py-[5px] text-[12.5px] font-medium transition-colors max-sm:px-2.5",
            m.value === mode ? "bg-ui-active text-ui-1" : "text-[#8f8f99] hover:text-ui-1"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The profile name (opens the Profiles panel) with a chevron menu to switch
 * profile or pick Auto without opening the panel.
 */
function ProfileSwitcher({
  profiles,
  activeProfile,
  profile,
  onActivate,
  onOpenProfiles,
}: Pick<StudioTopBarProps, "profiles" | "activeProfile" | "profile" | "onActivate" | "onOpenProfiles">) {
  const auto = activeProfile === "auto";
  return (
    // One hover target: the name opens the Profiles panel, the chevron the switch menu.
    <div className="flex min-w-0 items-center rounded-md transition-colors hover:bg-ui-hover">
      <button
        type="button"
        onClick={onOpenProfiles}
        title={auto ? "Profiles (auto-picked by window size)" : "Profiles"}
        className="flex h-8 min-w-0 items-center py-1 pl-1.5 text-[13px] font-semibold text-ui-1"
      >
        <span className="truncate">{profile.name}</span>
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
                  <span className="w-3.5">{!auto && p.id === profile.id && <Check className="h-3.5 w-3.5" />}</span>
                </Menu.Item>
              ))}
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
              {isTauri() && (
                <Menu.Item className={ITEM} onClick={() => void openSettings().catch(() => {})}>
                  <Settings className="h-3.5 w-3.5" /> Desktop app settings
                </Menu.Item>
              )}
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
 * The studio's top bar: profile switcher and meta, Design | Sources, then
 * undo / redo, Kiosk view, Save and the "⋯" menu.
 */
export function StudioTopBar(props: StudioTopBarProps) {
  const { profile, mode, onMode, saved, unsaved, onSave, onExitStudio, canUndo, canRedo, onUndo, onRedo } = props;
  return (
    // In the desktop app this bar is the window's title bar: its empty space drags the window
    // (data-tauri-drag-region only acts on the element itself) and the caption buttons sit at the end.
    <header
      data-tauri-drag-region
      className={cn(
        "grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-3 font-ui max-sm:flex max-sm:gap-1.5 max-sm:px-2",
        isTauri() && "pr-0"
      )}
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2.5 max-sm:flex-1">
        <StudioLogo className="h-[26px] w-[26px] shrink-0 max-sm:hidden" />
        <ProfileSwitcher {...props} />
        <span data-tauri-drag-region className="min-w-0 truncate font-ui-mono text-[11px] text-ui-4 max-sm:hidden">
          {profileSummary(profile)}
        </span>
      </div>

      <ModeSwitch mode={mode} onMode={onMode} />

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
