import { useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Menu } from "@base-ui/react/menu";
import { Circle, CircleDot, Copy, MoreHorizontal, Pencil, Plus, Rocket, Share, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { ITEM, POPUP, SEPARATOR } from "./menu-styles";
import { openExportSheet, openImportDoor } from "./file-doors";
import { ProfilePreview } from "./profile-preview";
import { RenameInput } from "./rename-input";
import { ScreenDetail } from "./screen-detail";
import { launchRule, launchTag, screenMeta, withLaunch, type LaunchTag } from "./screens-model";

type DetailProps = Parameters<typeof ScreenDetail>[0];

interface ScreensViewProps
  extends Pick<
    DetailProps,
    "config" | "profile" | "windowSize" | "updateProfile" | "setConfig" | "onRotate" | "onPerformance" | "onMovePage" | "onAddPage" | "onOpenPage" | "onOpenLive" | "navigateTo"
  > {
  /** The screen "Best fit" resolves to for the current window. */
  autoProfileId: string;
  /** Select a screen for editing (never changes what the app opens on). */
  onSelectProfile: (id: string) => void;
  onAddProfile: () => void;
  onDuplicateProfile: (id: string) => void;
  /** Delete a screen (after the confirm dialog). */
  onRemoveProfile: (id: string) => void;
}

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-transparent px-2.5 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover";
const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

/** The card's rarely used actions. */
function CardMenu({
  canDelete,
  onRename,
  onDuplicate,
  onAlwaysOpen,
  onExport,
  onDelete,
}: {
  /** Any screen but the last one can be deleted. */
  canDelete: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onAlwaysOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  // Rename hands the cursor to the card's name field: the menu must not take it back.
  const renaming = useRef(false);
  return (
    <Menu.Root>
      <Menu.Trigger
        onClick={(e) => e.stopPropagation()}
        title="Screen actions"
        aria-label="Screen actions"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-active hover:text-ui-1 data-popup-open:bg-ui-active data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup
            className={POPUP}
            onClick={(e) => e.stopPropagation()}
            finalFocus={() => {
              const skip = renaming.current;
              renaming.current = false;
              return !skip;
            }}
          >
            <Menu.Item
              className={ITEM}
              onClick={() => {
                renaming.current = true;
                onRename();
              }}
            >
              <span className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5 text-ui-3" />
                Rename
              </span>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onDuplicate}>
              <span className="flex items-center gap-2">
                <Copy className="h-3.5 w-3.5 text-ui-3" />
                Duplicate
              </span>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onAlwaysOpen}>
              <span className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-ui-3" />
                Always open this one
              </span>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onExport}>
              <span className="flex items-center gap-2">
                <Share className="h-3.5 w-3.5 text-ui-3" />
                Export screen
              </span>
            </Menu.Item>
            <Menu.Separator className={SEPARATOR} />
            <Menu.Item className={cn(ITEM, "text-ui-danger data-disabled:text-ui-5")} disabled={!canDelete} onClick={onDelete}>
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Confirm deleting a screen with its pages and zones. */
function DeleteDialog({ screen, onConfirm, onClose }: { screen: MonitorProfile | undefined; onConfirm: () => void; onClose: () => void }) {
  const n = screen?.pages.length ?? 0;
  return (
    <AlertDialog.Root open={screen !== undefined} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[24rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Delete {screen?.name}?</AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-ui-3">
            This removes the screen and its {n === 1 ? "page" : `${n} pages`}. Undo (Ctrl+Z) brings it back.
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
              Delete screen
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** One of the two "When the app opens" choices. */
function LaunchChoice({
  selected,
  title,
  note,
  onSelect,
  children,
}: {
  selected: boolean;
  title: string;
  note: string;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  const Radio = selected ? CircleDot : Circle;
  return (
    <div
      className={cn(
        "flex min-w-[220px] flex-1 items-start gap-2.5 rounded-lg border px-3 py-2.5",
        selected ? "border-ui-accent/50 bg-ui-accent-soft" : "border-ui-strong"
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={title}
        onClick={onSelect}
        className="mt-px rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
      >
        <Radio className={cn("h-[18px] w-[18px]", selected ? "text-ui-accent-text" : "text-ui-4")} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button type="button" onClick={onSelect} className="self-start text-left text-[12.5px] font-medium text-ui-1 outline-none">
          {title}
        </button>
        <span className="text-pretty text-[11.5px] leading-[1.4] text-ui-4">{note}</span>
        {children}
      </div>
    </div>
  );
}

const TAGS: Record<LaunchTag, { text: string; title: string }> = {
  "best-fit": { text: "Best fit now", title: "Closest to the studio window's size" },
  launch: { text: "Opens on launch", title: "The app opens on this screen whatever the window size" },
};

/** The thumbnail box: the screen's aspect inside the 110 px well. */
function thumbBox(p: MonitorProfile): { width: number; height: number } {
  const ratio = p.width / p.height;
  const width = Math.round(Math.min(190, 94 * ratio));
  return { width, height: Math.max(20, Math.round(width / ratio)) };
}

/**
 * Screens (SPEC §8): the launch rule ("When the app opens", `config.activeProfile`), a card per screen (a click
 * selects it for editing, which is what the canvas, page tabs and Design follow; it never changes what the app
 * opens on) and the selected screen's detail panel.
 */
export function ScreensView({
  config,
  profile,
  windowSize,
  autoProfileId,
  onSelectProfile,
  onAddProfile,
  onDuplicateProfile,
  onRemoveProfile,
  ...detail
}: ScreensViewProps) {
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const { setConfig } = detail;
  const rule = launchRule(config);
  const nameOf = (id: string) => config.profiles.find((p) => p.id === id)?.name ?? "—";
  const stored = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];
  const open = (id: string) => setConfig((c) => withLaunch(c, id));
  const rename = (id: string, name: string | null) => {
    setRenamingId(null);
    if (name) setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === id ? { ...p, name } : p)) }), `profile-name:${id}`);
  };
  return (
    <div className="flex min-h-0 flex-1 bg-ui-app/40 font-ui">
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-auto px-6 py-5">
        <div className="flex items-center gap-2.5">
          <h1 className="m-0 flex-1 text-[15px] font-semibold text-ui-1">Screens</h1>
          <button type="button" title="Import a screen from a file" onClick={() => openImportDoor()} className={BUTTON}>
            <Upload className="h-3.5 w-3.5" />
            Import a screen…
          </button>
          <button
            type="button"
            onClick={() => {
              onAddProfile();
              toast("Screen created");
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-ui-1 px-3 text-[12px] font-semibold text-ui-inverse-fg hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New screen
          </button>
        </div>

        <div role="radiogroup" aria-label="When the app opens" className="flex flex-col gap-2 rounded-[10px] border border-ui-default bg-ui-panel p-3.5">
          <span className="text-[13px] font-medium text-ui-1">When the app opens</span>
          <div className="flex flex-wrap gap-2">
            <LaunchChoice
              selected={rule === "auto"}
              title="Best fit for the window"
              note={`Picks the screen whose size matches the kiosk window. This ${windowSize.width} × ${windowSize.height} window opens ${nameOf(autoProfileId)}.`}
              onSelect={() => open("auto")}
            />
            <LaunchChoice
              selected={rule === "fixed"}
              title="Always the same screen"
              note={rule === "fixed" ? `Always open ${nameOf(config.activeProfile)}` : "Ignore the window size."}
              onSelect={() => rule === "auto" && open(stored.id)}
            >
              {rule === "fixed" && (
                <select
                  aria-label="Screen to open"
                  value={config.activeProfile}
                  onChange={(e) => open(e.target.value)}
                  className="mt-1.5 h-7 max-w-[200px] cursor-pointer rounded-md border border-ui-strong bg-ui-hover px-1.5 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
                >
                  {config.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </LaunchChoice>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {config.profiles.map((p) => {
            const selected = p.id === stored.id;
            const tag = launchTag(config, p.id, autoProfileId);
            const box = thumbBox(p);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelectProfile(p.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectProfile(p.id);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col gap-2.5 rounded-[10px] border bg-ui-panel p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-accent/60",
                  selected ? "border-ui-1 ring-1 ring-ui-1" : "border-ui-default hover:border-ui-strong"
                )}
              >
                <div className="grid h-[110px] place-items-center rounded-md bg-[#0b0b0d]">
                  <ProfilePreview profile={p} dashboard={config} width={box.width} height={box.height} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-ui-1">
                    {renamingId === p.id ? <RenameInput initial={p.name} onDone={(name) => rename(p.id, name)} /> : <span className="block truncate">{p.name}</span>}
                  </span>
                  {tag && (
                    <span
                      title={TAGS[tag].title}
                      className="flex h-[18px] items-center whitespace-nowrap rounded px-1.5 text-[10.5px] bg-[oklch(0.78_0.15_150/0.14)] text-[oklch(0.88_0.10_150)]"
                    >
                      {TAGS[tag].text}
                    </span>
                  )}
                  <CardMenu
                    canDelete={config.profiles.length > 1}
                    onRename={() => setRenamingId(p.id)}
                    onDuplicate={() => {
                      onDuplicateProfile(p.id);
                      toast(`Duplicated ${p.name}`);
                    }}
                    onAlwaysOpen={() => {
                      open(p.id);
                      toast(`The app now always opens ${p.name}`);
                    }}
                    onExport={() => openExportSheet({ row: "screen", screenId: p.id })}
                    onDelete={() => setDeletingId(p.id)}
                  />
                </div>
                <span className="font-ui-mono text-[11px] text-ui-4">{screenMeta(p)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ScreenDetail config={config} profile={profile} stored={stored} windowSize={windowSize} {...detail} />

      <DeleteDialog
        screen={config.profiles.find((p) => p.id === deletingId)}
        onConfirm={() => deletingId && onRemoveProfile(deletingId)}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
