/**
 * The Library's sidebar, Grid and Shelves views (spec §3, §10.4). Single-click selects a card,
 * double-click opens it, and every card drags onto the canvas (§8).
 */
import { useRef, type ReactNode } from "react";
import {
  Ban,
  ChevronRight,
  Clock,
  Copy,
  Film,
  FileCode,
  Gauge,
  Palette,
  PenTool,
  HardDrive,
  Image,
  ImagePlus,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  Paintbrush,
  Shapes,
  Sparkles,
  SprayCan,
  ListChecks,
  Trash2,
  Type,
  Wallpaper,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/lib/library";
import { setActiveLibraryDrag, setLibraryDrag } from "@/lib/my-library/drag";
import { isOlderItem } from "@/lib/my-library/item-format";
import { COLLECTIONS, SORTS, cardTag, cleanupCounts, flagOf, isDraggable, type CollectionId, type LibraryIndex, type SortId } from "@/lib/my-library/model";
import { AssetThumb } from "./asset-thumb";
import type { ClickMod } from "./multi-delete";

export const COLLECTION_ICON: Record<CollectionId, LucideIcon> = {
  all: LayoutGrid,
  media: Image,
  recent: Clock,
  unused: Ban,
  large: HardDrive,
  duplicates: Copy,
  suggested: Sparkles,
  images: Image,
  videos: Film,
  backgrounds: Wallpaper,
  icons: Shapes,
  svg: FileCode,
  fonts: Type,
  builtinfonts: Type,
  ptemplates: PenTool,
  gauges: Gauge,
  panels: LayoutDashboard,
  styles: Paintbrush,
  canvases: Layers,
  components: Shapes,
  templates: LayoutTemplate,
};

/* ---- sidebar ---- */

export function LibrarySidebar({ active, counts, onPick, onOpenTheme }: { active: CollectionId | null; counts: Record<CollectionId, number>; onPick: (id: CollectionId) => void; onOpenTheme: () => void }) {
  const sections = [
    ["Smart", "Smart"],
    ["Library", "By type"],
  ] as const;
  return (
    <nav aria-label="Collections" className="flex w-[216px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-ui-subtle bg-ui-panel px-2 py-3.5 font-ui max-sm:w-full max-sm:flex-row max-sm:gap-1.5 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:border-b max-sm:border-r-0 max-sm:py-2 max-sm:[scrollbar-width:none]">
      {sections.map(([s, title]) => (
        <div key={s} className="max-sm:flex max-sm:gap-1.5">
          <div className="px-2 pb-1.5 text-[10.5px] font-medium uppercase tracking-[.08em] text-ui-4 max-sm:hidden">{title}</div>
          {COLLECTIONS.filter((c) => c.section === s).map((c) => {
            const Icon = COLLECTION_ICON[c.id];
            return (
              <button
                key={c.id}
                type="button"
                aria-current={active === c.id ? "page" : undefined}
                onClick={() => onPick(c.id)}
                className={cn(
                  "flex h-[30px] w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[12.5px] text-ui-2 hover:bg-ui-hover max-sm:h-9 max-sm:w-auto max-sm:shrink-0 max-sm:whitespace-nowrap",
                  c.parent && "pl-7 max-sm:pl-2",
                  active === c.id && "bg-ui-active text-ui-1 hover:bg-ui-active",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <span className="font-ui-mono text-[11px] text-ui-4">{counts[c.id]}</span>
              </button>
            );
          })}
        </div>
      ))}
      <button
        type="button"
        onClick={onOpenTheme}
        className="flex min-h-[30px] w-full items-center gap-2.5 rounded-[7px] px-2 py-1 text-left text-[12.5px] text-ui-3 hover:bg-ui-hover hover:text-ui-1 max-sm:h-9 max-sm:w-auto max-sm:shrink-0 max-sm:whitespace-nowrap"
      >
        <Palette className="h-4 w-4 shrink-0 text-ui-4" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">Themes, palettes and skins are in Theme →</span>
      </button>
    </nav>
  );
}

/* ---- cards ---- */

interface CardProps {
  item: LibraryItem;
  index: LibraryIndex;
  selected: boolean;
  /** Part of a multi-selection (a ticked box). */
  checked?: boolean;
  /** Select mode: every card shows its box, and a click toggles it. */
  selectMode?: boolean;
  onSelect: (mod: ClickMod) => void;
  onOpen: () => void;
  /** Right-click (or the menu key) at a viewport point. */
  onMenu?: (x: number, y: number) => void;
  /** Delete / Backspace on the focused card. */
  onRemove?: () => void;
  /** A suggestion's reason line (Shelves). */
  reason?: string;
  className?: string;
}

export function LibraryCard({ item, index, selected, checked, selectMode, onSelect, onOpen, onMenu, onRemove, reason, className }: CardProps) {
  const flag = flagOf(item, index);
  const tag = cardTag(item);
  return (
    <div
      role="option"
      aria-selected={selected || checked}
      tabIndex={0}
      draggable={isDraggable(item)}
      onDragStart={(e) => {
        setLibraryDrag(e.dataTransfer, { libraryItemId: item.id, kind: item.kind });
        setActiveLibraryDrag(item);
      }}
      onClick={(e) => onSelect({ toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onSelect({ toggle: false, range: false });
        // The menu key fires at 0,0: open from the card instead.
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX === 0 && e.clientY === 0) onMenu(r.left + 12, r.top + 12);
        else onMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        // The card's own keys, not a field's or a button's inside it.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") onOpen();
        if ((e.key === "Delete" || e.key === "Backspace") && onRemove && !e.repeat) {
          e.preventDefault();
          onRemove();
        }
        if (e.key === " ") {
          e.preventDefault();
          onSelect({ toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col gap-2 rounded-[12px] border border-ui-subtle bg-ui-panel p-1.5 pb-2.5 outline-none hover:border-ui-default focus-visible:border-ui-accent",
        (selected || checked) && "border-ui-accent bg-ui-accent/[.06] hover:border-ui-accent",
        className,
      )}
    >
      <div className="relative">
        <AssetThumb item={item} className="aspect-[4/3] w-full" />
        {(selectMode || checked) && (
          <input
            type="checkbox"
            aria-label={`Select ${item.name}`}
            checked={!!checked}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ toggle: true, range: e.shiftKey });
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute left-1.5 top-1.5 h-4 w-4 cursor-pointer accent-[var(--ui-accent)]"
          />
        )}
        {flag && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 rounded-[4px] px-1.5 py-px text-[10.5px] font-medium",
              flag === "Duplicate" ? "bg-ui-warning text-black" : "bg-[#2a1d0a] text-ui-warning",
            )}
          >
            {flag}
          </span>
        )}
        {isOlderItem(item) && (
          <span title="Saved by an older version: open it to update" className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-[#2a1d0a] px-1.5 py-px text-[10.5px] font-medium text-ui-warning">
            Older version
          </span>
        )}
      </div>
      <div className="min-w-0 px-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ui-1">{item.name}</span>
          <span
            className={cn(
              "shrink-0 rounded-[4px] border border-ui-default px-1.5 py-px text-[10px]",
              tag.builtin ? "text-ui-4" : "text-ui-accent-text",
            )}
          >
            {tag.text}
          </span>
        </div>
        {reason && (
          <div className="mt-0.5 flex gap-1 text-[11px] leading-snug text-ui-accent-text">
            <Sparkles className="mt-px h-3 w-3 shrink-0" />
            {reason}
          </div>
        )}
      </div>
    </div>
  );
}

/** The dashed first tile: drop files or click. */
export function UploadTile({ onFiles, wide }: { onFiles: (files: File[]) => void; wide?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-ui-strong bg-transparent p-4 text-center text-ui-3 hover:border-ui-accent hover:text-ui-1",
        wide ? "col-span-full min-h-[220px]" : "min-h-[180px]",
      )}
    >
      <ImagePlus className="h-6 w-6" strokeWidth={1.5} />
      <span className="text-[12.5px]">{wide ? "Drop images, videos, fonts or an .infopanel here" : "Drop files or click"}</span>
      <span className="text-[11px] text-ui-4">Images, video, SVG, fonts, .infopanel</span>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </button>
  );
}

/* ---- grid ---- */

export interface GridViewProps {
  title: string;
  items: LibraryItem[];
  index: LibraryIndex;
  tags: string[];
  tag: string | null;
  onTag: (tag: string | null) => void;
  sort: SortId;
  onSort: (sort: SortId) => void;
  /** All items, no search: the cleanup banner shows. */
  showCleanup: boolean;
  onCollection: (id: CollectionId) => void;
  selectedId: string | null;
  /** The cards ticked for a multi-delete. */
  picked: readonly string[];
  selectMode: boolean;
  onSelectMode: (on: boolean) => void;
  onPickAll: () => void;
  onClearPicked: () => void;
  onDeletePicked: () => void;
  onSelect: (item: LibraryItem, mod: ClickMod) => void;
  onOpen: (item: LibraryItem) => void;
  /** Right-click on a card at a viewport point. */
  onMenu?: (item: LibraryItem, x: number, y: number) => void;
  /** Delete on a focused card. */
  onRemove?: (item: LibraryItem) => void;
  onFiles: (files: File[]) => void;
  /** A search found nothing. */
  searching: boolean;
  /** The library is empty: the upload tile fills the grid. */
  empty: boolean;
  /** The collection holds uploads (media, all): it starts with the upload tile. */
  uploadTile: boolean;
  /** The collection's hint line (SPEC §10.4). */
  hint?: string;
  /** A collection-wide action in the header (Not used: remove them all). */
  action?: { label: string; title?: string; disabled?: boolean; onRun: () => void };
}

export function GridView(p: GridViewProps) {
  const c = cleanupCounts(p.index);
  const cleanup = p.showCleanup && c.duplicates + c.unused + c.large > 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-ui-subtle bg-ui-app/95 px-5 py-2 backdrop-blur">
        <h2 className="text-[15px] font-semibold text-ui-1">{p.title}</h2>
        <span className="mr-2 font-ui-mono text-[11px] text-ui-4">{p.items.length} items</span>
        {p.tags.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={p.tag === t}
            onClick={() => p.onTag(p.tag === t ? null : t)}
            className={cn(
              "h-[26px] rounded-full border border-ui-default px-2.5 text-[11.5px] text-ui-2 hover:border-ui-strong",
              p.tag === t && "border-ui-accent bg-ui-accent/15 text-ui-1",
            )}
          >
            {t}
          </button>
        ))}
        <span className="flex-1" />
        {p.picked.length > 0 && (
          <>
            <span className="font-ui-mono text-[11.5px] text-ui-2">{p.picked.length} selected</span>
            <button type="button" onClick={p.onPickAll} className="h-[28px] rounded-[7px] px-2 text-[12px] text-ui-3 hover:text-ui-1">
              Select all
            </button>
            <button type="button" onClick={p.onClearPicked} className="h-[28px] rounded-[7px] px-2 text-[12px] text-ui-3 hover:text-ui-1">
              Clear
            </button>
            <button
              type="button"
              onClick={p.onDeletePicked}
              className="flex h-[28px] items-center gap-1.5 rounded-[7px] border border-ui-danger/50 px-2.5 text-[12px] text-ui-danger hover:bg-ui-danger/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete…
            </button>
          </>
        )}
        <button
          type="button"
          aria-pressed={p.selectMode}
          onClick={() => p.onSelectMode(!p.selectMode)}
          title="Tick cards to select several, then delete them together. Ctrl or Shift and click does the same."
          className={cn("flex h-[28px] items-center gap-1.5 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover", p.selectMode && "bg-ui-active")}
        >
          <ListChecks className="h-3.5 w-3.5" />
          Select
        </button>
        {p.action && (
          <button
            type="button"
            onClick={p.action.onRun}
            disabled={p.action.disabled}
            title={p.action.title}
            className="flex h-[28px] items-center gap-1.5 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover hover:text-ui-danger disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {p.action.label}
          </button>
        )}
        <label className="flex items-center gap-1.5 text-[11.5px] text-ui-4">
          <span className="sr-only">Sort</span>
          <select
            value={p.sort}
            onChange={(e) => p.onSort(e.target.value as SortId)}
            className="h-[28px] rounded-[7px] border border-ui-default bg-ui-panel px-2 text-[12px] text-ui-2"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {p.hint && <p className="mb-3 text-[11.5px] text-ui-4">{p.hint}</p>}
        {cleanup && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-ui-subtle bg-ui-panel px-4 py-2.5 text-[12.5px] text-ui-2">
            <SprayCan className="h-4 w-4 text-ui-warning" />
            <span className="flex-1">
              {[
                c.duplicates && `${c.duplicates} duplicate${c.duplicates === 1 ? "" : "s"}`,
                c.unused && `${c.unused} not used`,
                c.large && `${c.large} large file${c.large === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {c.duplicates > 0 && <BannerButton onClick={() => p.onCollection("duplicates")}>Duplicates</BannerButton>}
            {c.unused > 0 && <BannerButton onClick={() => p.onCollection("unused")}>Not used</BannerButton>}
            {c.large > 0 && <BannerButton onClick={() => p.onCollection("large")}>Large files</BannerButton>}
          </div>
        )}
        {p.searching && p.items.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-ui-4">Nothing matches. Every word must match a name, tag, type or size.</p>
        ) : (
          <div role="listbox" aria-label={p.title} className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {!p.searching && p.uploadTile && <UploadTile onFiles={p.onFiles} wide={p.empty} />}
            {p.items.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                index={p.index}
                selected={p.selectedId === item.id}
                checked={p.picked.includes(item.id)}
                selectMode={p.selectMode}
                onSelect={(mod) => p.onSelect(item, mod)}
                onOpen={() => p.onOpen(item)}
                onMenu={p.onMenu && ((x, y) => p.onMenu?.(item, x, y))}
                onRemove={p.onRemove && (() => p.onRemove?.(item))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const BannerButton = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="h-[28px] rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover">
    {children}
  </button>
);

/* ---- shelves ---- */

export interface ShelvesViewProps {
  index: LibraryIndex;
  shelves: { id: CollectionId; title: string; note: string; items: LibraryItem[] }[];
  /** "Needs attention": one card per finding with its action. */
  attention: { id: string; title: string; text: string; action: string; onAction: () => void }[];
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  onOpen: (item: LibraryItem) => void;
  /** Right-click on a card at a viewport point. */
  onMenu?: (item: LibraryItem, x: number, y: number) => void;
  /** Delete on a focused card. */
  onRemove?: (item: LibraryItem) => void;
  onSeeAll: (id: CollectionId) => void;
}

export function ShelvesView(p: ShelvesViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {p.attention.length > 0 && (
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {p.attention.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-[12px] border border-ui-subtle bg-ui-panel p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-ui-warning/15 text-ui-warning">
                {a.id === "duplicates" ? <Copy className="h-4 w-4" /> : a.id === "unused" ? <Ban className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-ui-1">{a.title}</div>
                <div className="text-[11.5px] leading-snug text-ui-4">{a.text}</div>
              </div>
              <BannerButton onClick={a.onAction}>{a.action}</BannerButton>
            </div>
          ))}
        </div>
      )}
      {p.shelves
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <section key={s.id} aria-label={s.title} className="mb-6">
            <div className="mb-2.5 flex items-baseline gap-2">
              <h3 className="text-[14px] font-semibold text-ui-1">{s.title}</h3>
              <span className="text-[12px] text-ui-4">{s.note}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => p.onSeeAll(s.id)} className="flex items-center gap-0.5 text-[12px] text-ui-3 hover:text-ui-1">
                See all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div role="listbox" aria-label={s.title} className="flex gap-3 overflow-x-auto pb-2">
              {s.items.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  index={p.index}
                  selected={p.selectedId === item.id}
                  onSelect={() => p.onSelect(item)}
                  onOpen={() => p.onOpen(item)}
                onMenu={p.onMenu && ((x, y) => p.onMenu?.(item, x, y))}
                onRemove={p.onRemove && (() => p.onRemove?.(item))}
                  reason={s.id === "suggested" ? p.index.suggested.find((x) => x.item.id === item.id)?.reason : undefined}
                  className="w-[196px] shrink-0"
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
