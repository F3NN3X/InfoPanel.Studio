/**
 * The inspector for a page group (Edit v3 SPEC §10.3): its name and what it holds, the box of its members (on the
 * grid when every member is on cells, else in px), the note that it moves, hides and locks as one, Select contents
 * and Ungroup, and the LAYER section.
 */
import { Eye, EyeOff, Folder, FolderMinus, Grid3x3, Move, SquareDashedMousePointer, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { nearestCells, partsOf, type GroupNode, type PageModel } from "@/lib/page-model/model";
import { unionBox, type LayerAction } from "@/lib/page-model/layer-actions";
import { cn } from "@/lib/utils";
import { LayerSection } from "./layer-section";

const SECTION_LABEL = "font-ui-mono text-[10.5px] uppercase tracking-[0.06em] text-ui-4";
const ACTION =
  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40";

/** "1 widget, 2 items, 1 element": what a group holds, every level down. */
export function groupContents(group: GroupNode): string {
  const parts = partsOf(group.children);
  const n = (kind: string) => parts.filter((p) => p.kind === kind).length;
  const word = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  const out = [
    ...(n("widget") ? [word(n("widget"), "widget")] : []),
    ...(n("item") ? [word(n("item"), "item")] : []),
    ...(n("element") ? [word(n("element"), "element")] : []),
  ];
  return out.length ? out.join(", ") : "empty";
}

interface GroupInspectorProps {
  model: PageModel;
  group: GroupNode;
  /** The group it sits in (null: the top), and the groups it can go into. */
  inGroup: string | null;
  groups: readonly { id: string; name: string }[];
  onAction: (action: LayerAction) => void;
  onInGroup: (groupId: string | null | "new") => void;
  onSelectContents: () => void;
}

function Boxes({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {labels.map((l, i) => (
        <span key={l} className="flex h-7 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-app px-2 font-ui-mono text-[12px] text-ui-1">
          <span className="text-[9.5px] text-ui-5">{l}</span>
          {Math.round(values[i])}
        </span>
      ))}
    </div>
  );
}

export function GroupInspector({ model, group, inGroup, groups, onAction, onInGroup, onSelectContents }: GroupInspectorProps) {
  const parts = partsOf(group.children);
  const box = unionBox(model, group);
  const onGrid = parts.length > 0 && parts.every((p) => "cell" in p.place);
  const cells = box && onGrid ? nearestCells(model.grid, box) : null;
  return (
    <div className="flex flex-col font-ui">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-ui-hover text-ui-3">
          <Folder className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-ui-1">{group.name}</span>
          <span data-testid="inspector-kind" className="truncate text-[10.5px] text-ui-4">
            Group · {groupContents(group)}
          </span>
        </span>
        <IconButton label={group.hidden ? "Show" : "Hide"} className="text-ui-5" onClick={() => onAction("hide")}>
          {group.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </IconButton>
        <IconButton label="Delete" danger className="text-ui-5" disabled={group.locked} onClick={() => onAction("delete")}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
      {box && (
        <section data-testid="inspector-place" data-mode={onGrid ? "grid" : "free"} className="flex flex-col gap-2.5 border-t border-ui-subtle px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className={SECTION_LABEL}>{onGrid ? "Place on grid" : "Position and size (px)"}</span>
            <span
              className={cn(
                "inline-flex h-[22px] items-center gap-1 rounded-[6px] px-1.5 text-[11px]",
                onGrid ? "bg-ui-hover text-ui-3" : "bg-ui-accent/14 text-ui-accent",
              )}
            >
              {onGrid ? <Grid3x3 className="h-3 w-3" /> : <Move className="h-3 w-3" />}
              {onGrid ? "On grid" : "Placed freely"}
            </span>
          </div>
          {cells ? <Boxes labels={["COL", "ROW", "W", "H"]} values={[cells.col, cells.row, cells.cols, cells.rows]} /> : <Boxes labels={["X", "Y", "W", "H"]} values={[box.x, box.y, box.w, box.h]} />}
          {!onGrid && (
            <button type="button" data-testid="snap-to-grid" className={ACTION} onClick={() => onAction("snap")}>
              <Grid3x3 className="h-3.5 w-3.5" />
              Snap to grid
            </button>
          )}
        </section>
      )}
      <p className="text-pretty border-t border-ui-subtle px-4 py-3.5 text-[11px] leading-[1.45] text-ui-4">
        Moves, hides and locks as one. Double-click on the canvas to select a part inside.
      </p>
      <div className="flex gap-2 border-t border-ui-subtle px-4 py-3.5">
        <button type="button" className={ACTION} onClick={onSelectContents} disabled={group.children.length === 0}>
          <SquareDashedMousePointer className="h-3.5 w-3.5" />
          Select contents
        </button>
        <button type="button" className={ACTION} onClick={() => onAction("ungroup")}>
          <FolderMinus className="h-3.5 w-3.5" />
          Ungroup
        </button>
      </div>
      <LayerSection onAction={onAction} groups={groups} inGroup={inGroup} onInGroup={onInGroup} />
    </div>
  );
}
