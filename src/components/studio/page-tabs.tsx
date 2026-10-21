import { Fragment, useEffect, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { Ban, Copy, MoreHorizontal, Monitor, MonitorPlay, Palette, Pencil, Plus, RefreshCw, Shapes, Trash2, X } from "lucide-react";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import { IconButton } from "@/components/ui/icon-button";
import { IconGrid } from "@/components/ui/icon-grid";
import type { ProfilePage } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { PAGE_ICONS, pageIcon } from "./page-icons";
import { pastDragThreshold, trackPointer } from "./pointer-drag";
import { RenameInput } from "./profiles-panel";
import { RotateToggle } from "./rotate-toggle";

interface PageTabsProps {
  pages: ProfilePage[];
  /** The page on the canvas. */
  current: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  /** Drop a page at this index of the list without it (one undo step). */
  onMove: (id: string, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  /** Delete, after the confirm dialog. */
  onDelete: (id: string) => void;
  onIcon: (id: string, icon: string | undefined) => void;
  /** The page's settings › Theme: the theme editor at this page's scope. */
  onTheme?: (id: string) => void;
  /** The page being renamed inline (the palette asks for this too). */
  renamingId: string | null;
  onRenamingChange: (id: string | null) => void;
  /** The page the delete confirm is open for. */
  deletingId: string | null;
  onDeletingChange: (id: string | null) => void;
  /** The page the kiosk shows for this profile (the control channel); unset while offline. */
  kioskPage?: string | null;
  /** Send the kiosk to a page. */
  onShowOnKiosk?: (id: string) => void;
  /** The auto-rotate toggle, shown with 2+ pages. */
  rotate?: { entry: ComponentProps<typeof RotateToggle>["entry"]; saved: boolean; onToggle: () => void; onSaved: () => void };
  /** The profile's auto-rotate interval in seconds while it is on; shown as "Cycling every …". */
  cycleSeconds?: number;
}

/** An interval for the tab strip: `30 s`, then minutes from 60 s (`1 min`, `1.5 min`). */
export function cycleLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Number((seconds / 60).toFixed(1))} min`;
}

/**
 * Where a page dropped at pointer `x` lands in the list without it: the
 * number of the other tabs whose middle is left of the pointer.
 */
export function dropIndex(rects: { left: number; width: number }[], from: number, x: number): number {
  return rects.filter((r, i) => i !== from && r.left + r.width / 2 < x).length;
}

/** The rows of a page's menu; Delete is off on the only page. */
export function pageMenuEntries(
  pages: ProfilePage[],
  actions: {
    rename: () => void;
    icon: () => void;
    theme?: () => void;
    duplicate: () => void;
    remove: () => void;
    showOnKiosk?: () => void;
  }
): ContextMenuEntry[] {
  return [
    { id: "rename", label: "Rename", icon: <Pencil />, onSelect: actions.rename },
    { id: "icon", label: "Icon…", icon: <Shapes />, onSelect: actions.icon },
    ...(actions.theme ? [{ id: "theme", label: "Theme…", icon: <Palette />, onSelect: actions.theme }] : []),
    { id: "duplicate", label: "Duplicate", icon: <Copy />, onSelect: actions.duplicate },
    ...(actions.showOnKiosk ? [{ id: "kiosk", label: "Show on kiosk", icon: <MonitorPlay />, onSelect: actions.showOnKiosk }] : []),
    "separator",
    { id: "delete", label: "Delete", icon: <Trash2 />, danger: true, disabled: pages.length <= 1, onSelect: actions.remove },
  ];
}

/** The icon picker: a searchable grid of the page icons, and None. */
function IconDialog({
  page,
  onPick,
  onClose,
}: {
  page: ProfilePage | undefined;
  onPick: (icon: string | undefined) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [page?.id]);
  const q = query.trim().toLowerCase();
  const icons = [
    { id: "", label: "None", icon: <Ban /> },
    ...Object.entries(PAGE_ICONS)
      .filter(([name]) => name.includes(q))
      .map(([name, Icon]) => ({ id: name, label: name, icon: <Icon /> })),
  ];
  return (
    <Dialog.Root open={page !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[22rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-tile p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <div className="flex items-center">
            <Dialog.Title className="flex-1 text-sm font-semibold">Icon for {page?.name}</Dialog.Title>
            <Dialog.Close title="Close (Esc)" className="text-ui-3 transition-colors hover:text-ui-1">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons"
            aria-label="Search icons"
            className="h-[30px] w-full rounded-md border border-ui-strong bg-ui-app px-2 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent"
          />
          <div className="max-h-64 overflow-y-auto">
            <IconGrid
              label="Page icon"
              columns={8}
              icons={icons}
              value={page?.icon ?? ""}
              onChange={(id) => {
                onPick(id || undefined);
                onClose();
              }}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

/** Confirm deleting a page and its zones. */
function DeleteDialog({
  page,
  onConfirm,
  onClose,
}: {
  page: ProfilePage | undefined;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const n = page?.placements.length ?? 0;
  return (
    <AlertDialog.Root open={page !== undefined} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[24rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Delete {page?.name}?</AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-ui-3">
            {n === 0 ? "This page is empty." : `This removes the page and its ${n} ${n === 1 ? "zone" : "zones"}.`} Undo
            (Ctrl+Z) brings it back.
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
              Delete page
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * The strip above the canvas: one tab per page of the profile (click to
 * switch, double-click to rename, drag to reorder), "+" to add one, and a
 * "⋯" / right-click menu for rename, icon, duplicate and delete.
 */
export function PageTabs({
  pages,
  current,
  onSelect,
  onAdd,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
  onIcon,
  onTheme,
  renamingId,
  onRenamingChange,
  deletingId,
  onDeletingChange,
  kioskPage,
  onShowOnKiosk,
  rotate,
  cycleSeconds,
}: PageTabsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [iconFor, setIconFor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  // A drag ends in a click on the tab; it must not switch pages.
  const dragged = useRef(false);
  const stopDrag = useRef<() => void>(undefined);
  useEffect(() => () => stopDrag.current?.(), []);

  const startDrag = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || renamingId !== null) return;
    const from = pages.findIndex((p) => p.id === id);
    const { clientX: x0, clientY: y0 } = e;
    let started = false;
    let to = from;
    stopDrag.current = trackPointer(
      (ev) => {
        if (!started && !pastDragThreshold(ev.clientX - x0, ev.clientY - y0)) return;
        started = true;
        const tabs = rowRef.current?.querySelectorAll("[data-page-tab]") ?? [];
        to = dropIndex([...tabs].map((t) => t.getBoundingClientRect()), from, ev.clientX);
        setDrag({ id, to });
      },
      (cancelled) => {
        setDrag(null);
        if (!started) return;
        dragged.current = true;
        setTimeout(() => (dragged.current = false), 0);
        if (!cancelled && to !== from) onMove(id, to);
      }
    );
  };

  const openMenu = (id: string, x: number, y: number) => setMenu({ id, x, y });
  const menuEntries = (id: string) =>
    pageMenuEntries(pages, {
      rename: () => onRenamingChange(id),
      icon: () => setIconFor(id),
      theme: onTheme && (() => onTheme(id)),
      duplicate: () => onDuplicate(id),
      remove: () => onDeletingChange(id),
      showOnKiosk: onShowOnKiosk && (() => onShowOnKiosk(id)),
    });

  // The slot the dragged tab would drop into, among the tabs without it.
  const others = drag ? pages.filter((p) => p.id !== drag.id) : pages;
  const marker = <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-ui-accent" />;

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-ui-subtle bg-ui-panel px-2 font-ui text-[12px]">
      <div ref={rowRef} role="tablist" aria-label="Pages" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {pages.map((page) => {
          const Icon = pageIcon(page.icon);
          const active = page.id === current;
          return (
            <Fragment key={page.id}>
              {drag && others.findIndex((p) => p.id === page.id) === drag.to && marker}
              <div
                data-page-tab
                onPointerDown={(e) => startDrag(e, page.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(page.id, e.clientX, e.clientY);
                }}
                className={cn(
                  "group flex h-7 shrink-0 items-center rounded-md transition-colors",
                  active ? "bg-ui-active text-ui-1" : "text-ui-3 hover:bg-ui-hover hover:text-ui-1",
                  drag?.id === page.id && "opacity-50"
                )}
              >
                {renamingId === page.id ? (
                  <span className="w-36 px-1">
                    <RenameInput
                      label="Page name"
                      initial={page.name}
                      onDone={(name) => {
                        onRenamingChange(null);
                        if (name && name !== page.name) onRename(page.id, name);
                      }}
                    />
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => !dragged.current && onSelect(page.id)}
                      onDoubleClick={() => onRenamingChange(page.id)}
                      title="Double-click to rename, drag to reorder"
                      className="flex h-7 max-w-44 items-center gap-1.5 rounded-md pl-2.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{page.name}</span>
                      {kioskPage === page.id && (
                        <Monitor aria-label="Shown on the kiosk" className="h-3 w-3 shrink-0 text-ui-accent-text">
                          <title>Shown on the kiosk</title>
                        </Monitor>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Page actions for ${page.name}`}
                      title="Page actions"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenu(page.id, r.left, r.bottom + 4);
                      }}
                      // Faded out until the tab is hovered or focused; the space stays so tabs do not jump.
                      className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ui-4 opacity-0 hover:bg-ui-hover hover:text-ui-1 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </Fragment>
          );
        })}
        {drag && drag.to === others.length && marker}
      </div>
      <IconButton label="Add page" className="h-7 w-7" onClick={onAdd}>
        <Plus className="h-4 w-4" />
      </IconButton>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {cycleSeconds !== undefined && (
          <span className="flex items-center gap-1 whitespace-nowrap text-[11.5px] text-ui-4">
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            Cycling every {cycleLabel(cycleSeconds)}
          </span>
        )}
        {rotate && pages.length >= 2 && <RotateToggle {...rotate} />}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries(menu.id)} onClose={() => setMenu(null)} />}
      <IconDialog
        page={pages.find((p) => p.id === iconFor)}
        onPick={(icon) => iconFor && onIcon(iconFor, icon)}
        onClose={() => setIconFor(null)}
      />
      <DeleteDialog
        page={pages.find((p) => p.id === deletingId)}
        onConfirm={() => deletingId && onDelete(deletingId)}
        onClose={() => onDeletingChange(null)}
      />
    </div>
  );
}
