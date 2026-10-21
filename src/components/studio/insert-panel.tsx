import { useState } from "react";
import { Search } from "lucide-react";
import { BLANK_MODULE, CARDS_ID } from "@/lib/layout";
import type { UserPanelPreset } from "@/lib/panel-model";
import { allPanelPresets, type PanelPreset } from "@/lib/panelPresets";
import { cn } from "@/lib/utils";
import { defaultDropSize, dropSize } from "./drop-ghost";
import { InsertRow, type InsertContext } from "./insert-row";
import { ALL_MODULES } from "./studio-modules";

export type { InsertContext } from "./insert-row";

export const INSERT_CATEGORIES = [
  "All",
  "Layouts",
  "My panels",
  "System",
  "Hardware",
  "Storage",
  "Network",
  "Media",
  "Audio",
  "Info",
  "Gaming",
  "Generic",
] as const;
export type InsertCategory = (typeof INSERT_CATEGORIES)[number];

const isInsertCategory = (c: string | undefined): c is InsertCategory =>
  INSERT_CATEGORIES.includes(c as InsertCategory);

/** The "Other sensors" card's description (the card appends "· min W×H"); a module brings its own. */
const CARDS_DESCRIPTION = "Every other sensor";

/** Category per built-in panel preset id; anything not listed is "Generic". */
const PRESET_CATEGORIES: Record<string, InsertCategory> = {
  system: "System",
  ram: "System",
  cpu: "System",
  gpu: "System",
  fps: "System",
  network: "Network",
  weather: "Info",
  clock: "Info",
};

/** A panel preset's category: saved panels, layout starters, else by id. */
function presetCategory(p: PanelPreset): InsertCategory {
  if (p.user) return "My panels";
  if (p.id.startsWith("layout-")) return "Layouts";
  return PRESET_CATEGORIES[p.id] ?? "Generic";
}

interface InsertableBase {
  id: string;
  title: string;
  description?: string;
  /** Minimum zone footprint (grid cells). */
  cols: number;
  rows: number;
  category: InsertCategory;
  /** A Library icon name from the module (`widgets/core/icons.ts`); unset: the studio's own table. */
  icon?: string;
  /** The footprint a widget declares for a drop (cols, rows); never below its minimum. */
  defaultSize?: [number, number];
}

/** Something the Add panel can insert: a widget module or a panel preset. */
export type Insertable =
  | (InsertableBase & { kind: "module" })
  | (InsertableBase & { kind: "panel"; preset: PanelPreset });

/** The first card of Layout starters: an empty zone to fill later. */
const BLANK_ZONE: Insertable = {
  kind: "module",
  id: BLANK_MODULE,
  title: "Blank zone",
  description: "Pick a widget later",
  cols: 2,
  rows: 1,
  category: "Layouts",
};

/** The blank zone card (a panel preset can share its id "blank"). */
export const isBlankZone = (i: Insertable): boolean => i.kind === "module" && i.id === BLANK_MODULE;

/** Every widget, the blank zone, layout starter, panel preset and saved panel, categorised. */
export function insertables(saved?: UserPanelPreset[]): Insertable[] {
  return [
    ...ALL_MODULES.map(
      (m): Insertable => ({
        kind: "module",
        id: m.id,
        title: m.title,
        description: m.description ?? (m.id === CARDS_ID ? CARDS_DESCRIPTION : undefined),
        cols: m.minCols,
        rows: m.minRows,
        category: isInsertCategory(m.category) ? m.category : "Generic",
        icon: m.icon,
        defaultSize: m.defaultSize,
      })
    ),
    BLANK_ZONE,
    ...allPanelPresets(saved).map(
      (p): Insertable => ({
        kind: "panel",
        id: p.id,
        title: p.title,
        description: p.description,
        cols: p.colSpan,
        rows: p.rowSpan,
        category: presetCategory(p),
        preset: p,
      })
    ),
  ];
}

/**
 * Items matching the category ("All" = any) and every word of the query
 * (case-insensitive, against title, id and description).
 */
export function filterInsertables<T extends InsertableBase>(
  items: T[],
  query: string,
  category: InsertCategory
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    const haystack = `${item.title} ${item.id} ${item.description ?? ""}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/**
 * The footprint an item takes when placed on a grid: a widget drops at its declared default
 * size, else at least 3×2 (its minimum if larger), a panel at its own size; all kept inside the grid.
 */
export function insertDropSize(item: Insertable, grid: { cols: number; rows: number }): { cols: number; rows: number } {
  const min = { cols: item.cols, rows: item.rows };
  if (item.kind === "module") return item.defaultSize ? defaultDropSize(item.defaultSize, min, grid) : dropSize(min, grid);
  return { cols: Math.min(grid.cols, item.cols), rows: Math.min(grid.rows, item.rows) };
}

export interface InsertGroup {
  title: string;
  items: Insertable[];
}

const WIDGET_GROUPS: InsertCategory[] = ["System", "Hardware", "Storage", "Network", "Media", "Audio", "Info", "Gaming", "Generic"];

/**
 * The non-empty groups of a (filtered) list: the widgets by category, then
 * Layout starters (the blank zone and the six starters), Panel presets and
 * My panels.
 */
export function insertGroups(items: Insertable[]): InsertGroup[] {
  const panels = items.filter((i) => i.kind === "panel");
  const groups: InsertGroup[] = [
    ...WIDGET_GROUPS.map((c) => ({
      title: c,
      items: items.filter((i) => i.kind === "module" && !isBlankZone(i) && i.category === c),
    })),
    {
      title: "Layout starters",
      items: items.filter((i) => isBlankZone(i) || (i.kind === "panel" && i.category === "Layouts")),
    },
    {
      title: "Panel presets",
      items: panels.filter((i) => i.category !== "Layouts" && i.category !== "My panels"),
    },
    {
      title: "My panels",
      items: panels.filter((i) => i.category === "My panels"),
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

interface InsertListProps {
  items: Insertable[];
  /** Add the item (a click on its card). */
  onPick: (item: Insertable) => void;
  /**
   * Where the list lives: the Add panel (cards drag onto the canvas) or the
   * widget picker (a click picks for the zone).
   */
  context: InsertContext;
  /** The grid items are placed on: cards show the size they drop with (else their minimum). */
  grid?: { cols: number; rows: number };
  /** Rename / delete a saved panel (its card's "⋯"). */
  onRenamePreset?: (id: string, name: string) => void;
  onDeletePreset?: (id: string) => void;
}

const GROUP_LABEL = "text-[11px] font-medium uppercase tracking-wider text-ui-4";

/**
 * The insertable widgets, layout starters, panels and saved panels as
 * groups of cards in two columns. Reusable outside the panel (the widget
 * picker passes `context="picker"`).
 */
export function InsertList({
  items,
  onPick,
  context,
  grid,
  onRenamePreset,
  onDeletePreset,
}: InsertListProps) {
  if (items.length === 0) return <p className="text-xs text-ui-4">Nothing matches.</p>;
  return (
    <div className="space-y-4">
      {insertGroups(items).map((g) => (
        <section key={g.title} className="space-y-2">
          <div className={GROUP_LABEL}>{g.title}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {g.items.map((item) => (
              <InsertRow
                key={`${item.kind}:${item.id}`}
                item={item}
                context={context}
                size={grid ? insertDropSize(item, grid) : { cols: item.cols, rows: item.rows }}
                onPick={() => onPick(item)}
                saved={
                  item.category === "My panels" && onRenamePreset && onDeletePreset
                    ? { onRename: (name) => onRenamePreset(item.id, name), onDelete: () => onDeletePreset(item.id) }
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Search box + category chips over an insertable list. */
export function InsertFilters({
  query,
  onQuery,
  category,
  onCategory,
  autoFocus,
}: {
  query: string;
  onQuery: (query: string) => void;
  category: InsertCategory;
  onCategory: (category: InsertCategory) => void;
  /** Focus the search box on mount (dialogs). */
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <label className="flex h-[30px] items-center gap-1.5 rounded-[7px] border border-ui-default bg-ui-app px-2">
        <Search className="h-4 w-4 shrink-0 text-ui-4" />
        <input
          aria-label="Search the library"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || query === "") return;
            e.stopPropagation();
            onQuery("");
          }}
          placeholder="Search widgets"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ui-1 outline-none placeholder:text-ui-4"
        />
      </label>
      <div className="flex flex-wrap gap-1">
        {INSERT_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCategory(c)}
            className={cn(
              "h-6 rounded-xl border px-[9px] text-[11px] transition-colors",
              c === category
                ? "border-[#3a3a44] bg-ui-active text-ui-1"
                : "border-ui-default text-[#a4a4ad]"
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

interface InsertPanelProps {
  /** The active profile's grid: cards show the size they drop with. */
  grid: { cols: number; rows: number };
  /** The user's saved panels (`config.panelPresets`). */
  savedPanels?: UserPanelPreset[];
  onAddModule: (module: string) => void;
  onAddPreset: (preset: PanelPreset) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  /** The one selected zone when it is blank: a click on a card fills it instead of adding a zone. */
  blankZoneId?: string;
  /** Fill the blank zone with the card's widget or panel ("module:<id>" / "preset:<id>" for `assignWidget`). */
  onFillBlank?: (zoneId: string, item: Insertable) => void;
  /** "Canvas from an .infopanel file → Import": the Import dialog, landing in this profile (`profileName`). */
  onImportCanvas?: () => void;
  profileName?: string;
}

/** The Add widget tab: search and filter widgets and panels, drag or click them in. */
export function InsertPanel({
  grid,
  savedPanels,
  onAddModule,
  onAddPreset,
  onRenamePreset,
  onDeletePreset,
  blankZoneId,
  onFillBlank,
  onImportCanvas,
  profileName,
}: InsertPanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<InsertCategory>("All");
  const pick = (item: Insertable) => {
    if (blankZoneId && onFillBlank && !isBlankZone(item)) onFillBlank(blankZoneId, item);
    else if (item.kind === "panel") onAddPreset(item.preset);
    else onAddModule(item.id);
  };
  return (
    <>
      <div className="shrink-0 space-y-2.5 px-3.5 pb-2.5 pt-1.5">
        <InsertFilters query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3.5">
        <InsertList
          items={filterInsertables(insertables(savedPanels), query, category)}
          context="drawer"
          grid={grid}
          onPick={pick}
          onRenamePreset={onRenamePreset}
          onDeletePreset={onDeletePreset}
        />
        {onImportCanvas && (
          <button
            type="button"
            onClick={onImportCanvas}
            title={`An InfoPanel profile, drawn in ${profileName ? `“${profileName}”` : "this screen"}`}
            className="mt-4 text-left text-[12px] text-ui-accent-text hover:underline"
          >
            Canvas from an .infopanel file → Import
          </button>
        )}
      </div>
      <p className="shrink-0 text-pretty border-t border-ui-subtle px-3.5 py-3 text-[11.5px] leading-[1.45] text-[#7c7c86]">
        Drag onto an empty zone, or click to auto-place. With a blank zone selected, a click fills it.
      </p>
    </>
  );
}
