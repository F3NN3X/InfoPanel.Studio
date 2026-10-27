/**
 * Layers on an imported profile's page (Edit v3 SPEC §8): the canvas editor's item tree as the one Layers tree's rows
 * (top first, each node's id its item path) and the tree's changes run through the editor, so each is one undo step
 * in the studio's history and an item nothing touched keeps its bytes. A group's open state is InfoPanel's IsExpanded.
 */
import { useMemo } from "react";
import type { LayersHost, SelectHow, TreeNode } from "@/components/studio/layers-tree";
import { moduleIcon } from "@/components/studio/zone-icons";
import { elementOf } from "@/lib/infopanel/elements/apply";
import { moveBlock } from "@/lib/infopanel/editor/groups";
import { itemAt, setBox, type Path } from "@/lib/infopanel/editor/ops";
import { widgetOf } from "@/lib/infopanel/native/widget-item";
import type { DisplayItem } from "@/lib/infopanel/schema";
import { cellRect, nearestCells, type PageGrid } from "@/lib/page-model/model";
import type { LayerAction } from "@/lib/page-model/layer-actions";
import { createElement } from "react";
import { StatusIcon, type ExportCheckState } from "../export-check-panel";
import { ELEMENT_ICONS } from "./element-ui";
import { kindIcon } from "./item-icons";
import type { CanvasEditor } from "./use-canvas-editor";

const parentOf = (p: Path): Path => p.split(".").slice(0, -1).join(".");
const childOf = (parent: Path, i: number): Path => (parent ? `${parent}.${i}` : String(i));

/** The items as rows, top first. */
function nodesOf(items: readonly DisplayItem[], parent: Path = ""): TreeNode[] {
  return items
    .map((item, i): TreeNode => {
      const id = childOf(parent, i);
      const flags = { ...(item.IsLocked ? { locked: true } : {}), ...(item.Hidden ? { hidden: true } : {}) };
      if (item.kind === "Group" && !elementOf(item)) return { id, type: "group", name: item.Name, ...flags, children: nodesOf(item.DisplayItems, id) };
      const widget = widgetOf(item);
      const kind = widget ? "widget" : elementOf(item) ? "element" : "item";
      // An imported item sits at its X / Y: placed freely, unless it is on cells.
      const free = !widget && !(item as DisplayItem & { cell?: unknown }).cell;
      return { id, type: "part", kind, name: item.Name, ...(free ? { free: true } : {}), ...flags };
    })
    .reverse();
}

/** The children of the list `parent` ("" the top). */
const listOf = (items: readonly DisplayItem[], parent: Path): readonly DisplayItem[] => {
  if (parent === "") return items;
  const g = itemAt(items, parent);
  return g?.kind === "Group" ? g.DisplayItems : [];
};

/**
 * `grid`: the page's cells (none on a free area), for Snap to grid; each new `renameRequest` renames the primary (F2);
 * `check`: the editor's Export check, for the rows' statuses.
 */
export function useCanvasLayers(editor: CanvasEditor, grid: PageGrid | undefined, renameRequest: number, check: ExportCheckState): LayersHost {
  const items = editor.committed;
  const nodes = useMemo(() => nodesOf(items), [items]);
  const selection = editor.selection;
  const single = selection.length === 1 ? selection[0] : null;
  const singleItem = single ? itemAt(items, single) : undefined;
  const free = (p: Path) => {
    const it = itemAt(items, p);
    return it && it.kind !== "Group" && !widgetOf(it) && !(it as DisplayItem & { cell?: unknown }).cell && !it.IsLocked && editor.boxes[p] !== undefined;
  };
  const setFlag = (paths: readonly Path[], field: "IsLocked" | "Hidden" | "IsExpanded", value: boolean) =>
    editor.setFields(new Map(paths.map((p) => [p, value])), field);
  /** The selection moved to `index` of its primary's list (canvas order: 0 is the back). */
  const moveTo = (index: (count: number) => number) => {
    const parent = parentOf(selection.at(-1) ?? "");
    editor.move(parent, index(listOf(items, parent).length));
  };

  const available: Record<LayerAction, boolean> = {
    front: selection.length > 0,
    forward: single !== null,
    backward: single !== null,
    back: selection.length > 0,
    group: selection.length > 0,
    ungroup: singleItem?.kind === "Group",
    lock: selection.length > 0,
    hide: selection.length > 0,
    snap: grid !== undefined && selection.some(free),
    duplicate: selection.length > 0,
    delete: selection.some((p) => !itemAt(items, p)?.IsLocked),
  };
  const run = (action: LayerAction) => {
    if (!available[action]) return;
    switch (action) {
      case "front":
        return moveTo((n) => n);
      case "back":
        return moveTo(() => 0);
      case "forward":
        return editor.reorder(1);
      case "backward":
        return editor.reorder(-1);
      case "group":
        return editor.group();
      case "ungroup":
        return editor.ungroup();
      case "lock":
        return setFlag(selection, "IsLocked", selection.some((p) => !itemAt(items, p)?.IsLocked));
      case "hide":
        return setFlag(selection, "Hidden", selection.some((p) => !itemAt(items, p)?.Hidden));
      case "snap": {
        if (!grid) return;
        let next = items;
        for (const p of selection.filter(free)) {
          const b = editor.boxes[p];
          const c = cellRect(grid, nearestCells(grid, { x: b.x, y: b.y, w: b.width, h: b.height }));
          next = setBox(next, p, { x: c.x, y: c.y, width: c.w, height: c.h });
        }
        return editor.commit(next);
      }
      case "duplicate":
        return editor.duplicate();
      case "delete":
        return editor.remove();
    }
  };

  const groups: { id: string; name: string }[] = [];
  const collect = (list: readonly TreeNode[]) => {
    for (const n of list) {
      if (n.type !== "group") continue;
      groups.push({ id: n.id, name: n.name || "Group" });
      collect(n.children ?? []);
    }
  };
  collect(nodes);

  return {
    nodes,
    selectedIds: selection,
    isOpen: (id) => {
      const g = itemAt(items, id);
      return g?.kind === "Group" && g.IsExpanded === true;
    },
    setOpen: (ids, open) =>
      setFlag(
        ids.filter((p) => {
          const g = itemAt(items, p);
          return g?.kind === "Group" && g.IsExpanded !== open;
        }),
        "IsExpanded",
        open,
      ),
    select: (id: string, how: SelectHow) => {
      if (how === "range") editor.range(id);
      else editor.pick(id, how === "toggle");
    },
    rename: (id, name) => editor.setField(id, "Name", name),
    setLocked: (id, locked) => editor.setField(id, "IsLocked", locked),
    setHidden: (id, hidden) => editor.setField(id, "Hidden", hidden),
    dropBlocked: (ids, parentId) => moveBlock(items, ids, parentId ?? ""),
    // The editor moves its selection, which is what the drag carries (a row dragged alone was selected as it started).
    drop: (_ids, parentId, index) => {
      const parent = parentId ?? "";
      editor.move(parent, listOf(items, parent).length - index);
    },
    menu: {
      available,
      groups,
      run,
      moveToGroup: (groupId) => {
        if (groupId === null) return editor.group();
        editor.move(groupId, listOf(items, groupId).length);
      },
    },
    iconOf: (node) => {
      const item = itemAt(items, node.id);
      const widget = widgetOf(item);
      if (widget) return moduleIcon(widget.module);
      const element = elementOf(item);
      return element ? ELEMENT_ICONS[element.type] : kindIcon(item?.kind ?? "Shape");
    },
    statusIcon: check.on
      ? (id) => {
          const status = check.byPath.get(id)?.status;
          return status ? createElement(StatusIcon, { status }) : null;
        }
      : undefined,
    renameRequest,
  };
}
