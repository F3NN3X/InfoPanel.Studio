// The builder's Layers (Phase A G1, Phase B1 G9 G11 G12 G24): the recipe's blocks as an APG tree (one row per block, `aria-level`,
// `aria-selected`, `aria-expanded` on a Row, Card or Repeat; Up and Down, Home and End, Right and Left open, close and step in and
// out, type-ahead, F2 renames). Click selects, Ctrl toggles, Shift a range, as Edit's Layers (`studio/layers-tree.tsx`). A row drags
// (a 2 px line between rows, an outline on a container's middle) carrying the selection, and a tile from "Add a block" drops the same
// way; a drop the validator would refuse is refused with its reason at the drop line. Right-click, Shift+F10 or the Menu key opens
// the layer menu (its rows are `layer-entries.tsx`'s, which the stage's right-click opens too). A row whose block has a problem carries a
// warning dot.
// Phase D: an eye and a lock on each row hide a block on the stage and keep a click there from picking it (G25, the editor's only:
// `editor-flags.ts`), also in the menu and on Ctrl+Shift+H and Ctrl+Shift+L; a "Header" pseudo-row under the card opens its title,
// sub-title and icon (G37, Q12: no format change).
// Builder plan Phase 4: a search over the Layers names (the matches with the rows holding them), and "Move to" and "Select" in the menu.
// Phase 5: a container's background layers are its last rows, marked with the background icon; while a tile is dragged each open
// container has a "Background" slot under its rows, and a tile dropped there (or by a background row) becomes a background layer.
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Heading, Link2, Lock, LockOpen, Wallpaper } from "lucide-react";
import { ContextMenu } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { Block, BlockType, Recipe } from "@/widgets/recipe/types";
import { addRefusal, flatten, isBound, layerName, moveRefusal, moveTargets, topLevel, type Path } from "./builder-model";
import { BlockIcon } from "./block-icons";
import { flagged } from "./editor-flags";
import { INPUT } from "./fields";
import { type EditorFlag, type LayerCommand, layerEntries } from "./layer-entries";

export type { EditorFlag, LayerCommand } from "./layer-entries";

/** How a click or key picks rows: that row only, added or taken away (Ctrl), or the rows from the last pick to it (Shift). */
export type SelectHow = "only" | "toggle" | "range";

type Where = "above" | "below" | "inside";
/** Where a drop on a row puts the block: into the container (at its end), else before or after the row in its parent. */
const dropPlace = (at: number[], where: Where, size: number): { toParent: number[]; index: number } =>
  where === "inside" ? { toParent: at, index: size } : { toParent: at.slice(0, -1), index: at[at.length - 1] + (where === "below" ? 1 : 0) };
const indentOf = (depth: number): number => 6 + Math.min(depth, 4) * 16;
/** A row's chevron slot and the gap after it: where its icon starts past the indent. */
const ICON_AT = 22;
const keyOf = (p: Path): string => p.join(".");
const pathOf = (key: string): number[] => (key ? key.split(".").map(Number) : []);
const isContainer = (b: Block): boolean => "children" in b;
const kidsOf = (b: Block): readonly Block[] => ("children" in b ? b.children : []);
/** Whether the row `k` holds the row `p` (the root holds every other). */
const holds = (k: string, p: string): boolean => (k === "" ? p !== "" : p.startsWith(`${k}.`));
/** The Header pseudo-row's key in the rows' order (G37): never a block's path, and not a `data-layer` (it is no block). */
const HEADER = "header";

export interface LayersProps {
  recipe: Recipe;
  /** The primary selection (the block the inspector shows). */
  path: Path;
  /** Every selected block, the primary among them. */
  selected: readonly Path[];
  /** The plain problems of each block, by path (`"0.1"`; `""` the root). */
  problems: ReadonlyMap<string, readonly string[]>;
  /** A tile from "Add a block" being dragged. */
  tile: BlockType | null;
  /** Something is on the clipboard. */
  canPaste: boolean;
  /** Copy style has taken a block's look. */
  canPasteStyle: boolean;
  onSelect: (at: number[], how: SelectHow) => void;
  onRename: (at: number[], name: string) => void;
  onCommand: (cmd: LayerCommand, at: number[]) => void;
  /** A drop of the dragged rows (`moveBlocks`). */
  onMove: (from: number[][], toParent: number[], index: number) => void;
  /** "Move to" in the layer menu: the row (the selection, when the row is in it) to the end of the container at `toParent`. */
  onMoveTo: (at: number[], toParent: number[]) => void;
  /** A tile dropped on a row; `background`: on a container's background slot, or by a background row. */
  onAdd: (type: BlockType, toParent: number[], index: number, background?: boolean) => void;
  /** A refusal's reason, shown under Layers (null clears it). */
  onWhy: (why: string | null) => void;
  /** The blocks hidden and locked in the editor, by path (G25). */
  hidden: readonly string[];
  locked: readonly string[];
  /** Hide or lock (`on`) the row `at`, or the selection when it is in it. */
  onFlag: (flag: EditorFlag, at: number[], on: boolean) => void;
  /** The Header pseudo-row is the selection (G37). */
  header: boolean;
  onHeader: () => void;
  /** F2 or Rename on the stage: that row's name field opens (a new object each time it is asked). */
  renameAt?: { key: string } | null;
}

export function Layers({ recipe, path, selected, problems, tile, canPaste, canPasteStyle, onSelect, onRename, onCommand, onMove, onMoveTo, onAdd, onWhy, hidden: hiddenKeys, locked, onFlag, header, onHeader, renameAt }: LayersProps) {
  const all = useMemo(() => flatten(recipe), [recipe]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // a container closed by its path: a change to the tree's shape opens them all again (the paths moved)
  const shape = all.map((r) => `${keyOf(r.path)}${r.block.type}`).join("|");
  useEffect(() => setCollapsed(new Set()), [shape]);
  // the selection's row is never hidden in a closed container
  const primaryKey = keyOf(path);
  useEffect(
    () =>
      setCollapsed((c) => {
        const keep = [...c].filter((k) => !holds(k, primaryKey));
        return keep.length === c.size ? c : new Set(keep);
      }),
    [primaryKey],
  );
  const hidden = (p: number[]) => p.some((_, i) => collapsed.has(keyOf(p.slice(0, i))));
  // the search (Phase 4): the blocks whose Layers name has the words typed, with the rows holding them, every container open
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? new Set(all.filter((r) => layerName(recipe, r.block).toLowerCase().includes(q)).map((r) => keyOf(r.path))) : null;
  const rows = matches ? all.filter((r) => [...matches].some((m) => m === keyOf(r.path) || holds(keyOf(r.path), m))) : all.filter((r) => !hidden(r.path));
  // the Header pseudo-row sits right under the card, while the card is open (and no search is on)
  const headerShown = !matches && !collapsed.has("");
  const visible = rows.flatMap((r) => (r.path.length === 0 && headerShown ? ["", HEADER] : [keyOf(r.path)]));
  const chosen = new Set(header ? [] : selected.map(keyOf));
  const nameOf = (key: string) => (key === HEADER ? "Header" : layerName(recipe, all.find((r) => keyOf(r.path) === key)!.block));

  const [dragging, setDragging] = useState<number[][] | null>(null);
  const [drop, setDrop] = useState<{ at: string; where: Where; depth: number; why?: string } | null>(null);
  const lastWhy = useRef<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; at: number[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  useEffect(() => {
    if (renameAt?.key) setRenaming(renameAt.key);
  }, [renameAt]);

  // a tile's drag ends where no drop fired (a refused one): its reason stays under Layers
  useEffect(() => {
    if (tile) return;
    if (lastWhy.current) onWhy(lastWhy.current);
    lastWhy.current = undefined;
    setDrop(null);
  }, [tile]);

  const whereOf = (e: DragEvent, at: number[], container: boolean): Where => {
    if (!at.length) return "inside";
    const r = e.currentTarget.getBoundingClientRect();
    const f = r.height ? (e.clientY - r.top) / r.height : 0.5;
    return container ? (f < 0.25 ? "above" : f > 0.75 ? "below" : "inside") : f < 0.5 ? "above" : "below";
  };
  const placeOn = (e: DragEvent, at: number[], block: Block) => {
    const container = isContainer(block);
    const where = whereOf(e, at, container);
    const place = dropPlace(at, where, kidsOf(block).length);
    const why = dragging ? topLevel(dragging).map((p) => moveRefusal(recipe, p, place.toParent)).find(Boolean) : tile ? addRefusal(recipe, tile, place.toParent) : undefined;
    return { where, place, why };
  };
  const end = () => {
    setDragging(null);
    setDrop(null);
  };
  const focusRow = (key: string | undefined) => {
    if (key !== undefined) listRef.current?.querySelector<HTMLElement>(key === HEADER ? "[data-layer-header]" : `[data-layer="${key}"]`)?.focus();
  };
  const openMenu = (at: number[], x: number, y: number) => {
    if (!chosen.has(keyOf(at))) onSelect(at, "only");
    setMenu({ x, y, at });
  };

  /** The tree's keys on a row (APG tree), the moves (Alt+arrows), Del, F2 and the menu. */
  const onKey = (at: number[], block: Block, e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const key = keyOf(at);
    const k = visible.indexOf(key);
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
    // the card holds the Header row as well as its blocks
    const container = kidsOf(block).length > 0 || !at.length;
    const move = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "out", ArrowRight: "in" } as const)[e.key as "ArrowUp"];
    if (e.altKey && !e.ctrlKey && !e.metaKey && move) {
      e.preventDefault();
      onCommand(move, at);
    } else if (plain && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const next = visible[k + (e.key === "ArrowDown" ? 1 : -1)];
      if (next === undefined) return;
      focusRow(next);
      if (e.shiftKey && next !== HEADER) onSelect(pathOf(next), "range");
    } else if (plain && !e.shiftKey && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      focusRow(e.key === "Home" ? visible[0] : visible[visible.length - 1]);
    } else if (plain && !e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      if (container && collapsed.has(key)) setCollapsed(new Set([...collapsed].filter((c) => c !== key)));
      else if (container) focusRow(visible[k + 1]);
    } else if (plain && !e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      if (container && !collapsed.has(key)) setCollapsed(new Set([...collapsed, key]));
      else if (at.length) focusRow(keyOf(at.slice(0, -1)));
    } else if ((e.key === "Enter" || e.key === " ") && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      onSelect(at, e.key === " " && (e.ctrlKey || e.metaKey) ? "toggle" : "only");
    } else if (plain && !e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      if (at.length) onCommand("delete", at);
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key.toLowerCase() === "h" || e.key.toLowerCase() === "l")) {
      e.preventDefault();
      const flag = e.key.toLowerCase() === "h" ? "hidden" : "locked";
      if (at.length) onFlag(flag, at, !(flag === "hidden" ? hiddenKeys : locked).includes(key));
    } else if (plain && !e.shiftKey && e.key === "F2") {
      e.preventDefault();
      if (at.length) setRenaming(key);
    } else if ((e.shiftKey && e.key === "F10" && plain) || e.key === "ContextMenu") {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      openMenu(at, r.left + 24, r.bottom);
    } else if (plain && !e.shiftKey && e.key === "Escape") {
      e.preventDefault();
      onSelect([], "only");
      requestAnimationFrame(() => focusRow(""));
    } else if (plain && e.key.length === 1 && e.key !== " ") {
      // type-ahead: the next row whose name starts with what was typed in the last half second
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 500 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const order = [...visible.slice(k + (typed.current.text.length > 1 ? 0 : 1)), ...visible.slice(0, k + 1)];
      const hit = order.find((v) => nameOf(v).toLowerCase().startsWith(typed.current.text));
      if (hit !== undefined) {
        e.preventDefault();
        focusRow(hit);
      }
    }
  };
  const onClick = (at: number[], e: MouseEvent) => onSelect(at, e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "only");

  const menuAt = menu?.at ?? [];
  const menuList = topLevel(chosen.has(keyOf(menuAt)) ? selected : [menuAt]);
  const menuBlock = all.find((r) => keyOf(r.path) === keyOf(menuAt))?.block ?? recipe.root;
  const entries = menu
    ? layerEntries({
        at: menuAt,
        many: menuList.length,
        container: isContainer(menuBlock),
        hidden: hiddenKeys.includes(keyOf(menuAt)),
        locked: locked.includes(keyOf(menuAt)),
        canPaste,
        canPasteStyle,
        hasChildren: kidsOf(menuBlock).length > 0,
        background: !!menuBlock.background,
        targets: moveTargets(recipe, menuList),
        onCommand,
        onMoveTo,
        onRename: (at) => setRenaming(keyOf(at)),
        onFlag,
      })
    : [];

  const tabStop = header && headerShown ? HEADER : visible.includes(primaryKey) ? primaryKey : visible[0];
  // while a tile is dragged: each open container's background slot, under its last row (the innermost first)
  const slots = new Map<string, typeof rows>();
  if (tile && tile !== "repeat")
    for (const c of rows) {
      if (!isContainer(c.block) || c.block.type === "repeat" || (!matches && collapsed.has(keyOf(c.path)))) continue;
      const last = [...rows].reverse().find((r) => r === c || holds(keyOf(c.path), keyOf(r.path)))!;
      slots.set(keyOf(last.path), [c, ...(slots.get(keyOf(last.path)) ?? [])].sort((a, b) => b.depth - a.depth));
    }
  const active = !!dragging || !!tile;
  return (
    <>
      <input
        type="search"
        aria-label="Search layers"
        placeholder="Search layers"
        data-layers-search=""
        value={query}
        onChange={(e) => setQuery(e.target.value.slice(0, 40))}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            e.stopPropagation();
            setQuery("");
          } else if (e.key === "ArrowDown" && visible.length) {
            e.preventDefault();
            focusRow(visible[0]);
          }
        }}
        className={cn(INPUT, "mb-1.5 w-full")}
      />
      {matches && !matches.size && (
        <p role="status" data-layers-none="" className="px-2 py-1 text-micro text-ui-3">
          No block is named like that
        </p>
      )}
      <div ref={listRef} role="tree" aria-label="Layers" aria-multiselectable className="flex flex-col gap-0.5" onDragLeave={(e) => {
          // left for good: to a place outside (a drag's leave often names no place: then only the box's own leave counts)
          if (e.relatedTarget ? e.currentTarget.contains(e.relatedTarget as Node) : e.target !== e.currentTarget) return;
          setDrop(null);
          lastWhy.current = undefined;
        }}
      >
        {rows.map(({ block, path: at, depth }) => {
          const key = keyOf(at);
          const isSelected = chosen.has(key);
          const mark = drop?.at === key ? drop : null;
          const parent = kidsOf(block).length > 0 || !at.length;
          const isHidden = hiddenKeys.includes(key);
          const isLocked = locked.includes(key);
          const open = parent && (!!matches || !collapsed.has(key));
          // a row shown only because it holds a match
          const around = !!matches && !matches.has(key);
          const issues = problems.get(key);
          const name = layerName(recipe, block);
          return (
            <div key={key || "root"} className="relative">
              <div
                role="treeitem"
                tabIndex={key === tabStop ? 0 : -1}
                aria-level={depth + 1}
                aria-selected={isSelected}
                aria-current={(key === primaryKey && !header) || undefined}
                aria-expanded={parent ? open : undefined}
                aria-keyshortcuts="F2 Shift+F10 Delete Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Control+Shift+H Control+Shift+L"
                data-layer={key}
                data-hidden={isHidden ? "" : undefined}
                data-locked={isLocked ? "" : undefined}
                data-drop={mark ? (mark.why ? "refused" : mark.where) : undefined}
                draggable={at.length > 0 && renaming !== key && !flagged(locked, at)}
                onDragStart={(e) => {
                  const carry = isSelected ? topLevel(selected) : [at];
                  if (!isSelected) onSelect(at, "only");
                  setDragging(carry.length ? carry : [at]);
                  onWhy(null);
                  e.dataTransfer.setData("text/plain", "recipe-layer");
                  e.dataTransfer.effectAllowed = "move";
                }}
                // a refused drop fires no drop event (the browser cancels it): its reason stays under Layers
                onDragEnd={() => {
                  if (drop?.why) onWhy(drop.why);
                  end();
                }}
                onDragOver={(e) => {
                  if (!active) return;
                  e.preventDefault();
                  const { where, why: refused } = placeOn(e, at, block);
                  e.dataTransfer.dropEffect = refused ? "none" : tile ? "copy" : "move";
                  lastWhy.current = refused;
                  setDrop({ at: key, where, depth: where === "inside" ? depth + 1 : depth, why: refused });
                }}
                onDrop={(e) => {
                  if (!active) return;
                  e.preventDefault();
                  const { place, where, why: refused } = placeOn(e, at, block);
                  const from = dragging;
                  lastWhy.current = undefined;
                  end();
                  if (refused) return onWhy(refused);
                  if (from) onMove(from, place.toParent, place.index);
                  else if (tile) onAdd(tile, place.toParent, place.index, !!block.background && where !== "inside");
                }}
                // Shift+click would extend a text selection over the rows
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => onClick(at, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(at, e.clientX, e.clientY);
                }}
                onKeyDown={(e) => onKey(at, block, e)}
                className={cn(
                  "group flex h-8.5 w-full cursor-default items-center gap-2 rounded-ui-md pr-2 text-left text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent",
                  key === primaryKey && !header ? "bg-ui-active text-ui-1" : isSelected ? "bg-ui-accent/12 text-ui-1" : "text-ui-2 hover:bg-ui-raised hover:text-ui-1",
                  mark?.where === "inside" && (mark.why ? "outline outline-1 -outline-offset-1 outline-ui-warn" : "outline outline-1 -outline-offset-1 outline-ui-accent"),
                  dragging?.some((p) => keyOf(p) === key) && "opacity-50",
                )}
                style={{ paddingLeft: indentOf(depth) }}
              >
                {parent ? (
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    data-row-action="expand"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed(open ? new Set([...collapsed, key]) : new Set([...collapsed].filter((c) => c !== key)));
                    }}
                    className="grid h-3.5 w-3.5 shrink-0 place-items-center text-ui-hint"
                  >
                    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                ) : (
                  <span aria-hidden className="w-3.5 shrink-0" />
                )}
                <span className={cn("shrink-0", key === primaryKey ? "text-ui-accent-icon" : "text-ui-3")}>
                  <BlockIcon block={block} className="h-3.5 w-3.5" />
                </span>
                {renaming === key ? (
                  <input
                    autoFocus
                    aria-label={`Rename ${name}`}
                    defaultValue={block.name ?? (block.type === "repeat" ? "Repeat" : name)}
                    maxLength={40}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      setRenaming(null);
                      if (e.currentTarget.dataset.cancel === undefined) onRename(at, e.currentTarget.value.trim());
                      requestAnimationFrame(() => focusRow(key));
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        e.currentTarget.dataset.cancel = "";
                        e.currentTarget.blur();
                      }
                    }}
                    className="h-6 min-w-0 flex-1 rounded-5 border border-ui-accent bg-ui-app px-1.5 text-body text-ui-1 outline-none"
                  />
                ) : (
                  <span className={cn("min-w-0 flex-1 truncate", (flagged(hiddenKeys, at) || around) && "opacity-50")} onDoubleClick={() => at.length && setRenaming(key)}>
                    {name}
                  </span>
                )}
                {at.length > 0 && (
                  <>
                    <FlagButton on={isHidden} label={`${isHidden ? "Show" : "Hide"} ${name} on the stage`} flag="hidden" onClick={() => onFlag("hidden", at, !isHidden)}>
                      {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </FlagButton>
                    <FlagButton on={isLocked} label={`${isLocked ? "Unlock" : "Lock"} ${name}`} flag="locked" onClick={() => onFlag("locked", at, !isLocked)}>
                      {isLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                    </FlagButton>
                  </>
                )}
                {issues && <span role="img" aria-label="Has a problem" title={issues.join("\n")} data-problem-dot="" className="h-2 w-2 shrink-0 rounded-full bg-ui-warn" />}
                {block.background && <Wallpaper data-layer-background="" className="h-3.5 w-3.5 shrink-0 text-ui-3" strokeWidth={1.5} aria-label="Background layer" />}
                {isBound(block) && <Link2 className="h-3.5 w-3.5 shrink-0 text-ui-hint" strokeWidth={1.5} aria-label="Bound to data" />}
              </div>
              {mark && mark.where !== "inside" && (
                <span aria-hidden className={cn("pointer-events-none absolute right-0 z-10 h-0.5", mark.why ? "bg-ui-warn" : "bg-ui-accent", mark.where === "above" ? "-top-px" : "-bottom-px")} style={{ left: indentOf(mark.depth) + ICON_AT }} />
              )}
              {at.length === 0 && headerShown && (
                <div
                  role="treeitem"
                  tabIndex={tabStop === HEADER ? 0 : -1}
                  aria-level={2}
                  aria-selected={header}
                  aria-current={header || undefined}
                  data-layer-header=""
                  title="The card's title, sub-title and icon"
                  onClick={onHeader}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
                    const k = visible.indexOf(HEADER);
                    const to = ({ ArrowDown: visible[k + 1], ArrowUp: visible[k - 1], ArrowLeft: "", Home: visible[0], End: visible[visible.length - 1] } as Record<string, string | undefined>)[e.key];
                    if (to !== undefined) {
                      e.preventDefault();
                      focusRow(to);
                    } else if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onHeader();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      onSelect([], "only");
                      requestAnimationFrame(() => focusRow(""));
                    }
                  }}
                  className={cn(
                    "mt-0.5 flex h-8.5 w-full cursor-default items-center gap-2 rounded-ui-md pr-2 text-left text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent",
                    header ? "bg-ui-active text-ui-1" : "text-ui-2 hover:bg-ui-raised hover:text-ui-1",
                  )}
                  style={{ paddingLeft: indentOf(1) }}
                >
                  <span aria-hidden className="w-3.5 shrink-0" />
                  <Heading className={cn("h-3.5 w-3.5 shrink-0", header ? "text-ui-accent-icon" : "text-ui-3")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Header</span>
                </div>
              )}
              {tile && slots.get(key)?.map((c) => (
                <BackgroundSlot key={`bg ${keyOf(c.path)}`} name={layerName(recipe, c.block)} depth={c.depth + 1} onDrop={() => onAdd(tile, c.path, kidsOf(c.block).length, true)} />
              ))}
              {mark?.why && (
                <span data-drop-why="" className={cn("pointer-events-none absolute right-1 z-20 max-w-50 rounded-4 border border-ui-warn bg-ui-panel px-1.5 py-0.5 text-micro leading-tight text-ui-warn", mark.where === "above" ? "bottom-full mb-0.5" : "top-full mt-0.5")}>
                  {mark.why}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} width={230} testId="builder-layer-menu" entries={entries} onClose={() => setMenu(null)} />}
    </>
  );
}

/** A container's background slot (Phase 5), shown while a tile is dragged: a tile dropped on it is the container's background layer. */
function BackgroundSlot({ name, depth, onDrop }: { name: string; depth: number; onDrop: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-background-slot={name}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      className={cn("mt-0.5 flex h-7 items-center gap-2 rounded-ui-md border border-dashed pr-2 text-micro", over ? "border-ui-accent text-ui-1" : "border-ui-subtle text-ui-3")}
      style={{ paddingLeft: indentOf(depth) + ICON_AT - 18 }}
    >
      <Wallpaper className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="truncate">Background of {name}</span>
    </div>
  );
}

/** A row's eye or lock (G25): shown on a row it is on, else while the row is hovered or focused; out of the tab order (the menu and Ctrl+Shift+H, L reach it). */
function FlagButton({ on, label, flag, onClick, children }: { on: boolean; label: string; flag: EditorFlag; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={on}
      data-row-action={flag}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-ui-sm text-ui-hint hover:text-ui-1", !on && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}
    >
      {children}
    </button>
  );
}
