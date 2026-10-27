import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { AddFilter } from "./add-prefs";
import { FilePlus2, FileUp, LayoutGrid, Search, SquareDashedMousePointer, X, type LucideIcon } from "lucide-react";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import { iconFor } from "@/widgets/core/icons";
import { addGroups, categoriesOf, fitsIn, searchItems, sizeText, type AddCatalog, type AddItem, type AddKind } from "./add-catalog";
import type { AddListDensity } from "./add-prefs";
import { AddPreview, previewTop } from "./add-preview";
import { AddRow, type RowTag } from "./add-row";

/** The Add tab (handoff SPEC §4–§9): find a widget, panel or layout and add, drop or fill a blank zone with it. */

const KINDS: { kind: AddKind; label: string; one: string }[] = [
  { kind: "widget", label: "Widgets", one: "widget" },
  { kind: "panel", label: "Panels", one: "panel" },
  { kind: "layout", label: "Layouts", one: "layout" },
];

/** Each category chip's icon (Material Symbols names, `iconFor`). */
const CHIP_ICONS: Record<string, string> = {
  System: "monitor_heart",
  Hardware: "memory",
  Storage: "hard_drive",
  Network: "lan",
  Media: "music_note",
  Audio: "graphic_eq",
  Info: "schedule",
  Gaming: "stadia_controller",
  Generic: "sensors",
};

/** The leave delay before the card hides (another row cancels it). */
const HIDE_MS = 120;
/** The sticky group header's height: a highlighted row scrolls into view below it. */
const HEADER_H = 30;

const KEYCAP = "rounded-[3px] border border-ui-strong px-1 font-ui-mono text-[10px] leading-[14px] text-[#8a8a94]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.72_0.15_255)]";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export interface AddPanelProps {
  catalog: AddCatalog;
  recent: string[];
  /** The selected blank zone (clicks fill it). */
  target?: { id: string; cols: number; rows: number };
  onClearTarget: () => void;
  /** The add path: fills the target when set, else auto-places. */
  onAdd: (item: AddItem) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  /** "Canvas from a file…" under Layouts › Empty: the Import door. */
  onImportCanvas?: () => void;
  /** "New InfoPanel profile…" beside it: one from scratch, opened in Edit. */
  onNewInfoPanel?: () => void;
  density: AddListDensity;
  previewOnHover: boolean;
  /** What the preview renders the widget under: the page's style and theme. */
  appearance?: Appearance;
  pageStyle?: CSSProperties;
  /** A Free page (one-editor SPEC §5.3): the InfoPanel items join the widgets, with a filter; layouts don't apply. */
  free?: FreeAdd;
}

/** The merged Add panel's InfoPanel side, given by the canvas editor (it keeps the InfoPanel model out of this bundle). */
export interface FreeAdd {
  filter: AddFilter;
  onFilter: (filter: AddFilter) => void;
  /** The InfoPanel item kinds offered (the header's count). */
  itemCount: number;
  /** The InfoPanel items and Elements matching a query, as the palette's groups. */
  items: (query: string) => ReactNode;
  /** On a screen made for InfoPanel: a widget's Export check icon. */
  status?: (item: AddItem) => ReactNode;
  /** A grid page (SPEC §5.3): an InfoPanel item makes a free area where it goes, and Layouts still apply. */
  grid?: boolean;
}

const FILTERS: { value: AddFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "widgets", label: "Widgets" },
  { value: "items", label: "InfoPanel items" },
];

interface Highlight {
  index: number;
  via: "mouse" | "key";
}

export function AddPanel({
  catalog,
  recent,
  target,
  onClearTarget,
  onAdd,
  onRenamePreset,
  onDeletePreset,
  onImportCanvas,
  onNewInfoPanel,
  density,
  previewOnHover,
  appearance,
  pageStyle,
  free,
}: AddPanelProps) {
  const [kind, setKind] = useState<AddKind>("widget");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [hl, setHl] = useState<Highlight | null>(null);
  /** The preview's place (viewport px), when shown. */
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const compact = density === "compact";

  const items = catalog[kind];
  // On a Free page the InfoPanel items filter hides the widgets.
  const hideWidgets = free?.filter === "items" && kind === "widget";
  const groups = useMemo(() => (hideWidgets ? [] : addGroups(kind, items, { query, category, recent })), [hideWidgets, kind, items, query, category, recent]);
  const rows = useMemo(() => groups.flatMap((g, gi) => g.items.map((item) => ({ item, gi }))), [groups]);
  const optionId = (i: number) => `add-opt-${rows[i].gi}-${rows[i].item.id}`;
  const current = hl && rows[hl.index] ? rows[hl.index].item : undefined;

  /** Clear the highlight and hide the card (a query, kind or category change, an add, a drag). */
  const reset = () => {
    clearTimeout(hideTimer.current);
    setHl(null);
    setCard(null);
  };

  /** Show the card beside row `index`. */
  const place = (index: number) => {
    const row = listRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(optionId(index))}"]`);
    const panel = rootRef.current?.closest("aside") ?? rootRef.current;
    if (!row || !panel) return;
    setCard({ left: panel.getBoundingClientRect().right + 10, top: previewTop(row.getBoundingClientRect().top, window.innerHeight) });
  };

  const hover = (index: number) => {
    clearTimeout(hideTimer.current);
    setHl({ index, via: "mouse" });
    if (previewOnHover) place(index);
    else setCard(null);
  };

  /** Keep a keyboard-highlighted row in view below the sticky header (scrollTop, not scrollIntoView). */
  const reveal = (index: number) => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[id="${CSS.escape(optionId(index))}"]`);
    if (!list || !row) return;
    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    if (top - HEADER_H < list.scrollTop) list.scrollTop = top - HEADER_H;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight;
  };

  const move = (step: 1 | -1) => {
    if (rows.length === 0) return;
    const index = hl === null ? (step === 1 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, hl.index + step));
    setHl({ index, via: "key" });
    reveal(index);
    place(index);
  };

  const add = (item: AddItem) => {
    reset();
    onAdd(item);
  };

  const pickKind = (next: AddKind) => {
    setKind(next);
    setCategory("All");
    reset();
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const pickCategory = (next: string, chip: HTMLElement) => {
    setCategory(next);
    reset();
    if (listRef.current) listRef.current.scrollTop = 0;
    const row = chipsRef.current;
    row?.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    reset();
  };

  // "/" anywhere in Design (outside a field) goes to search.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A blank zone picked on the canvas: search takes the cursor, ready to fill it.
  useEffect(() => {
    if (target?.id) inputRef.current?.focus({ preventScroll: true });
  }, [target?.id]);

  // A vertical wheel over the chips scrolls them sideways.
  useEffect(() => {
    const row = chipsRef.current;
    if (!row) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = current ?? rows[0]?.item;
      if (item) add(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (query) changeQuery("");
      else if (target) onClearTarget();
      else inputRef.current?.blur();
    }
  };

  const tagOf = (item: AddItem): RowTag | undefined => {
    if (!target) return undefined;
    if (!fitsIn(item, target.cols, target.rows)) return { needs: sizeText(item.mw, item.mh) };
    return item.w === target.cols && item.h === target.rows ? "best" : undefined;
  };

  const counts = { widget: catalog.widget.length, panel: catalog.panel.length, layout: catalog.layout.length };
  const showChips = kind === "widget" && !query.trim() && !hideWidgets;
  const sensor = catalog.widget.find((w) => w.id === "SensorValue");
  /** Another kind with hits for the query (Widgets, Panels, Layouts order). */
  const elsewhere = rows.length === 0 && query.trim() ? KINDS.filter((k) => k.kind !== kind).map((k) => ({ ...k, n: searchItems(catalog[k.kind], query).length })).find((k) => k.n > 0) : undefined;
  const placeholder = kind === "widget" ? (free ? "Search widgets and items" : `Search ${counts.widget} widgets`) : kind === "panel" ? "Search panels" : "Search layouts";
  /** The InfoPanel items under the widgets on a Free page (unless the filter is Widgets). */
  const freeItems = free && kind === "widget" && free.filter !== "widgets" ? free.items(query) : null;
  const listId = "add-panel-list";

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-2.5 pt-2.5">
        <label className="flex h-[34px] items-center gap-2 rounded-[8px] border border-ui-default bg-ui-tile px-2.5 focus-within:border-[#3f3f48]">
          <Search className="h-[18px] w-[18px] shrink-0 text-[#7c7c86]" strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-label={placeholder}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current && hl ? optionId(hl.index) : undefined}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ui-1 outline-none placeholder:text-[#6f6f79]"
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
              className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ui-default text-ui-2 hover:text-ui-1", FOCUS)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-[4px] border border-ui-strong px-[5px] py-px font-ui-mono text-[10.5px] leading-[14px] text-[#7c7c86]">/</kbd>
          )}
        </label>
      </div>

      <div role="tablist" aria-label="What to add" className="mx-2.5 mt-2.5 flex shrink-0 gap-4 border-b border-ui-subtle">
        {KINDS.map((k) => {
          // Layouts arrange a grid page: none on a Free page.
          const off = !!free && !free.grid && k.kind === "layout";
          return (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={kind === k.kind}
              disabled={off}
              title={off ? "Layouts arrange a grid page." : undefined}
              onClick={() => pickKind(k.kind)}
              className={cn(
                "-mb-px flex h-[30px] items-center gap-1.5 text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
                FOCUS,
                kind === k.kind ? "text-ui-1 shadow-[inset_0_-2px_0_#ededf0]" : "text-[#7c7c86] hover:text-ui-2"
              )}
            >
              {k.label}
              <span className="font-ui-mono text-[10.5px] font-normal text-[#6f6f79]">
                {free && k.kind === "widget" ? `${counts.widget} · ${free.itemCount} items` : counts[k.kind]}
              </span>
            </button>
          );
        })}
      </div>

      {free && kind === "widget" && (
        <div className="shrink-0 px-2.5 pt-2.5">
          <Segmented label="Show" className="w-full flex-nowrap [&>button]:flex-1" value={free.filter} onChange={(f) => { free.onFilter(f); reset(); }} options={FILTERS} />
        </div>
      )}

      {showChips && (
        <div className="relative shrink-0">
          <div ref={chipsRef} className="add-chips flex gap-1.5 overflow-x-auto px-2.5 pb-0.5 pt-2.5">
            {["All", ...categoriesOf(catalog.widget)].map((c) => {
              const Icon = c === "All" ? LayoutGrid : iconFor(CHIP_ICONS[c] ?? "sensors");
              const on = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={(e) => pickCategory(c, e.currentTarget)}
                  className={cn(
                    "flex h-[26px] shrink-0 items-center gap-[5px] rounded-[13px] border pl-2 pr-2.5 text-[12px]",
                    FOCUS,
                    on ? "border-[#ededf0] bg-[#ededf0] text-[#0c0c0e]" : "border-[#26262c] text-[#a1a1aa] hover:text-ui-1"
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
                  {c}
                </button>
              );
            })}
            <span aria-hidden className="w-6 shrink-0" />
          </div>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-r from-transparent to-ui-panel" />
        </div>
      )}

      {target && (
        <div className="mx-2.5 mt-2.5 flex shrink-0 items-center gap-2.5 rounded-[8px] border border-[oklch(0.72_0.15_255/0.35)] bg-[oklch(0.72_0.15_255/0.10)] px-2.5 py-[9px]">
          <SquareDashedMousePointer className="h-[18px] w-[18px] shrink-0 text-[oklch(0.82_0.12_255)]" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ui-1">
              Filling blank zone · <span className="font-ui-mono text-[11.5px]">{sizeText(target.cols, target.rows)}</span>
            </div>
            <div className="truncate text-[11.5px] text-[#a1a1aa]">Click a widget to fill it.</div>
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
        aria-label={KINDS.find((k) => k.kind === kind)?.label}
        onWheel={() => card && hl?.via === "mouse" && setCard(null)}
        onMouseLeave={() => {
          clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(reset, HIDE_MS);
        }}
        className="relative mt-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 pt-1"
      >
        {rows.length === 0 && query.trim() && !freeItems ? (
          <div className="flex flex-col items-start gap-2.5 px-2 py-5">
            <div className="text-[12.5px] font-medium text-ui-1">Nothing matches “{query.trim()}”</div>
            <p className="text-[12px] leading-[1.5] text-[#8a8a94]">
              A Sensor shows any single value from your data sources, so it covers most things a dedicated widget doesn’t.
            </p>
            {sensor && (
              <button
                type="button"
                onClick={() => add(sensor)}
                className={cn("flex h-7 items-center gap-1.5 rounded-md bg-[#ededf0] px-2.5 text-[12px] font-semibold text-[#0c0c0e]", FOCUS)}
              >
                {(() => {
                  const Icon = iconFor("sensors");
                  return <Icon className="h-4 w-4" aria-hidden />;
                })()}
                Add a Sensor
              </button>
            )}
            {elsewhere && (
              <button type="button" onClick={() => pickKind(elsewhere.kind)} className={cn("text-[12px] text-ui-accent-text hover:underline", FOCUS)}>
                {elsewhere.n} {elsewhere.one}
                {elsewhere.n === 1 ? "" : "s"} match in {elsewhere.label} →
              </button>
            )}
          </div>
        ) : (
          groups.map((g, gi) => (
            <section key={`${gi}:${g.title}`} aria-label={g.title}>
              <div className="sticky top-0 z-10 flex items-baseline gap-1.5 bg-ui-panel px-1.5 pb-1.5 pt-2.5 font-ui-mono text-[10px] uppercase tracking-[0.06em]">
                <span className="text-[#8a8a94]">{g.title}</span>
                <span className="text-[#55555e]">{g.items.length}</span>
              </div>
              {g.items.map((item) => {
                const index = rows.findIndex((r) => r.gi === gi && r.item === item);
                return (
                  <AddRow
                    key={item.id}
                    item={item}
                    id={optionId(index)}
                    highlighted={hl?.index === index}
                    compact={compact}
                    tag={tagOf(item)}
                    onPick={() => add(item)}
                    onHover={() => hover(index)}
                    onDragStart={reset}
                    onRename={item.saved ? (name) => onRenamePreset(item.id, name) : undefined}
                    onDelete={item.saved ? () => onDeletePreset(item.id) : undefined}
                    status={free?.status?.(item)}
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
        {freeItems && (
          <section aria-label="InfoPanel items" className="px-1 pt-1">
            <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-ui-panel px-0.5 pb-0.5 pt-2.5">
              <span className="font-ui-mono text-[10px] uppercase tracking-[0.06em] text-[#8a8a94]">InfoPanel items</span>
              {free?.grid && <span className="text-[11px] text-ui-warning">Makes a free area here</span>}
            </div>
            {freeItems}
          </section>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-ui-subtle px-3 py-2 text-[11px] text-[#6f6f79]">
        <span>
          <kbd className={KEYCAP}>↑↓</kbd> browse
        </span>
        <span>
          <kbd className={KEYCAP}>Enter</kbd> add
        </span>
        <span>Drag to place</span>
      </div>

      {current && card && hl && (
        <AddPreview
          item={current}
          left={card.left}
          top={card.top}
          via={hl.via}
          target={target}
          appearance={appearance}
          pageStyle={pageStyle}
        />
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
      className={cn("flex w-full items-center gap-2.5 rounded-[8px] px-2 text-left hover:bg-[#1c1c21]", compact ? "h-10" : "h-[52px]", FOCUS)}
    >
      <span className={cn("flex shrink-0 items-center justify-center rounded-[8px] border border-ui-default bg-ui-raised text-[#c8c8ce]", compact ? "h-7 w-7" : "h-[34px] w-[34px]")}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12.5px] font-medium text-ui-1">{title}</span>
        {!compact && <span className="truncate text-[11.5px] text-[#8a8a94]">{note}</span>}
      </span>
    </button>
  );
}
