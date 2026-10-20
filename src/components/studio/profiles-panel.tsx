import { useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Menu } from "@base-ui/react/menu";
import { Check, MoreHorizontal, Pin, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { copyProfileJson } from "./config-file";
import { ProfilePreview } from "./profile-preview";

interface ProfilesPanelProps {
  profiles: MonitorProfile[];
  /** The dashboard, which the previews inherit from where a profile sets none. */
  dashboard: DashboardConfig;
  /** The config's activeProfile: a pinned id, or "auto". */
  activeProfile: string;
  /** The profile displays show: the active one, or what "auto" resolves to for the window. */
  displayedId: string;
  /** The profile being edited (the pinned one, else the one displays show). */
  profile: MonitorProfile;
  /** The profile pinned for editing, if any. */
  pinnedId: string | undefined;
  /** Pin a profile for editing, or unpin with undefined. */
  onPin: (id: string | undefined) => void;
  /** The profile "auto" resolves to for the current window size. */
  autoProfileId: string;
  /** Switch what displays show to a profile id, or "auto" to match the window size. */
  onActivate: (id: string) => void;
  /** Edit a profile: displays follow unless the studio is pinned, which then moves to it. */
  onEdit: (id: string) => void;
  onAddProfile: () => void;
  /** Delete a profile (after the confirm dialog). */
  onRemoveProfile: (id: string) => void;
  /** Patch the active profile's own fields (name). */
  onProfileChange: (patch: Partial<MonitorProfile>) => void;
  /** Open Dashboard › Profile (size, grid, spacing, theme, style, background). */
  onOpenSettings: () => void;
}

const MENU_POPUP =
  "min-w-44 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const MENU_ITEM =
  "flex h-[30px] cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-highlighted:bg-ui-hover";

/** The meta line of a row: `1920×550 · 12×6 · Fill`, with `· 3 pages` when there are several. */
export function profileMeta(p: MonitorProfile): string {
  const pages = p.pages.length > 1 ? ` · ${p.pages.length} pages` : "";
  return `${p.width}×${p.height} · ${p.cols}×${p.rows} · ${p.fit === "fill" ? "Fill" : "Scroll"}${pages}`;
}

/** The row's rarely used actions. */
function RowMenu({
  profile,
  canDelete,
  onRename,
  onSettings,
  onDelete,
}: {
  profile: MonitorProfile;
  /** Any profile but the last one can be deleted. */
  canDelete: boolean;
  onRename: () => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  return (
    <Menu.Root>
      <Menu.Trigger
        onClick={(e) => e.stopPropagation()}
        title="Profile actions"
        aria-label="Profile actions"
        // Out of sight until the row is hovered or focused, so the meta line keeps its width.
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-active hover:text-ui-1 focus-visible:flex group-focus-within:flex group-hover:flex data-popup-open:flex data-popup-open:bg-ui-active data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={MENU_POPUP} onClick={(e) => e.stopPropagation()}>
            <Menu.Item className={MENU_ITEM} onClick={onRename}>
              Rename…
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={onSettings}>
              Size, grid and spacing…
            </Menu.Item>
            <Menu.Item
              className={MENU_ITEM}
              onClick={() =>
                copyProfileJson(profile)
                  .then(() => toast("Copied to clipboard"))
                  .catch(() => {})
              }
            >
              Copy profile JSON
            </Menu.Item>
            {canDelete && (
              <Menu.Item className={cn(MENU_ITEM, "text-ui-danger")} onClick={onDelete}>
                Delete profile
              </Menu.Item>
            )}
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

/**
 * The Profiles panel: pick a profile, add one, rename / delete / jump to its
 * settings from a row's "⋯", and switch Auto-pick.
 */
export function ProfilesPanel({
  profiles,
  dashboard,
  activeProfile,
  displayedId,
  profile,
  pinnedId,
  onPin,
  autoProfileId,
  onActivate,
  onEdit,
  onAddProfile,
  onRemoveProfile,
  onProfileChange,
  onOpenSettings,
}: ProfilesPanelProps) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const auto = activeProfile === "auto";
  const autoName = profiles.find((p) => p.id === autoProfileId)?.name ?? "—";
  const displayedName = profiles.find((p) => p.id === displayedId)?.name ?? "—";
  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-3.5 pb-2.5 pt-3.5">
        <span className="text-[13px] font-semibold text-ui-1">Profiles</span>
        <IconButton
          label="New profile"
          className="h-[26px] w-[26px] rounded-md border border-ui-strong bg-ui-raised text-ui-1 hover:bg-[#1e1e23]"
          onClick={() => {
            onAddProfile();
            toast("Profile created");
          }}
        >
          <Plus className="h-[18px] w-[18px]" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {profiles.map((p) => {
          const active = p.id === profile.id;
          const shown = p.id === displayedId;
          const pinned = p.id === pinnedId;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onActivate(p.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onActivate(p.id);
                }
              }}
              className={cn(
                "group flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
                active ? "border-ui-accent bg-[oklch(0.72_0.15_255/0.12)]" : "border-transparent hover:bg-ui-hover"
              )}
            >
              <ProfilePreview profile={p} dashboard={dashboard} height={140} />
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  {active && renaming ? (
                    <RenameInput
                      initial={p.name}
                      onDone={(name) => {
                        setRenaming(false);
                        if (name && name !== p.name) onProfileChange({ name });
                      }}
                    />
                  ) : (
                    <span className="block truncate text-[12.5px] leading-[1.35] text-ui-1">{p.name}</span>
                  )}
                  <span className="block truncate font-ui-mono text-[10.5px] leading-[1.35] text-ui-4">{profileMeta(p)}</span>
                </span>
                <button
                  type="button"
                  aria-pressed={pinned}
                  aria-label={pinned ? "Unpin" : "Pin for editing"}
                  title={
                    pinned
                      ? "Unpin: the studio edits what displays show again"
                      : `Pin for editing: the studio edits this profile while displays keep showing ${displayedName}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(pinned ? undefined : p.id);
                  }}
                  // Out of sight until the row is hovered or focused, unless it is the pinned one.
                  className={cn(
                    "h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-ui-active hover:text-ui-1 focus-visible:flex group-focus-within:flex group-hover:flex",
                    pinned ? "flex text-[oklch(0.80_0.12_255)]" : "hidden text-ui-4"
                  )}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                {shown && (
                  <Check
                    className="h-[17px] w-[17px] shrink-0 text-[oklch(0.80_0.12_255)]"
                    aria-label="Shown on displays"
                  />
                )}
                <RowMenu
                  profile={p}
                  canDelete={profiles.length > 1}
                  onRename={() => {
                    if (!active) onEdit(p.id);
                    setRenaming(true);
                  }}
                  onSettings={() => {
                    if (!active) onEdit(p.id);
                    onOpenSettings();
                  }}
                  onDelete={() => setDeletingId(p.id)}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 space-y-2 border-t border-ui-subtle px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-ui-2">Auto-pick by window size</span>
          <Toggle
            checked={auto}
            label="Auto-pick by window size"
            onChange={(on) => onActivate(on ? "auto" : displayedId)}
          />
        </div>
        <p className="text-pretty text-[11.5px] leading-[1.45] text-[#7c7c86]">
          {auto ? "Showing" : "Would show"} {autoName}. Each profile has its own size, grid, zones, theme, style and
          background.
        </p>
      </div>
      <DeleteDialog
        profile={profiles.find((p) => p.id === deletingId)}
        onConfirm={() => deletingId && onRemoveProfile(deletingId)}
        onClose={() => setDeletingId(null)}
      />
    </>
  );
}
