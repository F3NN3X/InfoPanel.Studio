import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Menu } from "@base-ui/react/menu";
import {
  ClipboardCopy,
  Circle,
  CircleDot,
  Copy,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Share,
  Trash2,
  Upload,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { copyProfileJson } from "./config-file";
import { pageIcon } from "./page-icons";
import { exportProfileFile, importedProfile, importProfileFile, startProfileImport } from "./profile-file";
import { ProfilePreview } from "./profile-preview";

interface ProfilesPanelProps {
  profiles: MonitorProfile[];
  /** The dashboard, which the previews inherit from where a profile sets none. */
  dashboard: DashboardConfig;
  /** The config's activeProfile: what the app opens on, a profile id or "auto". */
  activeProfile: string;
  /** The profile being edited: the selected card. */
  profile: MonitorProfile;
  /** The page on the canvas. */
  currentPageId: string;
  /** The studio window, which "Best fit" and "Opens now" are for. */
  windowSize: { width: number; height: number };
  /** The profile "auto" resolves to for the current window size. */
  autoProfileId: string;
  /** Select a profile for editing. Never changes what the app opens on. */
  onSelectProfile: (id: string) => void;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  /** Set what the app opens on: a profile id, or "auto" for the closest to the window. */
  onActivate: (id: string) => void;
  onAddProfile: () => void;
  /** Add an imported profile (fresh ids, a unique name) and edit it. */
  onImportProfile: (profile: MonitorProfile) => void;
  onDuplicateProfile: (id: string) => void;
  /** Delete a profile (after the confirm dialog). */
  onRemoveProfile: (id: string) => void;
  /** Patch the edited profile's own fields (name). */
  onProfileChange: (patch: Partial<MonitorProfile>) => void;
}

const MENU_POPUP =
  "min-w-48 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const MENU_ITEM =
  "flex h-[30px] cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-disabled:text-ui-5 data-highlighted:bg-ui-hover";

/** The meta line of a card: `1920×550 · 3 pages`. */
export function profileMeta(p: MonitorProfile): string {
  return `${p.width}×${p.height} · ${p.pages.length} ${p.pages.length === 1 ? "page" : "pages"}`;
}

/** The card's rarely used actions. */
function RowMenu({
  profile,
  canDelete,
  onRename,
  onDuplicate,
  onAlwaysOpen,
  onExport,
  onDelete,
}: {
  profile: MonitorProfile;
  /** Any profile but the last one can be deleted. */
  canDelete: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onAlwaysOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  return (
    <Menu.Root>
      <Menu.Trigger
        onClick={(e) => e.stopPropagation()}
        title="Profile actions"
        aria-label="Profile actions"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-active hover:text-ui-1 data-popup-open:bg-ui-active data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={MENU_POPUP} onClick={(e) => e.stopPropagation()}>
            <Menu.Item className={MENU_ITEM} onClick={onRename}>
              <Pencil className="h-3.5 w-3.5 text-ui-3" />
              Rename
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5 text-ui-3" />
              Duplicate
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={onAlwaysOpen}>
              <Rocket className="h-3.5 w-3.5 text-ui-3" />
              Always open this one
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={onExport}>
              <Share className="h-3.5 w-3.5 text-ui-3" />
              Export profile
            </Menu.Item>
            <Menu.Item
              className={MENU_ITEM}
              onClick={() =>
                copyProfileJson(profile)
                  .then(() => toast("Copied to clipboard"))
                  .catch(() => {})
              }
            >
              <ClipboardCopy className="h-3.5 w-3.5 text-ui-3" />
              Copy profile JSON
            </Menu.Item>
            <Menu.Separator className="mx-1 my-1 h-px bg-ui-subtle" />
            <Menu.Item className={cn(MENU_ITEM, "text-ui-danger data-disabled:text-ui-5")} disabled={!canDelete} onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

/** Confirm deleting a profile with its pages and zones. */
function DeleteDialog({
  profile,
  onConfirm,
  onClose,
}: {
  profile: MonitorProfile | undefined;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const n = profile?.pages.length ?? 0;
  return (
    <AlertDialog.Root open={profile !== undefined} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[24rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Delete {profile?.name}?</AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-ui-3">
            This removes the profile and its {n === 1 ? "page" : `${n} pages`}. Undo (Ctrl+Z) brings it back.
          </AlertDialog.Description>
          <div className="flex items-center justify-end gap-2 pt-1">
            <AlertDialog.Close render={<button type="button" className={DIALOG_BUTTON} />}>Cancel</AlertDialog.Close>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[7px] bg-ui-danger px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              Delete profile
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** The inline name input of the profile (or page) being renamed. */
export function RenameInput({
  initial,
  onDone,
  label = "Profile name",
}: {
  initial: string;
  onDone: (name: string | null) => void;
  label?: string;
}) {
  const [name, setName] = useState(initial);
  // Enter / Esc finish it; the blur the unmount may fire must not finish it again.
  const finished = useRef(false);
  const finish = (value: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(value);
  };
  const commit = () => finish(name.trim() || null);
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") finish(null);
      }}
      onBlur={commit}
      aria-label={label}
      className="w-full rounded border border-ui-strong bg-ui-app px-1.5 py-0.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent"
    />
  );
}

/** The one tag of a card: where the app opens, if it opens on this profile. */
function LaunchTag({ opensNow, onLaunch, size }: { opensNow: boolean; onLaunch: boolean; size: { width: number; height: number } }) {
  if (opensNow) {
    return (
      <span
        title={`Closest to this ${size.width} × ${size.height} window`}
        className="whitespace-nowrap rounded px-1.5 py-px text-[10px] font-medium text-ui-dot-dashboard bg-ui-dot-dashboard/15"
      >
        Opens now
      </span>
    );
  }
  if (onLaunch) {
    return (
      <span
        title="The app opens on this profile whatever the window size"
        className="whitespace-nowrap rounded px-1.5 py-px text-[10px] font-medium text-ui-3 bg-ui-active"
      >
        On launch
      </span>
    );
  }
  return null;
}

/** The edited card's pages: a click shows the page on the canvas, like its tab. */
function PageList({
  profile,
  currentPageId,
  onSelectPage,
  onAddPage,
}: {
  profile: MonitorProfile;
  currentPageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
}) {
  const row = "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60";
  return (
    <div className="flex flex-col gap-px px-2 pb-2">
      <span className="px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.04em] text-ui-5">Pages</span>
      {profile.pages.map((page, i) => {
        const Icon = pageIcon(page.icon) ?? LayoutGrid;
        const current = page.id === currentPageId;
        return (
          <button
            key={page.id}
            type="button"
            aria-current={current ? "page" : undefined}
            onClick={() => onSelectPage(page.id)}
            className={cn(row, current ? "bg-ui-active text-ui-1" : "text-ui-3 hover:bg-ui-hover hover:text-ui-1")}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-ui-4" />
            <span className="min-w-0 flex-1 truncate">{page.name}</span>
            <span className="font-ui-mono text-[10px] text-ui-5">{i + 1}</span>
          </button>
        );
      })}
      <button type="button" onClick={onAddPage} className={cn(row, "text-ui-4 hover:bg-ui-hover hover:text-ui-1")}>
        <Plus className="h-3.5 w-3.5 shrink-0" />
        Add page
      </button>
    </div>
  );
}

/** One of the two "When the app opens" choices. */
function LaunchChoice({
  selected,
  title,
  note,
  onSelect,
}: {
  selected: boolean;
  title: string;
  note: string;
  onSelect: () => void;
}) {
  const Radio = selected ? CircleDot : Circle;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
        selected ? "border-ui-accent bg-ui-accent-soft" : "border-ui-strong hover:bg-ui-hover"
      )}
    >
      <Radio className={cn("mt-px h-4 w-4 shrink-0", selected ? "text-ui-accent-text" : "text-ui-4")} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12.5px] text-ui-1">{title}</span>
        <span className="text-pretty text-[11.5px] leading-[1.4] text-ui-4">{note}</span>
      </span>
    </button>
  );
}

/**
 * The Profiles panel. A card click selects the profile to edit (canvas, page tabs and inspector
 * follow) and lists its pages; it never changes what the app opens on. That is the footer's
 * "When the app opens", or a card's "Always open this one".
 */
export function ProfilesPanel({
  profiles,
  dashboard,
  activeProfile,
  profile,
  currentPageId,
  windowSize,
  autoProfileId,
  onSelectProfile,
  onSelectPage,
  onAddPage,
  onActivate,
  onAddProfile,
  onImportProfile,
  onDuplicateProfile,
  onRemoveProfile,
  onProfileChange,
}: ProfilesPanelProps) {
  const toast = useToast();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const auto = activeProfile === "auto";
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name ?? "—";
  // A rename belongs to the selected card: another selection ends it.
  useEffect(() => setRenamingId((id) => (id === profile.id ? id : null)), [profile.id]);
  const importProfile = (picked: MonitorProfile, skippedCanvases: number) => {
    const imported = importedProfile(dashboard, picked);
    onImportProfile(imported);
    const skipped = skippedCanvases > 0 ? ` · ${skippedCanvases} canvas ${skippedCanvases === 1 ? "zone" : "zones"} skipped (not in the file)` : "";
    toast(`Imported ${imported.name}${skipped}`);
  };
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3.5 pb-1 pt-3.5">
        <span className="text-[13px] font-semibold text-ui-1">Profiles</span>
        <span className="font-ui-mono text-[11px] text-ui-4">{profiles.length}</span>
        <span className="flex-1" />
        <button
          type="button"
          title="Import a profile from a file"
          onClick={() => startProfileImport(importRef.current, importProfile, toast)}
          className="flex h-[26px] items-center gap-1 rounded-md px-1.5 text-xs text-ui-3 hover:bg-ui-hover hover:text-ui-1"
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </button>
        <button
          type="button"
          title="New profile"
          onClick={() => {
            onAddProfile();
            toast("Profile created");
          }}
          className="flex h-[26px] items-center gap-1 rounded-md border border-ui-strong bg-ui-raised pl-1.5 pr-2.5 text-xs text-ui-1 hover:bg-ui-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>
      <p className="shrink-0 text-pretty px-3.5 pb-2.5 text-[11.5px] leading-[1.45] text-ui-4">
        One profile per screen size. Each has its own pages, grid and widgets.
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {profiles.map((p) => {
          const active = p.id === profile.id;
          return (
            <div
              key={p.id}
              className={cn("flex flex-col rounded-[9px] border", active ? "border-ui-accent bg-ui-raised" : "border-transparent")}
            >
              <div
                role="button"
                tabIndex={0}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelectProfile(p.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectProfile(p.id);
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
                  !active && "hover:bg-ui-hover"
                )}
              >
                <ProfilePreview profile={p} dashboard={dashboard} width={64} height={40} />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  {active && renamingId === p.id ? (
                    <RenameInput
                      initial={p.name}
                      onDone={(name) => {
                        setRenamingId(null);
                        if (name && name !== p.name) onProfileChange({ name });
                      }}
                    />
                  ) : (
                    <span className="block truncate text-[12.5px] font-medium leading-[1.3] text-ui-1">{p.name}</span>
                  )}
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="whitespace-nowrap font-ui-mono text-[10.5px] text-ui-4">{profileMeta(p)}</span>
                    <LaunchTag opensNow={auto && p.id === autoProfileId} onLaunch={activeProfile === p.id} size={windowSize} />
                  </span>
                </span>
                <RowMenu
                  profile={p}
                  canDelete={profiles.length > 1}
                  onRename={() => {
                    // The inline name edits the selected profile.
                    if (!active) onSelectProfile(p.id);
                    setRenamingId(p.id);
                  }}
                  onDuplicate={() => {
                    onDuplicateProfile(p.id);
                    toast(`Duplicated ${p.name}`);
                  }}
                  onAlwaysOpen={() => {
                    onActivate(p.id);
                    toast(`The app now always opens ${p.name}`);
                  }}
                  onExport={() => exportProfileFile(dashboard, p, toast)}
                  onDelete={() => setDeletingId(p.id)}
                />
              </div>
              {active && <PageList profile={p} currentPageId={currentPageId} onSelectPage={onSelectPage} onAddPage={onAddPage} />}
            </div>
          );
        })}
      </div>
      <div role="radiogroup" aria-label="When the app opens" className="flex shrink-0 flex-col gap-2 border-t border-ui-subtle p-3.5">
        <span className="text-xs font-semibold text-ui-1">When the app opens</span>
        <LaunchChoice
          selected={auto}
          title="Best fit for the window"
          note={`Picks the closest size. This ${windowSize.width} × ${windowSize.height} window opens ${nameOf(autoProfileId)}.`}
          onSelect={() => onActivate("auto")}
        />
        <LaunchChoice
          selected={!auto}
          title="Always the same profile"
          note={auto ? "Ignore the window size." : `Opens ${nameOf(activeProfile)}. Change it from a profile's ⋯ menu.`}
          onSelect={() => auto && onActivate(profile.id)}
        />
      </div>
      <DeleteDialog
        profile={profiles.find((p) => p.id === deletingId)}
        onConfirm={() => deletingId && onRemoveProfile(deletingId)}
        onClose={() => setDeletingId(null)}
      />
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importProfileFile(file, importProfile, toast);
          e.target.value = "";
        }}
      />
    </>
  );
}
