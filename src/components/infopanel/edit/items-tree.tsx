/**
 * The InfoPanel editor's Layers: the canvas's item tree (spec §7), an indent per depth, a chevron on groups
 * (InfoPanel's IsExpanded), the kind's icon, the name (double-click renames), the mode dot (blue native, amber
 * InfoPanel, red can't convert), the lock and InfoPanel's Hidden flag as a checkbox. Shift selects a range, Ctrl adds.
 *
 * Rows read in draw order: the first row is drawn first (at the back), a group's children in its place. Rows drag:
 * onto the upper or lower edge of a row to go above or below it, onto the middle of a group to go inside it, onto the
 * empty space to go to the end of the top level. A drag carries the selection in tree order.
 */
import { useState, type DragEvent, type MouseEvent } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  Gauge,
  Globe,
  Hash,
  Image,
  Images,
  Lock,
  LockOpen,
  ChartLine,
  ChartBar,
  Shapes,
  Table,
  Type,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import type { ModeState } from "@/lib/infopanel/canvas-edit";
import { moveBlock } from "@/lib/infopanel/editor/groups";
import { itemAt, topmost, type Path } from "@/lib/infopanel/editor/ops";
import type { DisplayItem } from "@/lib/infopanel/schema";
import { badgeOf, elementOf } from "@/lib/infopanel/elements/apply";
import { BadgeChip, ELEMENT_ICONS } from "./element-ui";
import type { CanvasEditor } from "./use-canvas-editor";

const ICONS: Partial<Record<DisplayItem["kind"], LucideIcon>> = {
  Group: Folder,
  Text: Type,
  Sensor: Hash,
  Clock: Clock,
  Calendar: CalendarDays,
  TableSensor: Table,
  Bar: ChartBar,
  Graph: ChartLine,
  Donut: CircleDot,
  Gauge: Gauge,
  Image: Image,
  HttpImage: Globe,
  SensorImage: Images,
  Shape: Shapes,
};

export const kindIcon = (kind: DisplayItem["kind"]): LucideIcon => ICONS[kind] ?? Shapes;

export const MODE_DOT: Record<ModeState, string> = { native: "bg-ui-accent", infopanel: "bg-ui-warning", stuck: "bg-ui-danger" };
const MODE_TITLE: Record<ModeState, string> = { native: "Native widget", infopanel: "InfoPanel", stuck: "Can’t convert yet" };

interface Row {
  item: DisplayItem;
  path: Path;
  depth: number;
}

function rowsOf(items: readonly DisplayItem[], prefix = "", depth = 0): Row[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const kids = item.kind === "Group" && item.IsExpanded ? rowsOf(item.DisplayItems, path, depth + 1) : [];
    return [{ item, path, depth }, ...kids];
  });
}

/** Where a drop lands relative to a row. */
type Where = "above" | "inside" | "below";
interface Drop {
  path: Path | null;
  where: Where;
}

const parentOf = (p: Path) => p.split(".").slice(0, -1).join(".");
const indexOf = (p: Path) => Number(p.split(".").at(-1));

/** The list and place a drop on `row` means: next to the row, or at the end of a group. */
function placeOf(items: readonly DisplayItem[], row: Path | null, where: Where): { parent: Path; index: number } {
  if (row === null) return { parent: "", index: items.length };
  if (where === "inside") {
    const g = itemAt(items, row);
    return { parent: row, index: g?.kind === "Group" ? g.DisplayItems.length : 0 };
  }
  return { parent: parentOf(row), index: indexOf(row) + (where === "below" ? 1 : 0) };
}

const DROP_STYLE: Record<Where, string> = {
  above: "",
  below: "",
  inside: "bg-ui-accent/25 shadow-[inset_0_0_0_2px_var(--ui-accent)]",
};

export function ItemsTree({ editor, name, onSaveComponent }: { editor: CanvasEditor; name: string; onSaveComponent?: () => void }) {
  const rows = rowsOf(editor.committed);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Path | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // What a drag carries: the selection when the dragged row is in it, else that row.
  const [dragging, setDragging] = useState<Path[]>([]);
  const selected = editor.selection;
  const onRow = (path: Path, e: MouseEvent) => {
    if (e.shiftKey) editor.range(path);
    else editor.pick(path, e.ctrlKey || e.metaKey);
  };
  const clear = () => {
    setDrop(null);
    setWhy(null);
  };
  /** The part of `row` the pointer is over: a group's middle is inside it, any row's edges above and below. */
  const whereOf = (e: DragEvent, row: Path | null): Where => {
    if (row === null) return "below";
    const r = e.currentTarget.getBoundingClientRect();
    const f = r.height ? (e.clientY - r.top) / r.height : 0.5;
    return itemAt(editor.committed, row)?.kind === "Group" ? (f < 0.25 ? "above" : f > 0.75 ? "below" : "inside") : f < 0.5 ? "above" : "below";
  };
  const over = (e: DragEvent, row: Path | null) => {
    if (dragging.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const where = whereOf(e, row);
    const reason = moveBlock(editor.committed, dragging, placeOf(editor.committed, row, where).parent);
    e.dataTransfer.dropEffect = reason ? "none" : "move";
    setWhy(reason);
    setDrop(reason ? null : { path: row, where });
  };
  const land = (e: DragEvent, row: Path | null) => {
    if (dragging.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const at = placeOf(editor.committed, row, whereOf(e, row));
    clear();
    setDragging([]);
    editor.move(at.parent, at.index);
  };
  const single = selected.length === 1 ? itemAt(editor.committed, selected[0]) : undefined;
  const entries: ContextMenuEntry[] = [
    { id: "group", label: "Group selection", hint: "Ctrl+G", disabled: topmost(selected).length < 1, onSelect: editor.group },
    { id: "ungroup", label: "Ungroup", hint: "Ctrl+Shift+G", disabled: single?.kind !== "Group", onSelect: editor.ungroup },
    { id: "component", label: "Save as component…", hint: "Ctrl+Shift+S", disabled: selected.length === 0 || !onSaveComponent, onSelect: () => onSaveComponent?.() },
    "separator",
    { id: "rename", label: "Rename", disabled: !single, onSelect: () => setRenaming(selected[0]) },
    { id: "duplicate", label: "Duplicate", hint: "Ctrl+D", disabled: selected.length === 0, onSelect: editor.duplicate },
    { id: "delete", label: "Delete", hint: "Del", danger: true, disabled: selected.length === 0, onSelect: editor.remove },
  ];
  return (
    <section aria-label="Layers" className="flex min-h-0 flex-1 flex-col font-ui">
      <div className="flex items-baseline gap-2 px-3.5 pb-2.5 pt-3">
        <span className="text-[13px] font-semibold text-ui-1">Layers</span>
        <span className="truncate font-ui-mono text-[11px] text-ui-4">Canvas · {name}</span>
      </div>
      <div
        role="tree"
        aria-multiselectable
        onDragOver={(e) => over(e, null)}
        onDrop={(e) => land(e, null)}
        onDragLeave={(e) => e.currentTarget === e.target && clear()}
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-2"
      >
        {rows.length === 0 && <p className="px-2 py-1 text-[12px] leading-snug text-ui-4">No items yet. Add one above.</p>}
        {rows.map(({ item, path, depth }) => {
          const element = elementOf(item);
          const Icon = element ? ELEMENT_ICONS[element.type] : kindIcon(item.kind);
          const badge = badgeOf(item);
          const state = editor.modes.get(path)?.state;
          const isSelected = selected.includes(path);
          const isGroup = item.kind === "Group";
          const mark = drop?.path === path ? drop.where : null;
          return (
            <div
              key={path}
              role="treeitem"
              aria-selected={isSelected}
              aria-level={depth + 1}
              aria-expanded={isGroup ? item.IsExpanded : undefined}
              tabIndex={-1}
              draggable={renaming !== path}
              onDragStart={(e) => {
                if (!isSelected) editor.select([path]);
                setDragging(isSelected ? selected : [path]);
                e.dataTransfer.setData("text/plain", "layers");
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                clear();
                setDragging([]);
              }}
              onDragOver={(e) => over(e, path)}
              onDrop={(e) => land(e, path)}
              onClick={(e) => onRow(path, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!isSelected) editor.select([path]);
                setMenu({ x: e.clientX, y: e.clientY });
              }}
              className={cn(
                "relative flex h-[30px] shrink-0 cursor-pointer items-center gap-[7px] rounded-[7px] pr-1 hover:bg-ui-hover",
                isSelected && "bg-ui-active hover:bg-ui-active",
                mark && DROP_STYLE[mark],
              )}
              data-drop={mark ?? undefined}
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              {(mark === "above" || mark === "below") && (
                <span
                  aria-hidden="true"
                  className={cn("pointer-events-none absolute right-0 z-10 h-[3px] rounded-full bg-ui-accent", mark === "above" ? "-top-[2px]" : "-bottom-[2px]")}
                  style={{ left: 8 + depth * 16 }}
                />
              )}
              {isGroup ? (
                <button
                  type="button"
                  aria-label={item.IsExpanded ? "Collapse" : "Expand"}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.setField(path, "IsExpanded", !item.IsExpanded);
                  }}
                  className="grid h-4 w-4 shrink-0 place-items-center text-ui-4"
                >
                  {item.IsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <Icon className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
              {renaming === path ? (
                <input
                  autoFocus
                  aria-label={`Rename ${item.Name || item.kind}`}
                  defaultValue={item.Name}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    setRenaming(null);
                    if (e.currentTarget.value !== item.Name) editor.setField(path, "Name", e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = item.Name;
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-6 min-w-0 flex-1 rounded-[5px] border border-ui-accent bg-ui-app px-1.5 text-[12.5px] text-ui-1 outline-none"
                />
              ) : (
                <span onDoubleClick={() => setRenaming(path)} className={cn("min-w-0 flex-1 truncate text-[12.5px]", item.Hidden ? "text-ui-5" : "text-ui-2")}>
                  {item.Name || item.kind}
                </span>
              )}
              {badge && <BadgeChip badge={badge} compact />}
              {state && <span title={MODE_TITLE[state]} aria-label={MODE_TITLE[state]} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", MODE_DOT[state])} />}
              <button
                type="button"
                title={item.IsLocked ? "Locked: the mouse ignores it on the canvas; select it here" : isGroup ? "Lock the group and what is in it" : "Lock"}
                aria-label={item.IsLocked ? `Unlock ${item.Name}` : `Lock ${item.Name}`}
                aria-pressed={item.IsLocked}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.setField(path, "IsLocked", !item.IsLocked);
                }}
                className={cn("grid h-[22px] w-[18px] shrink-0 place-items-center", item.IsLocked ? "text-ui-3" : "text-[#3f3f47] hover:text-ui-4")}
              >
                {item.IsLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </button>
              <input
                type="checkbox"
                title={isGroup ? "Visible (InfoPanel’s Hidden flag; a hidden group hides what is in it)" : "Visible (InfoPanel’s Hidden flag)"}
                aria-label={`Visible: ${item.Name || item.kind}`}
                checked={!item.Hidden}
                onClick={(e) => e.stopPropagation()}
                onChange={() => editor.setField(path, "Hidden", !item.Hidden)}
                className="mr-1 h-3.5 w-3.5 shrink-0 accent-[var(--ui-accent)]"
              />
            </div>
          );
        })}
      </div>
      {why && (
        <p role="status" className="border-t border-ui-subtle px-3.5 py-2 text-[11.5px] leading-snug text-ui-warning">
          {why}
        </p>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} />}
      <div className="flex flex-col gap-1.5 border-t border-ui-subtle px-3.5 py-2.5 text-[11px] text-ui-4">
        <div className="flex items-center gap-[7px]">
          <span className="h-1.5 w-1.5 rounded-full bg-ui-accent" />
          Native widget
          <span className="ml-2 h-1.5 w-1.5 rounded-full bg-ui-warning" />
          InfoPanel
        </div>
        <div className="flex items-center gap-[7px]">
          <span className="h-1.5 w-1.5 rounded-full bg-ui-danger" />
          Can’t convert yet
        </div>
      </div>
    </section>
  );
}
