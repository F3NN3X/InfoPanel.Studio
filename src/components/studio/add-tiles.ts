/**
 * The Add panel's tiles (Edit v3 SPEC §9): every Studio widget, InfoPanel item kind and studio element as one tile
 * shape, the list's sections in their order (§9.2, §9.3), the flat ranked search, and the arrow keys' moves across
 * the tile grid (§9.4). Pure, so the order and the keys are tested without the panel.
 */
import type { LucideIcon } from "lucide-react";
import { PALETTE, PALETTE_GROUPS } from "@/lib/infopanel/editor/palette-entries";
import { ELEMENTS } from "@/lib/infopanel/elements/entries";
import { ELEMENT_ICONS } from "@/components/infopanel/edit/element-icons";
import { kindIcon } from "@/components/infopanel/edit/item-icons";
import { iconFor } from "@/widgets/core/icons";
import { categoriesOf, sizeText, type AddItem } from "./add-catalog";
import type { AddFilter } from "./add-prefs";

export type TileKind = "widget" | "item" | "element";
/** What an export makes of a tile's part (the Export check's statuses). */
export type TileStatus = "ok" | "approx" | "pic" | "out";

export interface AddTile {
  /** Unique across kinds: a widget row's id, `item:{Kind}` or `element:{type}` (Recently used stores it). */
  key: string;
  kind: TileKind;
  name: string;
  icon: LucideIcon;
  /** A widget's category, an item's palette group (Text, Data, Media, Layout), or "Elements". */
  category: string;
  /** The details card's description, before its kind's sentence. */
  description: string;
  /** Search synonyms (lower case). */
  tags: string;
  /** The widget's row (widgets only). */
  widget?: AddItem;
  /** An item's or element's palette drag id (`PALETTE_DRAG`): its kind, or `element:{type}`. */
  data?: string;
}

export const ELEMENTS_CATEGORY = "Elements";

/** The drag type an item's or element's tile carries (`PALETTE_DRAG` in infopanel/edit/add-palette.tsx). */
export const PALETTE_DRAG_MIME = "application/x-infopanel-kind";

/** The tile key (Recently used) of an item's or element's palette drag id. */
export const partKey = (data: string): string => (data.startsWith("element:") ? data : `item:${data}`);

/** Each item kind's description (the reference's `ITEMS`), by its palette label. */
const ITEM_TEXT: Record<string, string> = {
  Text: "Static text or a sensor label",
  Value: "One sensor reading",
  Clock: "Time in any format",
  Calendar: "Date in any format",
  Table: "Rows of sensor readings",
  Bar: "A reading as a filled bar",
  Graph: "A reading over time",
  Donut: "A reading as a ring",
  Gauge: "Image-based dial",
  Image: "A picture from disk",
  "Web image": "A picture from a URL",
  "Sensor image": "A picture that changes with a reading",
  Shape: "Rectangle, ellipse or line",
  Group: "Holds parts together",
};

/** The reference's `ELEMS` descriptions; the other elements keep their palette tooltip. */
const ELEMENT_TEXT: Record<string, string> = {
  ring: "Progress ring for one reading",
  ledbar: "Segmented level meter",
  card: "Rounded background plate",
  glow: "Soft light behind parts",
  divider: "Thin separating line",
  sparkline: "Tiny trend line",
};

/** A widget row's tile. */
export const widgetTile = (item: AddItem): AddTile => ({
  key: item.id,
  kind: "widget",
  name: item.name,
  icon: iconFor(item.icon),
  category: item.category,
  description: item.description ? item.description.replace(/\.$/, "") : item.blurb,
  tags: `${item.blurb} ${item.tags}`.toLowerCase(),
  widget: item,
});

/** InfoPanel's item kinds, in palette order. */
export const ITEM_TILES: readonly AddTile[] = PALETTE.map((p) => ({
  key: partKey(p.kind),
  kind: "item",
  name: p.label,
  icon: kindIcon(p.kind),
  category: p.group,
  description: ITEM_TEXT[p.label] ?? p.label,
  tags: `infopanel item ${p.kind}`.toLowerCase(),
  data: p.kind,
}));

/** The studio's elements, in palette order. */
export const ELEMENT_TILES: readonly AddTile[] = ELEMENTS.map((e) => ({
  key: `element:${e.type}`,
  kind: "element",
  name: e.label,
  icon: ELEMENT_ICONS[e.type],
  category: ELEMENTS_CATEGORY,
  description: ELEMENT_TEXT[e.type] ?? e.hint,
  tags: `element ${e.hint}`.toLowerCase(),
  data: `element:${e.type}`,
}));

/** A widget's size label on its tile (`2×2`); none for items and elements. */
export const tileSize = (tile: AddTile): string | undefined => (tile.widget ? sizeText(tile.widget.w, tile.widget.h) : undefined);

/** The chips over the list for a segment (SPEC §9.1): widget categories, or the item groups and Elements. */
export function chipsFor(segment: AddFilter, widgets: readonly AddItem[]): string[] {
  return segment === "items" ? ["All", ...PALETTE_GROUPS, ELEMENTS_CATEGORY] : ["All", ...categoriesOf([...widgets])];
}

/** One run of tiles under a sub-header (none for elements and search). */
export interface TileGroup {
  sub: string | null;
  tiles: AddTile[];
}

/** A section: its header and count (none for the flat search list), and its groups. */
export interface TileSection {
  id: "recent" | "widget" | "item" | "element" | "search";
  title: string | null;
  count?: number;
  groups: TileGroup[];
}

export interface SectionOptions {
  widgets: readonly AddTile[];
  items?: readonly AddTile[];
  elements?: readonly AddTile[];
  segment: AddFilter;
  chip: string;
  query: string;
  /** Recently used tile keys, newest first. */
  recent: readonly string[];
  /** The screen is made for InfoPanel: items first, and tiles sort by status. */
  infoPanel: boolean;
  status?: (tile: AddTile) => TileStatus | undefined;
}

const RANK: Record<TileStatus, number> = { ok: 0, approx: 1, pic: 2, out: 3 };
export const RECENT_SHOWN = 4;

const kindShown = (segment: AddFilter, kind: TileKind) => segment === "all" || (segment === "widgets" ? kind === "widget" : kind !== "widget");

/**
 * The items where every word of the query appears in the name, description, category or tags, ranked: the name
 * starts with the first word (3), a word of the name does (2), any other match (1); ties keep the list's order.
 */
export function searchTiles(tiles: readonly AddTile[], query: string): AddTile[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...tiles];
  const rank = (t: AddTile) => {
    const name = t.name.toLowerCase();
    if (name.startsWith(words[0])) return 3;
    return name.split(/[\s·-]+/).some((w) => w.startsWith(words[0])) ? 2 : 1;
  };
  return tiles
    .filter((t) => {
      const text = `${t.name} ${t.description} ${t.category} ${t.tags}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.t);
}

/**
 * The list's sections (SPEC §9.2–§9.3): Recently used (up to four, any kind the segment shows; none while searching
 * or on a chip), then Studio widgets, InfoPanel items and Elements, items first on a screen made for InfoPanel, each
 * by category in curated order, sorted by status (as is → approximated → becomes a picture → left out) when made for
 * InfoPanel. A query makes one flat ranked list instead. Empty sections are left out.
 */
export function addSections(o: SectionOptions): TileSection[] {
  const pools: Record<TileKind, readonly AddTile[]> = { widget: o.widgets, item: o.items ?? [], element: o.elements ?? [] };
  const all = [...pools.widget, ...pools.item, ...pools.element].filter((t) => kindShown(o.segment, t.kind));
  if (o.query.trim()) {
    const hits = searchTiles(all, o.query);
    return hits.length ? [{ id: "search", title: null, groups: [{ sub: null, tiles: hits }] }] : [];
  }
  const sorted = (tiles: AddTile[]) =>
    o.infoPanel && o.status ? tiles.map((t, i) => ({ t, i, r: RANK[o.status!(t) ?? "ok"] })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.t) : tiles;
  const onChip = (t: AddTile) => o.chip === "All" || t.category === o.chip;
  const out: TileSection[] = [];
  if (o.chip === "All") {
    const byKey = new Map(all.map((t) => [t.key, t]));
    const recent = o.recent.map((k) => byKey.get(k)).filter((t): t is AddTile => t !== undefined).slice(0, RECENT_SHOWN);
    if (recent.length) out.push({ id: "recent", title: "RECENTLY USED", groups: [{ sub: null, tiles: recent }] });
  }
  const order: TileKind[] = o.infoPanel ? ["item", "element", "widget"] : ["widget", "item", "element"];
  const TITLES: Record<TileKind, string> = { widget: "STUDIO WIDGETS", item: "INFOPANEL ITEMS", element: "ELEMENTS" };
  for (const kind of order) {
    if (!kindShown(o.segment, kind)) continue;
    const pool = pools[kind];
    const cats = kind === "widget" ? categoriesOf(pool.map((t) => t.widget!)) : kind === "item" ? [...PALETTE_GROUPS] : [ELEMENTS_CATEGORY];
    const groups = cats
      .map((c) => ({ sub: kind === "element" ? null : c, tiles: sorted(pool.filter((t) => t.category === c && onChip(t))) }))
      .filter((g) => g.tiles.length > 0);
    if (groups.length) out.push({ id: kind, title: TITLES[kind], count: pool.length, groups });
  }
  return out;
}

/** The tiles in list order, each with its visual row (tiles wrap `cols` to a row inside each group). */
export function tileRows(sections: readonly TileSection[], cols: number): { tiles: AddTile[]; rows: number[][] } {
  const tiles: AddTile[] = [];
  const rows: number[][] = [];
  for (const s of sections) {
    for (const g of s.groups) {
      for (let i = 0; i < g.tiles.length; i += cols) {
        rows.push(g.tiles.slice(i, i + cols).map((_, j) => tiles.length + j));
        tiles.push(...g.tiles.slice(i, i + cols));
      }
    }
  }
  return { tiles, rows };
}

/**
 * The tile an arrow key moves to (SPEC §9.4): left and right step through the list, up and down to the row above or
 * below at the same column (its last tile when that row is shorter). Nothing highlighted: the first tile, or the
 * last for Up and Left. Stays at the ends.
 */
export function moveInGrid(rows: readonly (readonly number[])[], current: number | null, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): number | null {
  const count = rows.reduce((n, r) => n + r.length, 0);
  if (count === 0) return null;
  if (current === null) return key === "ArrowUp" || key === "ArrowLeft" ? count - 1 : 0;
  if (key === "ArrowLeft") return Math.max(0, current - 1);
  if (key === "ArrowRight") return Math.min(count - 1, current + 1);
  const r = rows.findIndex((row) => row.includes(current));
  const target = rows[r + (key === "ArrowDown" ? 1 : -1)];
  if (!target) return current;
  const col = rows[r].indexOf(current);
  return target[Math.min(col, target.length - 1)];
}
