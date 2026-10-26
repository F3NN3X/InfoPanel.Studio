/**
 * The New wizard's gallery pane: the toolbar (search, the shape chips with their counts, the sort) and the ways in,
 * pinned; under them the sections (`gallery-sections.ts`) as grids of template cards, which scroll. A card is its live
 * picture at the size it is drawn at, the name and that size, the blurb, its palettes as swatches (a click picks the
 * template in that palette), a tag when it doesn't fit the size set here, and how many of its sensors this PC has.
 * Click selects at the size shown, double-click or Enter creates, the arrow keys walk every card in order. While the
 * templates load, a status line and skeleton cards stand in; a search with no match says so, with a way out.
 */
import type { ComponentType, ReactNode, RefObject } from "react";
import { Check, Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryCard, GallerySection, SortBy } from "./gallery-sections";
import { WaysIn, type WayIn } from "./new-wizard";
import { ShapeChips, type ShapeFilter } from "./shape-chips";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";

interface WizardGalleryProps {
  query: string;
  onQuery: (q: string) => void;
  /** Enter in the search: select the first result. */
  onSearchEnter: () => void;
  filter: ShapeFilter;
  onFilter: (f: ShapeFilter) => void;
  /** The chips' counts; none while the templates load. */
  counts?: Readonly<Record<ShapeFilter, number>>;
  sort: SortBy;
  onSort: (s: SortBy) => void;
  ways: readonly WayIn[];
  /** The templates haven't loaded yet. */
  loading: boolean;
  sections: readonly GallerySection[];
  onStartBlank: () => void;
  /** The selected card's id (null: Blank). */
  selected: string | null;
  paletteOf: (card: GalleryCard) => string;
  /** A card was clicked (with a palette when a swatch was). */
  onPick: (card: GalleryCard, palette?: string) => void;
  onCreate: (card: GalleryCard) => void;
  /** An arrow key on a card: move the selection by one in the visual order. */
  onStep: (id: string, by: 1 | -1) => void;
  thumb: (card: GalleryCard) => ReactNode;
  /** The sensor badge, the card's fit tag. */
  badge: (card: GalleryCard) => ReactNode;
  tag: (card: GalleryCard) => string | undefined;
  /** Drawn once beside the cards (the screens' offscreen pictures). */
  host?: ComponentType;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Over the sections: the expanded preview. */
  overlay?: ReactNode;
}

export const sectionId = (key: string) => `new-wizard-section-${key}`;

const SORTS: readonly [SortBy, string][] = [
  ["shape", "By shape"],
  ["az", "A–Z"],
];

export function WizardGallery(p: WizardGalleryProps) {
  const Host = p.host;
  const noResults = !p.loading && p.query.trim() !== "" && p.sections.length === 0;
  const tabbable = p.selected !== null && p.sections.some((s) => s.cards.some((c) => c.entry.id === p.selected)) ? p.selected : p.sections[0]?.cards[0]?.entry.id;
  return (
    <>
      {Host && <Host />}
      <div className="flex shrink-0 flex-col gap-3 border-b border-ui-subtle px-5 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-7 w-[250px] items-center gap-2 rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-ui-4 focus-within:border-ui-accent">
            <Search aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates, widgets, sensors"
              value={p.query}
              onChange={(e) => p.onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  p.onSearchEnter();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-ui-1 outline-none placeholder:text-ui-4 focus-visible:shadow-none [&::-webkit-search-cancel-button]:hidden"
            />
            {p.query && (
              <button type="button" aria-label="Clear the search" onClick={() => p.onQuery("")} className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-ui-3 hover:text-ui-1">
                <X className="h-3 w-3" />
              </button>
            )}
          </label>
          <ShapeChips filter={p.filter} onFilter={p.onFilter} counts={p.counts} className="" />
          <span className="flex-1" />
          <div role="radiogroup" aria-label="Sort" className="flex rounded-[7px] border border-ui-default p-0.5">
            {SORTS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={p.sort === k}
                onClick={() => p.onSort(k)}
                className={cn("h-[22px] rounded-[5px] px-2 text-[11.5px]", p.sort === k ? "bg-ui-active text-ui-1" : "text-ui-3 hover:text-ui-1")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <WaysIn items={p.ways} />
      </div>
      <div ref={p.scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 pb-6 pt-3.5">
          {p.loading ? (
            <Skeleton />
          ) : noResults ? (
            <NoResults query={p.query} onStartBlank={p.onStartBlank} onClear={() => p.onQuery("")} />
          ) : (
            p.sections.map((s) => (
              <section key={s.key} id={sectionId(s.key)} aria-labelledby={`${sectionId(s.key)}-title`} className="flex scroll-mt-3.5 flex-col gap-2">
                <h3 className="m-0 flex items-baseline gap-2 text-[12px] font-medium text-ui-2">
                  <span id={`${sectionId(s.key)}-title`}>{s.title}</span>
                  {s.count !== undefined && <span className="font-ui-mono text-[10.5px] font-normal text-ui-4">{s.count}</span>}
                  {s.note && <span className="truncate text-[11px] font-normal text-ui-4">{s.note}</span>}
                </h3>
                <div role="radiogroup" aria-label={s.title} className="grid items-start gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${s.min}px, 1fr))` }}>
                  {s.cards.map((card) => (
                    <Card key={card.entry.id} card={card} p={p} selected={p.selected === card.entry.id} tabbable={tabbable === card.entry.id} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
      {p.overlay}
    </>
  );
}

function Card({ card, p, selected, tabbable }: { card: GalleryCard; p: WizardGalleryProps; selected: boolean; tabbable: boolean }) {
  const { entry, size } = card;
  const tall = shapeClassOf(size.width, size.height) === "tall";
  const palette = p.paletteOf(card);
  const tag = p.tag(card);
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-label={entry.name}
      tabIndex={tabbable ? 0 : -1}
      data-card={entry.id}
      onClick={() => p.onPick(card)}
      onDoubleClick={() => p.onCreate(card)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") {
          e.preventDefault();
          p.onCreate(card);
        } else if (e.key === " ") {
          e.preventDefault();
          p.onPick(card);
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          p.onStep(entry.id, e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1);
        }
      }}
      className={cn(
        "group flex min-w-0 cursor-pointer select-none flex-col overflow-hidden rounded-[9px] border outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
        selected ? "border-ui-accent bg-ui-accent/10" : "border-ui-default bg-ui-raised hover:ring-1 hover:ring-ui-strong",
      )}
    >
      <div className="relative w-full overflow-hidden border-b border-ui-subtle bg-ui-app" style={{ aspectRatio: tall ? "4 / 5" : `${size.width} / ${size.height}` }}>
        <div className={cn("relative", tall ? "mx-auto h-full" : "h-full w-full")} style={tall ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
          {p.thumb(card)}
        </div>
        {selected && (
          <span aria-hidden className="absolute right-1.5 top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-ui-accent text-ui-inverse-fg">
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-[9px] pb-2 pt-[7px]">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ui-1">{entry.name}</span>
          <span className="shrink-0 font-ui-mono text-[10.5px] text-ui-4">
            {size.width}×{size.height}
          </span>
        </div>
        <span className="truncate text-[11px] text-ui-3" title={entry.blurb}>
          {entry.blurb}
        </span>
        <div className="mt-[5px] flex min-h-[16px] items-center gap-1.5">
          {/* The swatches give way first when the row is short of room: those that would wrap are hidden. */}
          <div className="flex h-[18px] min-w-0 flex-1 flex-wrap gap-1.5 overflow-hidden p-0.5">
          {entry.palettes.length > 1 &&
            entry.palettes.map((v) => (
              <button
                key={v.id}
                type="button"
                tabIndex={-1}
                aria-label={`${entry.name} · ${v.name}`}
                title={`${entry.name} · ${v.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onPick(card, v.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className={cn("h-3.5 w-3.5 shrink-0 rounded-full ring-[1.5px]", v.id === palette ? "ring-ui-1" : "ring-white/15")}
                style={{ background: `linear-gradient(135deg, ${v.swatch[0]} 0 42%, ${v.swatch[1]} 42% 58%, ${v.swatch[2]} 58%)` }}
              />
            ))}
          </div>
          {tag && (
            <span className={cn("shrink-0 whitespace-nowrap rounded-[4px] px-[5px] py-px text-[10px]", card.library ? "bg-ui-accent/15 text-ui-accent-text" : "bg-ui-warning/15 text-ui-warning")}>{tag}</span>
          )}
          {p.badge(card)}
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <p role="status" className="m-0 flex items-center gap-2 text-[12px] text-ui-3">
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-ui-strong border-t-ui-3" />
        Loading templates… Blank, the sample layout and Import work now.
      </p>
      <div aria-hidden className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(188px, 1fr))" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-[9px] border border-ui-subtle" style={{ opacity: 1 - i * 0.07 }}>
            <div className="w-full bg-gradient-to-b from-ui-raised to-ui-hover" style={{ aspectRatio: "1024 / 600" }} />
            <div className="flex flex-col gap-1.5 p-2.5">
              <span className="h-2 w-1/2 rounded bg-ui-hover" />
              <span className="h-2 w-4/5 rounded bg-ui-raised" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function NoResults({ query, onStartBlank, onClear }: { query: string; onStartBlank: () => void; onClear: () => void }) {
  return (
    <div className="mx-auto mt-12 flex max-w-[360px] flex-col items-center gap-2 text-center">
      <SearchX aria-hidden className="h-7 w-7 text-ui-4" strokeWidth={1.5} />
      <p className="m-0 text-[12.5px] font-semibold text-ui-1">No template matches “{query.trim()}”</p>
      <p className="m-0 text-[12px] leading-normal text-ui-3">
        Search covers names, the widgets a template uses and the sensors it reads. Start blank and add widgets yourself, or clear the search.
      </p>
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={onStartBlank} className="h-7 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover">
          Start blank
        </button>
        <button type="button" onClick={onClear} className="h-7 rounded-[7px] px-3 text-[12.5px] text-ui-2 hover:text-ui-1">
          Clear search
        </button>
      </div>
    </div>
  );
}
