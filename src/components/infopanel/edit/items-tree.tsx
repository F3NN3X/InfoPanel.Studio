/**
 * The InfoPanel editor's Layers: the canvas's item tree (spec §7), an indent per depth, a chevron on groups, the kind's
 * icon, the name, the mode dot (blue native, amber InfoPanel, red can't convert), the lock and
 * InfoPanel's Hidden flag as a checkbox. Shift selects a range, Ctrl adds.
 */
import { useState, type MouseEvent } from "react";
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
import type { ModeState } from "@/lib/infopanel/canvas-edit";
import type { Path } from "@/lib/infopanel/editor/ops";
import type { DisplayItem } from "@/lib/infopanel/schema";
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

function rowsOf(items: readonly DisplayItem[], collapsed: ReadonlySet<Path>, prefix = "", depth = 0): Row[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const kids = item.kind === "Group" && !collapsed.has(path) ? rowsOf(item.DisplayItems, collapsed, path, depth + 1) : [];
    return [{ item, path, depth }, ...kids];
  });
}

export function ItemsTree({ editor, name }: { editor: CanvasEditor; name: string }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<Path>>(new Set());
  const rows = rowsOf(editor.committed, collapsed);
  const onRow = (path: Path, e: MouseEvent) => {
    if (e.shiftKey) editor.range(path);
    else editor.pick(path, e.ctrlKey || e.metaKey);
  };
  return (
    <section aria-label="Layers" className="flex min-h-0 flex-1 flex-col font-ui">
      <div className="flex items-baseline gap-2 px-3.5 pb-2.5 pt-3">
        <span className="text-[13px] font-semibold text-ui-1">Layers</span>
        <span className="truncate font-ui-mono text-[11px] text-ui-4">Canvas · {name}</span>
      </div>
      <div role="tree" aria-multiselectable className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-2">
        {rows.length === 0 && <p className="px-2 py-1 text-[12px] leading-snug text-ui-4">No items yet. Add one above.</p>}
        {rows.map(({ item, path, depth }) => {
          const Icon = kindIcon(item.kind);
          const state = editor.modes.get(path)?.state;
          const selected = editor.selection.includes(path);
          const isGroup = item.kind === "Group";
          return (
            <div
              key={path}
              role="treeitem"
              aria-selected={selected}
              aria-level={depth + 1}
              aria-expanded={isGroup ? !collapsed.has(path) : undefined}
              tabIndex={-1}
              onClick={(e) => onRow(path, e)}
              className={cn(
                "flex h-[30px] shrink-0 cursor-pointer items-center gap-[7px] rounded-[7px] pr-1 hover:bg-ui-hover",
                selected && "bg-ui-active hover:bg-ui-active",
              )}
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              {isGroup ? (
                <button
                  type="button"
                  aria-label={collapsed.has(path) ? "Expand" : "Collapse"}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = new Set(collapsed);
                    if (next.has(path)) next.delete(path);
                    else next.add(path);
                    setCollapsed(next);
                  }}
                  className="grid h-4 w-4 shrink-0 place-items-center text-ui-4"
                >
                  {collapsed.has(path) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <Icon className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
              <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", item.Hidden ? "text-ui-5" : "text-ui-2")}>{item.Name || item.kind}</span>
              {state && <span title={MODE_TITLE[state]} aria-label={MODE_TITLE[state]} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", MODE_DOT[state])} />}
              <button
                type="button"
                title={item.IsLocked ? "Locked: selects but doesn’t move" : "Lock"}
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
                title="Visible (InfoPanel’s Hidden flag)"
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
