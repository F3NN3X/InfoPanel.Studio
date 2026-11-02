/**
 * Layers (Edit v3 SPEC §8): one tree for every page, a screen's or an imported profile's, top first. Each row has a
 * chevron slot, an icon tile, the name (double-click renames), the kind word, the placed-freely mark, the Export
 * check's status (made for InfoPanel), the lock and the eye. Click selects, Shift a range, Ctrl toggles; a row drags
 * between rows (a 2 px line where it lands) or onto a group's middle (an outline: into it), carrying the selection.
 * Right-click opens the layer menu. The chevron, lock and eye are pointer controls kept out of the accessibility tree (APG tree: no
 * interactive descendants of a treeitem); the keyboard has Left and Right, Ctrl+L and Ctrl+H, and the row's state is its aria-description. The page's host (`use-page-layers.ts` on a screen's page, `canvas-layers.ts` on an imported profile's) reads the
 * page into rows and runs every change.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, Eye, EyeOff, Folder, FolderOpen, FolderPlus, Lock, Move, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { PartKind } from "@/lib/page-model/model";
import { cn } from "@/lib/utils";
import type { LayerMenuHost } from "./layer-menu";

const LayerMenu = lazy(() => import("./layer-menu").then((m) => ({ default: m.LayerMenu })));

/** A row's node: a part or a group with its children, top first. */
export interface TreeNode {
  id: string;
  type: "group" | "part";
  kind?: PartKind;
  name: string;
  /** Placed freely (an item or element with a pixel box). */
  free?: boolean;
  locked?: boolean;
  hidden?: boolean;
  children?: TreeNode[];
}

/** How a click selects: that row only, added or taken away (Ctrl), or the rows from the last pick to it (Shift). */
export type SelectHow = "only" | "toggle" | "range";

export interface LayersHost {
  nodes: readonly TreeNode[];
  /** The selection, the primary last. */
  selectedIds: readonly string[];
  isOpen: (id: string) => boolean;
  setOpen: (ids: readonly string[], open: boolean) => void;
  /** `visible` is every row shown, top first (a range runs along it). */
  select: (id: string, how: SelectHow, visible: readonly string[]) => void;
  rename: (id: string, name: string) => void;
  setLocked: (id: string, locked: boolean) => void;
  setHidden: (id: string, hidden: boolean) => void;
  /** Why the nodes can't go into the group `parentId` (null: the top), or null when they can. */
  dropBlocked: (ids: readonly string[], parentId: string | null) => string | null;
  /** The nodes into `parentId` at the gap before `index` (top first, as the list is now). */
  drop: (ids: readonly string[], parentId: string | null, index: number) => void;
  menu: Omit<LayerMenuHost, "rename">;
  iconOf: (node: TreeNode) => LucideIcon;
  /** A part's Export check status icon (made for InfoPanel), with its label as the tooltip; none otherwise. */
  statusIcon?: (id: string) => ReactNode;
  /** Each new value starts renaming the primary node (F2). */
  renameRequest?: number;
}

interface Row {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  index: number;
}

type Where = "above" | "inside" | "below";

function rowsOf(nodes: readonly TreeNode[], isOpen: (id: string) => boolean, parentId: string | null = null, depth = 0): Row[] {
  return nodes.flatMap((node, index) => {
    const kids = node.type === "group" && isOpen(node.id) ? rowsOf(node.children ?? [], isOpen, node.id, depth + 1) : [];
    return [{ node, depth, parentId, index }, ...kids];
  });
}

/** Every group id under `nodes`, depth first. */
function groupIds(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.type === "group" ? [n.id, ...groupIds(n.children ?? [])] : []));
}

function counts(nodes: readonly TreeNode[]): { parts: number; groups: number } {
  let parts = 0;
  let groups = 0;
  const visit = (list: readonly TreeNode[]) => {
    for (const n of list) {
      if (n.type === "group") {
        groups++;
        visit(n.children ?? []);
      } else parts++;
    }
  };
  visit(nodes);
  return { parts, groups };
}

/** A row's state for the treeitem (its lock and eye buttons are for the pointer and hidden from assistive tech; Ctrl+L and Ctrl+H change them). */
function rowState(node: TreeNode): string | undefined {
  const state = [node.locked && "Locked", node.hidden && "Hidden"].filter(Boolean).join(", ");
  return state || undefined;
}

const KIND_WORD: Record<PartKind, string> = { widget: "widget", item: "item", element: "element" };

export function LayersTree({ host }: { host: LayersHost }) {
  const rows = useMemo(() => rowsOf(host.nodes, host.isOpen), [host.nodes, host.isOpen]);
  const total = useMemo(() => counts(host.nodes), [host.nodes]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<{ id: string | null; where: Where; depth: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [dragging, setDragging] = useState<readonly string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const seen = useRef<Map<string, string>>(new Map());
  const selected = host.selectedIds;
  const primary = selected.at(-1);
  // Rows inside a selected group tint.
  const tinted = useMemo(() => {
    const out = new Set<string>();
    const mark = (list: readonly TreeNode[], on: boolean) => {
      for (const n of list) {
        if (on) out.add(n.id);
        if (n.type === "group") mark(n.children ?? [], on || selected.includes(n.id));
      }
    };
    mark(host.nodes, false);
    return out;
  }, [host.nodes, selected]);

  // Ctrl+L and Ctrl+H change a row the user may not be looking at: say what changed (the icons are hidden from assistive tech).
  useEffect(() => {
    const now = new Map<string, string>();
    const said: string[] = [];
    const visit = (list: readonly TreeNode[]) => {
      for (const n of list) {
        const state = rowState(n) ?? "";
        const before = seen.current.get(n.id);
        now.set(n.id, state);
        if (before !== undefined && before !== state) said.push(`${n.name || "Layer"}: ${state ? state.toLowerCase() : "unlocked and shown"}`);
        if (n.type === "group") visit(n.children ?? []);
      }
    };
    visit(host.nodes);
    seen.current = now;
    if (said.length === 1) setAnnouncement(said[0]);
  }, [host.nodes]);

  // F2: rename the primary node.
  const request = useRef(host.renameRequest);
  useEffect(() => {
    if (host.renameRequest === request.current) return;
    request.current = host.renameRequest;
    if (primary) setRenaming(primary);
  }, [host.renameRequest, primary]);

  // The selection's row scrolls into view, by scrollTop only (never scrollIntoView, which moves the whole window).
  useEffect(() => {
    const list = listRef.current;
    if (!list || !primary) return;
    const el = list.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(primary)}"]`);
    if (!el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + el.offsetHeight - list.clientHeight;
  }, [primary]);

  const visible = rows.map((r) => r.node.id);
  const onRow = (id: string, e: MouseEvent) => host.select(id, e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "only", visible);
  /** The one row Tab reaches (a roving tab stop): the primary selection when it is shown, else the top row. */
  const tabStop = primary !== undefined && visible.includes(primary) ? primary : visible[0];
  const focusRow = (id: string | undefined) => {
    if (id !== undefined) listRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus();
  };
  /** Keys on a row (the tree's own, SPEC §14 keyboard use): Up and Down move between rows, Home and End go to the ends, Left and Right close and open a group, Shift extends the selection, Enter or Space selects, Ctrl+Space toggles. */
  const onRowKey = (id: string, e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const next = visible[visible.indexOf(id) + (e.key === "ArrowDown" ? 1 : -1)];
      if (next === undefined) return;
      focusRow(next);
      if (e.shiftKey) host.select(next, "range", visible);
    } else if ((e.key === "Home" || e.key === "End") && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      focusRow(e.key === "Home" ? visible[0] : visible[visible.length - 1]);
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // APG tree: Right opens a group (or steps into it), Left closes it (or steps out to its parent).
      const row = rows.find((r) => r.node.id === id);
      if (!row) return;
      e.preventDefault();
      const group = row.node.type === "group";
      const open = group && host.isOpen(id);
      if (e.key === "ArrowRight") {
        if (group && !open) host.setOpen([id], true);
        else if (group) focusRow(visible[visible.indexOf(id) + 1]);
      } else if (open) host.setOpen([id], false);
      else if (row.parentId) focusRow(row.parentId);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      host.select(id, e.key === " " && (e.ctrlKey || e.metaKey) ? "toggle" : "only", visible);
    }
  };
  const clear = () => {
    setDrop(null);
    setWhy(null);
  };
  /** The part of a row the pointer is over: a group's middle half is inside it, any row's edges above and below. */
  const whereOf = (e: DragEvent, row: Row): Where => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = r.height ? (e.clientY - r.top) / r.height : 0.5;
    return row.node.type === "group" ? (f < 0.25 ? "above" : f > 0.75 ? "below" : "inside") : f < 0.5 ? "above" : "below";
  };
  /** The list and gap a drop on `row` means: next to the row, or on top inside a group. */
  const placeOf = (row: Row | null, where: Where): { parentId: string | null; index: number } => {
    if (row === null) return { parentId: null, index: host.nodes.length };
    if (where === "inside") return { parentId: row.node.id, index: 0 };
    return { parentId: row.parentId, index: row.index + (where === "below" ? 1 : 0) };
  };
  const over = (e: DragEvent, row: Row | null) => {
    if (dragging.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const where = row ? whereOf(e, row) : "below";
    const reason = host.dropBlocked(dragging, placeOf(row, where).parentId);
    e.dataTransfer.dropEffect = reason ? "none" : "move";
    setWhy(reason);
    setDrop(reason || !row ? null : { id: row.node.id, where, depth: where === "inside" ? row.depth + 1 : row.depth });
  };
  const land = (e: DragEvent, row: Row | null) => {
    if (dragging.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const at = placeOf(row, row ? whereOf(e, row) : "below");
    const ids = dragging;
    clear();
    setDragging([]);
    if (!host.dropBlocked(ids, at.parentId)) host.drop(ids, at.parentId, at.index);
  };

  /** A group's descendants that are groups (Alt-click on a chevron opens or closes them all). */
  const deep = (node: TreeNode) => [node.id, ...groupIds(node.children ?? [])];

  return (
    <section aria-label="Layers" className="flex min-h-0 flex-1 flex-col font-ui">
      <div className="flex h-[38px] shrink-0 items-center gap-1.5 pl-3.5 pr-2.5">
        <span className="text-caption font-semibold text-ui-1">Layers</span>
        <span className="text-micro text-ui-4">top first</span>
        <span className="flex-1" />
        <IconButton label="Group selection (Ctrl+G)" className="h-6 w-6 rounded-ui-sm text-ui-4 hover:bg-ui-hover hover:text-ui-2" disabled={!host.menu.available.group} onClick={() => host.menu.run("group")}>
          <FolderPlus className="h-[14px] w-[14px]" />
        </IconButton>
        <IconButton label="Collapse all" className="h-6 w-6 rounded-ui-sm text-ui-4 hover:bg-ui-hover hover:text-ui-2" onClick={() => host.setOpen(groupIds(host.nodes), false)}>
          <ChevronsDownUp className="h-[14px] w-[14px]" />
        </IconButton>
      </div>
      <div
        ref={listRef}
        role="tree"
        aria-multiselectable
        onDragOver={(e) => over(e, null)}
        onDrop={(e) => land(e, null)}
        onDragLeave={(e) => e.currentTarget === e.target && clear()}
        className="relative flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2"
      >
        {rows.length === 0 && <p className="px-2 py-5 text-center text-xs text-ui-4">Nothing on this page yet. Use the Add tab to place a widget.</p>}
        {rows.map((row) => {
          const { node, depth } = row;
          const group = node.type === "group";
          const open = group && host.isOpen(node.id);
          const Icon = group ? (open ? FolderOpen : Folder) : host.iconOf(node);
          const widget = node.kind === "widget";
          const isSelected = selected.includes(node.id);
          const status = !group ? host.statusIcon?.(node.id) : undefined;
          const mark = drop?.id === node.id ? drop.where : null;
          const label = node.name || (group ? "Group" : "Part");
          return (
            <div
              key={node.id}
              role="treeitem"
              tabIndex={node.id === tabStop ? 0 : -1}
              aria-selected={isSelected}
              aria-level={depth + 1}
              aria-expanded={group ? open : undefined}
              aria-description={rowState(node)}
              aria-keyshortcuts="Control+L Control+H"
              data-testid="layers-row"
              data-row-id={node.id}
              data-kind={group ? "group" : node.kind}
              data-depth={depth}
              data-selected={isSelected ? "" : undefined}
              data-free={node.free ? "" : undefined}
              data-hidden={node.hidden ? "" : undefined}
              data-locked={node.locked ? "" : undefined}
              data-drop={mark ?? undefined}
              draggable={renaming !== node.id}
              onDragStart={(e) => {
                const carry = isSelected ? selected : [node.id];
                if (!isSelected) host.select(node.id, "only", visible);
                setDragging(carry);
                e.dataTransfer.setData("text/plain", "layers");
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                clear();
                setDragging([]);
              }}
              onDragOver={(e) => over(e, row)}
              onDrop={(e) => land(e, row)}
              // Shift+click would extend a text selection over the rows.
              onMouseDown={(e) => e.shiftKey && e.preventDefault()}
              onClick={(e) => onRow(node.id, e)}
              onKeyDown={(e) => onRowKey(node.id, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!isSelected) host.select(node.id, "only", visible);
                setMenu({ x: e.clientX, y: e.clientY });
              }}
              className={cn(
                "group/row relative flex h-(--ui-h-control) shrink-0 cursor-pointer items-center gap-[5px] rounded-ui-sm pr-1.5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent",
                isSelected ? "bg-ui-accent/18 text-white" : tinted.has(node.id) ? "bg-ui-accent/7" : "hover:bg-ui-hover",
                mark === "inside" && "outline outline-1 -outline-offset-1 outline-ui-accent",
              )}
              style={{ paddingLeft: 6 + depth * 16 }}
            >
              {(mark === "above" || mark === "below") && drop && (
                <span
                  aria-hidden="true"
                  className={cn("pointer-events-none absolute right-0 z-10 h-[2px] bg-ui-accent", mark === "above" ? "-top-px" : "-bottom-px")}
                  style={{ left: 6 + drop.depth * 16 }}
                />
              )}
              {group ? (
                <button
                  type="button"
                  aria-hidden="true"
                  data-row-action="expand"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    host.setOpen(e.altKey ? deep(node) : [node.id], !open);
                  }}
                  className="relative grid h-[14px] w-[14px] shrink-0 place-items-center text-ui-4 after:absolute after:-inset-1.5 after:content-['']"
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
              ) : (
                <span className="w-[14px] shrink-0" />
              )}
              <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[5px]", widget ? "bg-ui-accent/14 text-ui-accent" : "bg-ui-hover text-ui-3", node.hidden && "opacity-45")}>
                <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
              </span>
              {renaming === node.id ? (
                <input
                  autoFocus
                  aria-label={`Rename ${label}`}
                  defaultValue={node.name}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    setRenaming(null);
                    const name = e.currentTarget.value.trim();
                    if (e.currentTarget.dataset.cancel === undefined && name !== node.name) host.rename(node.id, name);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.dataset.cancel = "";
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-[22px] min-w-0 flex-1 rounded-[5px] border border-ui-accent bg-ui-app px-1.5 text-caption text-ui-1 outline-none"
                />
              ) : (
                <span onDoubleClick={() => setRenaming(node.id)} title={label} className={cn("min-w-0 flex-1 truncate text-caption", isSelected ? "text-white" : node.hidden ? "text-ui-4" : "text-ui-2")}>
                  {label}
                </span>
              )}
              {rowState(node) && <span className="sr-only">, {rowState(node)}</span>}
              <span className={cn("shrink-0 font-ui-mono text-[10px] text-ui-hint", node.hidden && "opacity-45")}>{group ? `group · ${node.children?.length ?? 0}` : KIND_WORD[node.kind ?? "item"]}</span>
              {node.free && !widget && (
                <span role="img" title="Placed freely (Alt)" aria-label="Placed freely (Alt)" className="inline-flex shrink-0 text-ui-4">
                  <Move className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
              {status && (
                <span data-testid="layers-row-status" className="inline-flex shrink-0">
                  {status}
                </span>
              )}
              <button
                type="button"
                title={node.locked ? "Unlock" : "Lock"}
                aria-hidden="true"
                data-row-action="lock"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  host.setLocked(node.id, !node.locked);
                }}
                className={cn(
                  "relative grid h-[18px] w-[16px] shrink-0 place-items-center after:absolute after:-inset-1 after:content-['']",
                  node.locked ? "text-ui-2" : "text-ui-hint opacity-0 group-hover/row:opacity-100",
                )}
              >
                <Lock className="h-[13px] w-[13px]" />
              </button>
              <button
                type="button"
                title={node.hidden ? "Show" : "Hide"}
                aria-hidden="true"
                data-row-action="hide"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  host.setHidden(node.id, !node.hidden);
                }}
                className={cn("relative grid h-[18px] w-[16px] shrink-0 place-items-center after:absolute after:-inset-1 after:content-['']", node.hidden ? "text-ui-2" : "text-ui-hint")}
              >
                {node.hidden ? <EyeOff className="h-[13px] w-[13px]" /> : <Eye className="h-[13px] w-[13px]" />}
              </button>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" aria-atomic="true" data-testid="layers-announcement" className="sr-only">
        {announcement}
      </p>
      {why && (
        <p role="status" className="border-t border-ui-subtle px-3.5 py-2 text-micro leading-snug text-ui-warn">
          {why}
        </p>
      )}
      {menu && (
        <Suspense fallback={null}>
          <LayerMenu
            x={menu.x}
            y={menu.y}
            host={{ ...host.menu, rename: selected.length === 1 ? () => setRenaming(selected[0]) : undefined }}
            onClose={() => setMenu(null)}
          />
        </Suspense>
      )}
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-ui-subtle px-3.5 py-2.5 text-micro">
        <span className="text-ui-3">
          {total.parts} part{total.parts === 1 ? "" : "s"} · {total.groups} group{total.groups === 1 ? "" : "s"}
        </span>
        <span className="text-ui-hint">Drag to reorder or into a group · right-click for more</span>
      </div>
    </section>
  );
}
