/**
 * Layers on a screen's page (Edit v3 SPEC §8): the page model (`placements-adapter.ts`) as the Layers tree's rows,
 * one selection that holds widgets (the zone selection), InfoPanel items and elements (the item selection) and page
 * groups together, and every Layers change, menu action and layer key as page model ops, each one undo step. Keys:
 * with an item or a group in the selection every SPEC §14 key acts here, ahead of the zone shortcuts; with only
 * widgets, the keys the zone shortcuts don't have (Ctrl+] / [, Ctrl+G, Ctrl+L, Ctrl+H, F2). Ctrl+Shift+S saves the
 * selection to the Library, whatever it holds.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { uid, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { applyOps, cellsOverlap, findNode, partsOf, type LayerNode, type PageModel, type PageOp } from "@/lib/page-model/model";
import { partKeyOps } from "@/lib/page-model/keys";
import { dropBlocked, dropOps, groupMoveOps, layerActionOps, layerActionsFor, type LayerAction } from "@/lib/page-model/layer-actions";
import { readPlacements } from "@/lib/page-model/placements-adapter";
import type { ElementType } from "@/lib/infopanel/elements/spec";
import { kindIcon } from "@/components/infopanel/edit/item-icons";
import { ELEMENT_ICONS } from "@/components/infopanel/edit/element-icons";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { LayersHost, SelectHow, TreeNode } from "./layers-tree";
import type { ItemSelection } from "./use-item-selection";
import type { StudioSelection } from "./use-studio-selection";
import { zoneName } from "./inspector/zone-meta";
import { hasOverlay, isTyping, treeKey } from "./use-studio-shortcuts";
import { moduleIcon } from "./zone-icons";
import { useSaveSelection } from "./use-save-selection";

interface PageLayersDeps {
  profile: MonitorProfile;
  /** The page on the canvas, as stored. */
  page: ProfilePage;
  zones: StudioSelection;
  items: ItemSelection;
  /** Select a zone alone and bring it into view. */
  focusZone: (id: string) => void;
  applyPageOps: (ops: readonly PageOp[], key?: string) => void;
  /** A drag is in flight: the keys stand down. */
  dragging: () => boolean;
  /** A part's Export check status icon by its id, on a screen made for InfoPanel. */
  statusIcon?: (id: string) => ReactNode;
  /** Bring Layers into view (F2 renames there). */
  showLayers: () => void;
  /** Say something short (a refused group move). */
  toast: (message: string) => void;
}

/** Whether any two visible widgets share a cell. */
function widgetsOverlap(model: PageModel): boolean {
  const cells = partsOf(model.root)
    .filter((p) => p.kind === "widget" && !p.hidden && "cell" in p.place)
    .map((p) => (p.place as { cell: Parameters<typeof cellsOverlap>[0] }).cell);
  return cells.some((a, i) => cells.some((b, j) => i < j && cellsOverlap(a, b)));
}

const treeOf = (nodes: readonly LayerNode[]): TreeNode[] =>
  nodes.map((n) =>
    n.type === "group"
      ? { id: n.id, type: "group", name: n.name, locked: n.locked, hidden: n.hidden, children: treeOf(n.children) }
      : { id: n.id, type: "part", kind: n.kind, name: n.name, free: "px" in n.place, locked: n.locked, hidden: n.hidden },
  );

export function usePageLayers({ profile, page, zones, items, focusZone, applyPageOps, dragging, statusIcon, showLayers, toast }: PageLayersDeps) {
  const model = useMemo(() => readPlacements(profile, page, zoneName), [profile, page]);
  const nodes = useMemo(() => treeOf(model.root), [model]);
  const byId = useMemo(() => new Map(page.placements.map((p) => [p.id, p])), [page]);
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [renameRequest, setRenameRequest] = useState(0);
  /** The node picked last: the primary, the start of a Shift range. */
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    setGroupSel([]);
    setClosed(new Set());
  }, [profile.id, page.id]);
  const groups = groupSel.filter((id) => findNode(model.root, id)?.node.type === "group");
  const base = [...zones.selectedIds, ...items.ids, ...groups];
  const selection = last && base.includes(last) ? [...base.filter((id) => id !== last), last] : base;

  const save = useSaveSelection({ profile, page, model, selection, nameOf: zoneName, toast });

  const kindOf = (id: string, m: PageModel = model): "group" | "widget" | "item" | null => {
    const n = findNode(m.root, id)?.node;
    if (!n) return null;
    return n.type === "group" ? "group" : n.kind === "widget" ? "widget" : "item";
  };

  /** Select exactly these nodes, whatever their kinds (the primary last). */
  const selectMany = (ids: readonly string[], m: PageModel = model) => {
    const zoneIds = ids.filter((id) => kindOf(id, m) === "widget");
    const itemIds = ids.filter((id) => kindOf(id, m) === "item");
    items.keep();
    zones.selectMany(zoneIds);
    items.setIds(itemIds);
    setGroupSel(ids.filter((id) => kindOf(id, m) === "group"));
    setLast(ids.at(-1) ?? null);
  };

  const select = (id: string, how: SelectHow, visible: readonly string[] = []) => {
    const kind = kindOf(id);
    if (!kind) return;
    if (how === "range" && last && visible.includes(last)) {
      const [a, b] = [visible.indexOf(last), visible.indexOf(id)].sort((x, y) => x - y);
      const range = visible.slice(a, b + 1).filter((x) => x !== id);
      return selectMany([...range, id]);
    }
    setLast(id);
    if (how === "toggle") {
      if (kind === "group") return setGroupSel((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
      if (kind === "item") return items.select(id, true);
      items.keep();
      return zones.select(id, "toggle");
    }
    setGroupSel(kind === "group" ? [id] : []);
    if (kind === "group") {
      items.clear();
      return zones.select(null);
    }
    if (kind === "item") return items.select(id, false);
    items.clear();
    focusZone(id);
  };

  /** Ops as one undo step; the selection after them when they say. */
  const apply = (ops: readonly PageOp[], select?: readonly string[], key?: string) => {
    if (ops.length === 0) return;
    applyPageOps(ops, key);
    if (select) selectMany(select, applyOps(model, ops));
  };

  const run = (action: LayerAction) => {
    const r = layerActionOps(model, selection, action, uid);
    if (r) apply(r.ops, r.select);
  };

  /** Into a group (`null`: out of every group, to the top), or "new": a new group around the selection. */
  const moveInto = (groupId: string | null | "new") => {
    if (groupId === "new") return run("group");
    apply([{ type: "moveToGroup", ids: selection, groupId }]);
  };

  const groupList = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    const visit = (list: readonly LayerNode[]) => {
      for (const n of list) {
        if (n.type !== "group") continue;
        out.push({ id: n.id, name: n.name });
        visit(n.children);
      }
    };
    visit(model.root);
    return out;
  }, [model]);

  const iconOf = (node: TreeNode) => {
    const p: Placement | undefined = byId.get(node.id);
    if (node.kind === "widget") return moduleIcon(p?.module ?? "");
    // An item placement holds the stored item: a studio element's spec is its `$.element`.
    const element = (p?.item?.$ as { element?: { type?: ElementType } } | undefined)?.element?.type;
    return element && ELEMENT_ICONS[element] ? ELEMENT_ICONS[element] : kindIcon((p?.item?.kind ?? "Shape") as DisplayItem["kind"]);
  };

  const host: LayersHost = {
    nodes,
    selectedIds: selection,
    isOpen: (id) => !closed.has(id),
    setOpen: (ids, open) =>
      setClosed((now) => {
        const next = new Set(now);
        for (const id of ids) {
          if (open) next.delete(id);
          else next.add(id);
        }
        return next;
      }),
    select,
    rename: (id, name) => apply([{ type: "rename", id, name }]),
    setLocked: (id, locked) => apply([{ type: "setLocked", id, locked }]),
    setHidden: (id, hidden) => apply([{ type: "setHidden", id, hidden }]),
    dropBlocked: (ids, parentId) => dropBlocked(model, ids, parentId),
    drop: (ids, parentId, index) => {
      const ops = dropOps(model, ids, parentId, index);
      if (ops) apply(ops);
    },
    menu: { available: layerActionsFor(model, selection), groups: groupList, run, moveToGroup: (id) => moveInto(id ?? "new"), saveToLibrary: save.open },
    iconOf,
    statusIcon,
    renameRequest,
  };

  // The layer keys (see the header).
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (selection.length === 0 || e.defaultPrevented || e.isComposing || dragging() || isTyping(document.activeElement) || treeKey(e, document.activeElement) || hasOverlay()) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      // Taken here, so the studio's Ctrl+S doesn't save the screen as well.
      e.preventDefault();
      return save.open?.();
    }
    if (e.key === "F2" && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      showLayers();
      return setRenameRequest((n) => n + 1);
    }
    const onlyWidgets = items.ids.length === 0 && groups.length === 0;
    const key = e.key.toLowerCase();
    if (onlyWidgets && !(ctrl && !e.altKey && ["]", "[", "}", "{", "g", "l", "h"].includes(key)) && !(ctrl && (e.code === "BracketRight" || e.code === "BracketLeft"))) return;
    const result = partKeyOps(model, selection, { key: e.key, code: e.code, ctrl, shift: e.shiftKey, alt: e.altKey }, uid);
    if (!result) return;
    // Taken here, so the zone shortcuts don't act on it as well.
    e.preventDefault();
    if ("clear" in result) return selectMany([]);
    // Widgets moved with items go by cells and never onto another widget (SPEC §7.5).
    if (widgetsOverlap(applyOps(model, result.ops)) && !widgetsOverlap(model)) return;
    applyPageOps(result.ops, result.merge);
    if (result.select) selectMany(result.select, applyOps(model, result.ops));
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, []);

  /** The groups `ids` moved by a pointer delta from where they were in `from` (one drag); false when refused. */
  const moveGroups = (from: PageModel, ids: readonly string[], dx: number, dy: number, free: boolean, key: string): boolean => {
    const ops = groupMoveOps(from, ids, dx, dy, free);
    if (ops === null) {
      // Back where the drag started, while it can't go there.
      applyPageOps(groupMoveOps(from, ids, 0, 0, true) ?? [], key);
      return false;
    }
    applyPageOps(ops, key);
    return true;
  };

  return {
    host,
    model,
    selection,
    /** The selected page groups. */
    groups,
    clearGroups: () => setGroupSel([]),
    /** Rename the primary node in Layers (F2, the canvas's layer menu). */
    requestRename: () => {
      showLayers();
      setRenameRequest((n) => n + 1);
    },
    selectMany,
    run,
    moveInto,
    groupList,
    moveGroups,
    refuseGroupMove: () => toast("Not enough room to move the group."),
    /** Save the selection to the Library (the name dialog); unset with nothing selected. */
    saveToLibrary: save.open,
    /** The name dialog, while open. */
    saveDialog: save.dialog,
  };
}

export type PageLayers = ReturnType<typeof usePageLayers>;
