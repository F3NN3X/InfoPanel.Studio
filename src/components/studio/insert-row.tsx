import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { LayoutDashboard, MoreHorizontal, PanelsTopLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS } from "./menu-styles";
import type { Insertable } from "./insert-panel";
import { DND_MIME, DND_MIME_PANEL } from "./studio-modules";
import { iconFor } from "@/widgets/core/icons";
import { moduleIcon } from "./zone-icons";

export type InsertContext = "drawer" | "picker";

/** Rename / delete for a saved panel's card. */
export interface SavedPanelActions {
  onRename: (name: string) => void;
  onDelete: () => void;
}

const MENU_POPUP =
  "min-w-36 rounded-ui-menu border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
const MENU_ITEM =
  "flex h-[30px] cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-highlighted:bg-ui-active data-highlighted:text-ui-1 data-highlighted:shadow-[inset_2px_0_0_var(--ui-accent)]";

/** The inline name input of a saved panel being renamed. */
export function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(initial);
  const commit = () => onDone(name.trim() || null);
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={commit}
      aria-label="Panel name"
      className="min-w-0 flex-1 rounded border border-ui-strong bg-ui-app px-1.5 py-0.5 text-xs text-ui-1 outline-none focus:border-ui-accent"
    />
  );
}

/** The "⋯" menu of a saved panel's card. */
export function SavedPanelMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        onClick={(e) => e.stopPropagation()}
        className="rounded p-0.5 text-ui-4 hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
        title="Saved panel actions"
        aria-label="Saved panel actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={MENU_POPUP} onClick={(e) => e.stopPropagation()}>
            <Menu.Item className={MENU_ITEM} onClick={onRename}>
              Rename…
            </Menu.Item>
            <Menu.Item className={cn(MENU_ITEM, "text-ui-danger")} onClick={onDelete}>
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** A card's icon: the widget's own, or the layout / panel glyph. */
function cardIcon(item: Insertable) {
  if (item.kind === "module") return item.icon ? iconFor(item.icon) : moduleIcon(item.id);
  return item.category === "Layouts" ? LayoutDashboard : PanelsTopLeft;
}

/** The card's second line: widgets end it with "· min W×H". */
export function describe(item: Insertable): string {
  if (item.kind !== "module") return item.description ?? "";
  return `${item.description ?? "Widget"} · min ${item.cols}×${item.rows}`;
}

/** One library card: icon, drop size, name, description (and "⋯" for saved panels). */
export function InsertRow({
  item,
  size,
  context,
  onPick,
  saved,
}: {
  item: Insertable;
  /** The size shown on the card: what it drops with (drawer), or its minimum (picker). */
  size: { cols: number; rows: number };
  context: InsertContext;
  onPick: () => void;
  /** Set for the user's saved panels. */
  saved?: SavedPanelActions;
}) {
  const [renaming, setRenaming] = useState(false);
  const Icon = cardIcon(item);
  const draggable = context === "drawer" && !renaming;
  const hint = context === "drawer" ? "Drag onto the canvas, or click to add" : "Click to use it for this space";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(item.kind === "panel" ? DND_MIME_PANEL : DND_MIME, item.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={renaming ? undefined : onPick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPick();
        }
      }}
      title={item.description ? `${item.description} — ${hint.toLowerCase()}` : hint}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border border-ui-default bg-ui-tile p-2.5 text-left",
        "transition-colors hover:border-ui-accent hover:bg-s-nav-hover focus-visible:border-ui-accent",
        FOCUS,
        draggable && "active:cursor-grabbing"
      )}
    >
      <div className="flex items-center justify-between gap-1 text-ui-2">
        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
        <span className="flex items-center gap-1.5 font-ui-mono text-[10px] text-ui-hint">
          {size.cols}×{size.rows}
          {saved && <SavedPanelMenu onRename={() => setRenaming(true)} onDelete={saved.onDelete} />}
        </span>
      </div>
      {renaming && saved ? (
        <RenameInput
          initial={item.title}
          onDone={(name) => {
            setRenaming(false);
            if (name && name !== item.title) saved.onRename(name);
          }}
        />
      ) : (
        <span className="break-words text-xs font-medium text-ui-1">{item.title}</span>
      )}
      <span className="text-micro leading-[1.35] text-ui-hint">{describe(item)}</span>
    </div>
  );
}
