import { useState, type DragEvent, type ReactNode } from "react";
import {
  Bookmark,
  ChartColumn,
  ChartLine,
  Clock,
  Gauge,
  Image,
  LayoutDashboard,
  PanelsTopLeft,
  Pin,
  Rows3,
  SquareDashed,
  SquarePlus,
  StickyNote,
  Type,
  type LucideIcon,
} from "lucide-react";
import { BLANK_MODULE } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { iconFor } from "@/widgets/core/icons";
import { sizeText, type AddItem } from "./add-catalog";
import { RenameInput, SavedPanelMenu } from "./insert-row";
import { DND_MIME, DND_MIME_PANEL, DND_MIME_SETTINGS } from "./studio-modules";

/** One row of the Add list (handoff SPEC §4.6): icon tile, name, blurb, optional tag, size footprint. */

/** A panel or layout item kind's glyph in the schematic. */
const PART_ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  stat: Pin,
  value: StickyNote,
  sparkline: ChartLine,
  bar: ChartColumn,
  text: Type,
  clock: Clock,
  table: Rows3,
  image: Image,
};

export function PartIcon({ kind }: { kind: string }) {
  const Icon = PART_ICONS[kind] ?? StickyNote;
  return <Icon className="h-4 w-4 shrink-0 text-ui-soft" strokeWidth={1.75} />;
}

function itemIcon(item: AddItem): LucideIcon {
  if (item.kind === "widget") return iconFor(item.icon);
  if (item.id === BLANK_MODULE) return SquareDashed;
  if (item.kind === "layout") return LayoutDashboard;
  if (item.saved) return Bookmark;
  return item.id === "blank" ? SquarePlus : PanelsTopLeft;
}

/** The item's icon tile (`size` px square; the glyph is 18 px, larger on a big tile). */
export function AddItemIcon({ item, size }: { item: AddItem; size: number }) {
  const Icon = itemIcon(item);
  const glyph = size >= 40 ? 22 : 18;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-ui-md border border-ui-default bg-ui-raised text-ui-2"
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: glyph, height: glyph }} strokeWidth={1.6} />
    </span>
  );
}

/** The footprint's tooltip. */
export function footprintTitle(item: AddItem): string {
  const at = `Opens at ${sizeText(item.w, item.h)}`;
  return item.mw > 1 || item.mh > 1 ? `${at}, needs at least ${sizeText(item.mw, item.mh)}` : `${at}, shrinks to 1×1`;
}

/** W×H cells (5 px, smaller for big sizes so the grid stays in its column) over the size. */
function Footprint({ item, on, compact }: { item: AddItem; on: boolean; compact: boolean }) {
  const gap = 1.5;
  const cell = Math.min(5, (44 - gap * (item.w - 1)) / item.w, ((compact ? 16 : 22) - gap * (item.h - 1)) / item.h);
  return (
    <span title={footprintTitle(item)} className="flex w-11 shrink-0 flex-col items-end gap-0.5">
      <span className="grid" style={{ gridTemplateColumns: `repeat(${item.w}, ${cell}px)`, gap }} aria-hidden>
        {Array.from({ length: item.w * item.h }, (_, i) => (
          <span key={i} className="rounded-[1px]" style={{ width: cell, height: cell, background: on ? "#a1a1aa" : "#4a4a53" }} />
        ))}
      </span>
      <span className="font-ui-mono text-[10px] leading-3 text-ui-hint">{sizeText(item.w, item.h)}</span>
    </span>
  );
}

export type RowTag = "best" | { needs: string };

interface AddRowProps {
  item: AddItem;
  /** DOM id (the search box's active descendant). */
  id: string;
  highlighted: boolean;
  compact: boolean;
  /** With a target: Best fit, or Needs W×H (the row dims). */
  tag?: RowTag;
  onPick: () => void;
  /** The pointer entered the row. */
  onHover: () => void;
  onDragStart: () => void;
  /** A saved panel's rename and delete. */
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** On a screen made for InfoPanel: what an export makes of it (its Export check icon). */
  status?: ReactNode;
}

export function AddRow({ item, id, highlighted, compact, tag, onPick, onHover, onDragStart, onRename, onDelete, status }: AddRowProps) {
  const [renaming, setRenaming] = useState(false);
  const needs = typeof tag === "object" ? tag.needs : undefined;
  const label = `${item.name}, ${item.blurb}, ${sizeText(item.w, item.h)}${tag === "best" ? ", best fit" : needs ? `, needs at least ${needs}` : ""}`;
  const start = (e: DragEvent) => {
    e.dataTransfer.setData(item.drop.kind === "panel" ? DND_MIME_PANEL : DND_MIME, item.drop.id);
    if (item.drop.settings) e.dataTransfer.setData(DND_MIME_SETTINGS, JSON.stringify(item.drop.settings));
    e.dataTransfer.effectAllowed = "copy";
    onDragStart();
  };
  return (
    <div
      id={id}
      role="option"
      aria-selected={highlighted}
      aria-label={label}
      aria-describedby={`${id}-desc`}
      draggable={!renaming}
      onDragStart={start}
      onClick={renaming ? undefined : onPick}
      onMouseEnter={onHover}
      className={cn(
        "group/row flex cursor-pointer select-none items-center gap-2.5 rounded-ui-md px-2",
        compact ? "h-10 py-[5px]" : "h-[52px] py-[7px]",
        highlighted && "bg-s-divider"
      )}
    >
      <span className={cn("flex shrink-0", needs && "opacity-40")}>
        <AddItemIcon item={item} size={compact ? 28 : 34} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {renaming && onRename ? (
          <RenameInput
            initial={item.name}
            onDone={(name) => {
              setRenaming(false);
              if (name && name !== item.name) onRename(name);
            }}
          />
        ) : (
          <span className="truncate text-[12.5px] font-medium leading-4 text-ui-1">{item.name}</span>
        )}
        {!compact && <span className="mt-0.5 truncate text-[11.5px] leading-[15px] text-ui-hint">{item.blurb}</span>}
        <span id={`${id}-desc`} className="sr-only">
          {item.description}
        </span>
      </span>
      {tag && (
        <span
          className={cn(
            "shrink-0 rounded-[4px] px-1.5 py-0.5 text-micro",
            tag === "best" ? "bg-[oklch(0.72_0.15_255/0.16)] text-[oklch(0.85_0.10_255)]" : "bg-ui-subtle text-ui-hint"
          )}
        >
          {tag === "best" ? "Best fit" : `Needs ${needs}`}
        </span>
      )}
      {onRename && onDelete && !renaming && (
        <span className={cn("shrink-0", !highlighted && "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100")}>
          <SavedPanelMenu onRename={() => setRenaming(true)} onDelete={onDelete} />
        </span>
      )}
      {status}
      <span className={cn("flex shrink-0", needs && "opacity-40")}>
        <Footprint item={item} on={highlighted} compact={compact} />
      </span>
    </div>
  );
}
