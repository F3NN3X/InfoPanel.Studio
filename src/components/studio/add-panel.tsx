import { Tabs } from "@/components/ui/tabs";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { INFOPANEL_CHIP, startTab, useAddChip, type AddFilter } from "./add-prefs";
import { FilePlus2, FileUp, Search, SlidersHorizontal, SquareDashedMousePointer, X, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { PopoverParts } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { iconFor } from "@/widgets/core/icons";
import { FOCUS } from "./menu-styles";
import { addGroups, fitsIn, searchItems, sizeText, type AddCatalog, type AddItem, type AddKind } from "./add-catalog";
import type { AddListDensity } from "./add-prefs";
import { AddPreview, previewTop } from "./add-preview";
import { AddRow, type RowTag } from "./add-row";
import { TileCard, cardTop } from "./add-tile-card";
import { AddTileGrid, TILE_COLS, tileId } from "./add-tile-grid";
import { takeSearchRequest } from "./design-left-panel";
import { addSections, chipsFor, ELEMENT_TILES, ITEM_TILES, moveInGrid, tileRows, widgetTile, type AddTile } from "./add-tiles";

/**
 * The Add tab (02b, Edit v3 SPEC §9): Widgets, Items (InfoPanel items and studio elements), Panels and Layouts, with a
 * details card on hover. A widget is one row; its views are presets in the inspector (D-5). A click or Enter adds (a widget fills the selected blank zone), a drag places on the canvas.
 */

const KINDS: { kind: AddKind; label: string; one: string }[] = [
  { kind: "widget", label: "Widgets", one: "widget" },
  { kind: "panel", label: "Panels", one: "panel" },
  { kind: "layout", label: "Layouts", one: "layout" },
];

type AddTab = AddKind | "items";

/** The leave delay before the card hides (another tile cancels it). */
const HIDE_MS = 120;
/** The rest on a tile before its card opens (instant while one is open, and for the keys). */
const OPEN_MS = 250;
/** How long a just-added tile stays highlighted. */
const ADDED_MS = 1500;
/** The sticky group header's height: a highlighted row scrolls into view below it. */
const HEADER_H = 30;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export interface AddPanelProps {
  catalog: AddCatalog;
  /** Recently used tile keys, newest first. */
  recent: string[];
  /** The selected blank zone (clicks fill it). */
  target?: { id: string; cols: number; rows: number };
  onClearTarget: () => void;
  /** A widget, panel or layout's add path: fills the target when set, else auto-places. */
  onAdd: (item: AddItem) => void;
  /** An InfoPanel item's or element's add, by its palette drag id; none: the panel offers widgets only. */
  onAddPart?: (data: string) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  /** "Canvas from a file…" under Layouts › Empty: the Import door. */
  onImportCanvas?: () => void;
  /** "New InfoPanel profile…" beside it: one from scratch, opened in Edit. */
  onNewInfoPanel?: () => void;
  density: AddListDensity;
  previewOnHover: boolean;
  /** The panel's "View options" (list density, preview on hover); without both, the menu isn't offered. */
  onDensityChange?: (density: AddListDensity) => void;
  onPreviewOnHoverChange?: (on: boolean) => void;
  /** What the preview renders the widget under: the page's style and theme. */
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  /** Layouts can't apply on this page: the tab is disabled with this tooltip. */
  layoutsOff?: string;
  /** A fixture's state: the segment, the tile whose card is open, and the tile just added (its highlight). */
  start?: { segment?: AddFilter; hoverTile?: string; added?: string };
}

/** How far the chip row fades at an edge with more chips past it. */
const FADE_PX = 44;
/** How far a press moves before it drags the chip row rather than clicking a chip. */
const DRAG_PX = 4;

/**
 * The category chips: one row that scrolls sideways (the wheel, a drag, and a chip reached by Tab scroll it), fading at
 * an edge with more chips past it, so a cut-off chip reads as "more this way" (sign-off rounds 1 and 3).
 */
function ChipRow({ chips, label, children }: { chips: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: false, end: false });
  // A mouse press: where it started, and whether it has become a drag (the click that ends it then picks no chip).
  const press = useRef<{ x: number; left: number; dragged: boolean } | null>(null);
  const dragged = useRef(false);
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  };
  useEffect(() => {
    measure();
    const el = ref.current;
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (el) ro?.observe(el);
    return () => ro?.disconnect();
  }, [chips]);
  const mask = `linear-gradient(to right, ${edge.start ? `transparent, #000 ${FADE_PX}px` : "#000, #000"}, ${edge.end ? `#000 calc(100% - ${FADE_PX}px), transparent` : "#000"})`;
  return (
    <div
      ref={ref}
      role={label ? "group" : undefined}
      aria-label={label}
      data-fade={[edge.start && "start", edge.end && "end"].filter(Boolean).join(" ") || undefined}
      onScroll={measure}
      onWheel={(e) => {
        const el = ref.current;
        if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
        press.current = { x: e.clientX, left: ref.current.scrollLeft, dragged: false };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const p = press.current;
        const el = ref.current;
        if (!p || !el || (e.buttons & 1) === 0) return;
        if (!p.dragged && Math.abs(e.clientX - p.x) < DRAG_PX) return;
        p.dragged = true;
        el.scrollLeft = p.left - (e.clientX - p.x);
      }}
      onPointerUp={() => {
        dragged.current = press.current?.dragged ?? false;
        press.current = null;
      }}
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="add-chips mt-2 flex h-6 shrink-0 gap-1 overflow-x-auto px-2.5"
    >
      {children}
    </div>
  );
}

function ChipButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-6 shrink-0 items-center rounded-ui-sm border px-2 text-caption",
        FOCUS,
        on ? "border-ui-edge bg-ui-active text-ui-1" : "border-ui-subtle text-ui-3 hover:text-ui-1"
      )}
    >
      {children}
    </button>
  );
}

interface Highlight {
  key: string;
  via: "mouse" | "key";
}

export function AddPanel({
  catalog,
  recent,
  target,
  onClearTarget,
  onAdd,
  onAddPart,
  onRenamePreset,
  onDeletePreset,
  onImportCanvas,
  onNewInfoPanel,
  density,
  previewOnHover,
  onDensityChange,
  onPreviewOnHoverChange,
  appearance,
  pageStyle,
  layoutsOff,
  start,
}: AddPanelProps) {
  const [storedChip, setChip] = useAddChip();
  const [tab, setTab] = useState<AddTab>(() => startTab({ takesItems: !!onAddPart, segment: start?.segment, storedChip }));
  const kind: AddKind = tab === "items" ? "widget" : tab;
  // The chip of before the Items tab was read as that tab above; it is spent, so Widgets doesn't send the next mount back to Items.
  useEffect(() => {
    if (storedChip === INFOPANEL_CHIP) setChip("All");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [query, setQuery] = useState("");
  /** The Items tab's chip: one palette group or Elements (none: all of them). */
  const [group, setGroup] = useState<string | null>(null);
  const [hl, setHl] = useState<Highlight | null>(null);
  /** The card's place (viewport px), when shown. */
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const [justAdded, setJustAdded] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(openTimer.current);
      clearTimeout(addedTimer.current);
    },
    [],
  );
  const compact = density === "compact";
  const tiles = kind === "widget";

  // The Widgets tab's tiles: widgets, and the InfoPanel items and elements where the page takes them.
  const widgetTiles = useMemo(() => catalog.widget.map(widgetTile), [catalog.widget]);
  const chips = useMemo(() => chipsFor("widgets", catalog.widget), [catalog.widget]);
  const chip = chips.includes(storedChip) ? storedChip : "All";
  const inItems = tab === "items";
  const paletteGroups = useMemo(() => chipsFor("items", catalog.widget).slice(1), [catalog.widget]);
  // A search reaches every kind of tile the page takes, whichever tab it started on.
  const seg: AddFilter = !onAddPart ? "widgets" : query.trim() ? "all" : inItems ? "items" : "widgets";
  const sections = useMemo(
    () =>
      tiles
        ? addSections({
            widgets: widgetTiles,
            items: onAddPart ? ITEM_TILES : [],
            elements: onAddPart ? ELEMENT_TILES : [],
            segment: seg,
            chip: inItems ? (group ?? "All") : chip,
            query,
            recent,
          })
        : [],
    [tiles, widgetTiles, onAddPart, seg, chip, inItems, group, query, recent],
  );
  /** The tiles in list order, and the rows the arrow keys move through (the grid's columns: a fixed single track, see `TILE_COLS`). */
  const grid = useMemo(() => tileRows(sections, TILE_COLS), [sections]);

  // The Panels and Layouts tabs: the rows.
  const items = catalog[kind];
  const groups = useMemo(() => (tiles ? [] : addGroups(kind, items, { query, category: "All", recent })), [tiles, kind, items, query, recent]);
  const rows = useMemo(() => groups.flatMap((g, gi) => g.items.map((item) => ({ item, gi }))), [groups]);
  const optionId = (i: number) => `add-opt-${rows[i].gi}-${rows[i].item.id}`;
  const rowIndex = hl && !tiles ? rows.findIndex((_, i) => optionId(i) === hl.key) : -1;
  const currentRow = rowIndex >= 0 ? rows[rowIndex].item : undefined;
  const currentTile = hl && tiles ? grid.tiles.find((t) => t.key === hl.key) : undefined;

  /** Clear the highlight and hide the card (a query, kind, segment or chip change, an add, a drag). */
  const reset = () => {
    clearTimeout(hideTimer.current);
    clearTimeout(openTimer.current);
    setHl(null);
    setCard(null);
  };

  /** The card beside the element `el` (a tile's row, or a list row). */
  const place = (el: HTMLElement) => {
    const panel = rootRef.current?.closest("aside") ?? rootRef.current;
    if (!panel) return;
    const top = el.getBoundingClientRect().top;
    setCard(tiles ? { left: panel.getBoundingClientRect().right + 8, top: cardTop(top, window.innerHeight) } : { left: panel.getBoundingClientRect().right + 10, top: previewTop(top, window.innerHeight) });
  };
  const elOf = (key: string) => listRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(key)}"]`) ?? null;

  /** The pointer on a tile or row: its card after a rest, at once while one is open. */
  const hover = (key: string, el: HTMLElement) => {
    clearTimeout(hideTimer.current);
    clearTimeout(openTimer.current);
    setHl({ key, via: "mouse" });
    if (!previewOnHover) return setCard(null);
    if (card || !tiles) return place(el);
    openTimer.current = setTimeout(() => place(el), OPEN_MS);
  };

  /** Keep a keyboard-highlighted tile or row in view (scrollTop, not scrollIntoView). */
  const reveal = (el: HTMLElement) => {
    const list = listRef.current;
    if (!list) return;
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const head = tiles ? 0 : HEADER_H;
    if (top - head < list.scrollTop) list.scrollTop = top - head;
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + el.offsetHeight - list.clientHeight;
  };

  /** An arrow key: the tiles move in 2D, the rows up and down; the card follows at once. */
  const move = (key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown") => {
    let next: string | null = null;
    if (tiles) {
      const at = currentTile ? grid.tiles.indexOf(currentTile) : null;
      const i = moveInGrid(grid.rows, at, key);
      next = i === null ? null : tileId(grid.tiles[i]);
    } else {
      if (key === "ArrowLeft" || key === "ArrowRight" || rows.length === 0) return;
      const step = key === "ArrowDown" ? 1 : -1;
      const i = rowIndex < 0 ? (step === 1 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, rowIndex + step));
      next = optionId(i);
    }
    if (!next) return;
    const nextKey = tiles ? grid.tiles.find((t) => tileId(t) === next)!.key : next;
    setHl({ key: nextKey, via: "key" });
    clearTimeout(openTimer.current);
    const el = elOf(next);
    if (el) {
      reveal(el);
      place(el);
    }
  };

  const flash = (key: string) => {
    clearTimeout(addedTimer.current);
    setJustAdded(key);
    addedTimer.current = setTimeout(() => setJustAdded(undefined), ADDED_MS);
  };

  const add = (item: AddItem) => {
    reset();
    onAdd(item);
  };
  const addTile = (tile: AddTile) => {
    reset();
    flash(tile.key);
    if (tile.widget) onAdd(tile.widget);
    else if (tile.data) onAddPart?.(tile.data);
  };

  const pickKind = (next: AddTab) => {
    setTab(next);
    reset();
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const pickChip = (next: string) => {
    setChip(next);
    setGroup(null);
    reset();
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    reset();
  };

  // "/" anywhere in Edit (outside a field) goes to search.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Opened by "/" from Layers: the search takes the cursor.
  useEffect(() => {
    if (takeSearchRequest()) inputRef.current?.focus();
  }, []);

  // A blank zone picked on the canvas: search takes the cursor, ready to fill it.
  useEffect(() => {
    if (target?.id) inputRef.current?.focus({ preventScroll: true });
  }, [target?.id]);

  // A fixture's state: the card of its tile, open.
  useEffect(() => {
    if (!start?.hoverTile) return;
    const tile = grid.tiles.find((t) => t.name === start.hoverTile);
    const el = tile && elOf(tileId(tile));
    if (!tile || !el) return;
    setHl({ key: tile.key, via: "mouse" });
    place(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.hoverTile, grid.tiles.length > 0]);
  useEffect(() => {
    const tile = start?.added ? grid.tiles.find((t) => t.name === start.added) : undefined;
    if (tile) flash(tile.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.added, grid.tiles.length > 0]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || ((e.key === "ArrowLeft" || e.key === "ArrowRight") && tiles && (e.currentTarget !== inputRef.current || hl?.via === "key" || !query))) {
      e.preventDefault();
      move(e.key);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (tiles) {
        const tile = currentTile ?? grid.tiles[0];
        if (tile) addTile(tile);
      } else {
        const item = currentRow ?? rows[0]?.item;
        if (item) add(item);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (card) reset();
      else if (query) changeQuery("");
      else if (target) onClearTarget();
      else inputRef.current?.blur();
    }
  };

  const tagOf = (item: AddItem): RowTag | undefined => {
    if (!target) return undefined;
    if (!fitsIn(item, target.cols, target.rows)) return { needs: sizeText(item.mw, item.mh) };
    return item.w === target.cols && item.h === target.rows ? "best" : undefined;
  };

  const sensor = catalog.widget.find((w) => w.id === "SensorValue");
  const empty = query.trim() !== "" && (tiles ? grid.tiles.length === 0 : rows.length === 0);
  /** Another kind with hits for the query (Widgets, Panels, Layouts order). */
  const elsewhere = empty ? KINDS.filter((k) => k.kind !== kind).map((k) => ({ ...k, n: searchItems(catalog[k.kind], query).length })).find((k) => k.n > 0) : undefined;
  const placeholder = !tiles ? (kind === "panel" ? "Search panels" : "Search layouts") : onAddPart ? "Search widgets and items" : "Search widgets";
  const tabs: { id: AddTab; label: string; off?: string }[] = [
    { id: "widget", label: "Widgets" },
    ...(onAddPart ? [{ id: "items" as const, label: "Items" }] : []),
    { id: "panel", label: "Panels" },
    { id: "layout", label: "Layouts", off: layoutsOff },
  ];
  const listId = "add-panel-list";
  const activeId = hl ? (tiles ? (currentTile ? tileId(currentTile) : undefined) : currentRow ? hl.key : undefined) : undefined;

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-2.5">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-ui-md border border-ui-default bg-ui-tile px-2.5 focus-within:border-ui-edge">
          <Search className="h-4 w-4 shrink-0 text-ui-hint" strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-label={placeholder}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-body text-ui-1 outline-none placeholder:text-ui-hint"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                changeQuery("");
                inputRef.current?.focus();
              }}
              className={cn("flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-ui-default text-ui-2 hover:text-ui-1", FOCUS)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-4 border border-ui-strong px-1.25 py-px font-ui-mono text-micro leading-3.5 text-ui-hint">/</kbd>
          )}
        </label>
        {onDensityChange && onPreviewOnHoverChange && (
          <ViewOptions density={density} onDensityChange={onDensityChange} previewOnHover={previewOnHover} onPreviewOnHoverChange={onPreviewOnHoverChange} />
        )}
      </div>

      <Tabs
        label="What to add"
        variant="pill"
        tabs={tabs.map((t) => ({ value: t.id, label: t.label, disabled: t.off !== undefined, title: t.off }))}
        value={tab}
        onChange={pickKind}
        className="mx-2.5 mt-2 h-8 shrink-0"
        tabClassName="flex-1"
      />

      {tiles && !inItems && !query.trim() && (
        <ChipRow chips={chips.join(" ")}>
          {chips.map((c) => (
            <ChipButton key={c} on={c === chip} onClick={() => pickChip(c)}>
              {c}
            </ChipButton>
          ))}
        </ChipRow>
      )}
      {inItems && !query.trim() && (
        // InfoPanel's palette groups (Text, Data, Media, Layout) and the studio's elements; pressing the one that is on shows them all again.
        <ChipRow chips={paletteGroups.join(" ")} label="InfoPanel groups">
          {paletteGroups.map((g) => (
            <ChipButton key={g} on={g === group} onClick={() => setGroup(g === group ? null : g)}>
              {g}
            </ChipButton>
          ))}
        </ChipRow>
      )}

      {target && (
        <div className="mx-2.5 mt-2.5 flex shrink-0 items-center gap-2.5 rounded-ui-md border border-ui-accent/35 bg-ui-accent/10 px-2.5 py-2.25">
          <SquareDashedMousePointer className="h-4.5 w-4.5 shrink-0 text-ui-accent-text" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-medium text-ui-1">
              Filling blank space · <span className="font-ui-mono text-micro">{sizeText(target.cols, target.rows)}</span>
            </div>
            <div className="truncate text-micro text-ui-soft">Click a widget to fill it</div>
          </div>
          <button
            type="button"
            onClick={onClearTarget}
            title="Stop filling (Esc)"
            aria-label="Stop filling"
            className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-3 hover:bg-ui-hover hover:text-ui-1", FOCUS)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-label={tabs.find((t) => t.id === tab)?.label}
        onKeyDown={onKeyDown}
        onWheel={() => card && reset()}
        onScroll={() => card && hl?.via === "mouse" && reset()}
        onMouseLeave={() => {
          clearTimeout(openTimer.current);
          clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(reset, HIDE_MS);
        }}
        className="relative mt-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 outline-none"
      >
        {empty ? (
          <div className="flex flex-col items-start gap-2.5 px-2 py-5">
            <div className="text-body font-medium text-ui-1">Nothing matches “{query.trim()}”</div>
            <p className="text-caption leading-[1.5] text-ui-hint">
              A Sensor shows any single value from your data sources, so it covers most things a dedicated widget doesn’t.
            </p>
            {sensor && (
              <button
                type="button"
                onClick={() => add(sensor)}
                className={cn("flex h-7 items-center gap-1.5 rounded-md bg-ui-inverse px-2.5 text-caption font-medium text-ui-inverse-fg", FOCUS)}
              >
                {(() => {
                  const Icon = iconFor("sensors");
                  return <Icon className="h-4 w-4" aria-hidden />;
                })()}
                Add a Sensor
              </button>
            )}
            {elsewhere && (
              <button type="button" onClick={() => pickKind(elsewhere.kind)} className={cn("text-caption text-ui-accent-text hover:underline", FOCUS)}>
                {elsewhere.n} {elsewhere.one}
                {elsewhere.n === 1 ? "" : "s"} match in {elsewhere.label} →
              </button>
            )}
          </div>
        ) : tiles ? (
          <AddTileGrid
            sections={sections}
            highlighted={hl?.key}
            justAdded={justAdded}
            dimmed={target ? (t) => !t.widget || !fitsIn(t.widget, target.cols, target.rows) : undefined}
            onAdd={addTile}
            onHover={(tile, el) => hover(tile.key, el)}
            onDragStart={reset}
          />
        ) : (
          groups.map((g, gi) => (
            <section key={`${gi}:${g.title}`} aria-label={g.title}>
              <div className="sticky top-0 z-10 flex items-baseline gap-1.5 bg-ui-panel px-1.5 pb-1.5 pt-2.5 text-caption font-medium">
                <span className="text-ui-3">{g.title}</span>
                <span className="font-ui-mono text-micro font-normal text-ui-hint">{g.items.length}</span>
              </div>
              {g.items.map((item) => {
                const index = rows.findIndex((r) => r.gi === gi && r.item === item);
                const id = optionId(index);
                return (
                  <AddRow
                    key={item.id}
                    item={item}
                    id={id}
                    highlighted={hl?.key === id}
                    compact={compact}
                    tag={tagOf(item)}
                    onPick={() => add(item)}
                    onHover={() => {
                      const el = elOf(id);
                      if (el) hover(id, el);
                    }}
                    onDragStart={reset}
                    onRename={item.saved ? (name) => onRenamePreset(item.id, name) : undefined}
                    onDelete={item.saved ? () => onDeletePreset(item.id) : undefined}
                  />
                );
              })}
              {kind === "layout" && g.title === "Empty" && !query.trim() && onImportCanvas && (
                <DoorRow compact={compact} icon={FileUp} title="Canvas from a file…" note="An .infopanel profile, through Import" onClick={onImportCanvas} />
              )}
              {kind === "layout" && g.title === "Empty" && !query.trim() && onNewInfoPanel && (
                <DoorRow compact={compact} icon={FilePlus2} title="New InfoPanel profile…" note="From scratch, opened in Edit" onClick={onNewInfoPanel} />
              )}
            </section>
          ))
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2.5 overflow-hidden whitespace-nowrap border-t border-ui-subtle px-3 text-micro text-ui-3">
        {tab === "widget" ? (
          <span>Styles are presets inside each widget</span>
        ) : (
          <>
            <span>Hover for details</span>
            <span>↑↓ browse</span>
            <span>Enter add</span>
          </>
        )}
      </div>

      {currentTile && card && <TileCard tile={currentTile} left={card.left} top={card.top} appearance={appearance} pageStyle={pageStyle} />}
      {currentRow && card && hl && (
        <AddPreview item={currentRow} left={card.left} top={card.top} via={hl.via} target={target} appearance={appearance} pageStyle={pageStyle} />
      )}
    </div>
  );
}

/** A row under Layouts › Empty that leads out of the list (Import, a new InfoPanel profile). */
function DoorRow({ compact, icon: Icon, title, note, onClick }: { compact: boolean; icon: LucideIcon; title: string; note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 rounded-ui-md px-2 text-left hover:bg-s-divider", compact ? "h-10" : "h-13", FOCUS)}
    >
      <span className={cn("flex shrink-0 items-center justify-center rounded-ui-md border border-ui-default bg-ui-raised text-ui-2", compact ? "h-7 w-7" : "h-(--ui-h-field) w-8.5")}>
        <Icon className="h-4.5 w-4.5" strokeWidth={1.6} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body font-medium text-ui-1">{title}</span>
        {!compact && <span className="truncate text-micro text-ui-hint">{note}</span>}
      </span>
    </button>
  );
}

const DENSITY_OPTIONS: { value: AddListDensity; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

interface ViewOptionsProps {
  density: AddListDensity;
  onDensityChange: (density: AddListDensity) => void;
  previewOnHover: boolean;
  onPreviewOnHoverChange: (on: boolean) => void;
}

/** The panel's two view options: the same stored values as Settings › Studio › Panels. */
function ViewOptions({ density, onDensityChange, previewOnHover, onPreviewOnHoverChange }: ViewOptionsProps) {
  return (
    <PopoverParts.Root>
      <PopoverParts.Trigger
        render={
          <IconButton label="View options" size={32} bordered>
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </IconButton>
        }
      />
      <PopoverParts.Content align="end" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-ui-3">Widget list</span>
            <Segmented label="Widget list" options={DENSITY_OPTIONS} value={density} onChange={onDensityChange} stretch />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-body text-ui-1">Preview on hover</span>
            <Toggle label="Preview on hover" checked={previewOnHover} onChange={onPreviewOnHoverChange} />
          </div>
        </div>
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}
