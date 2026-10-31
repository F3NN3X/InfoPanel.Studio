import { BLANK_MODULE, CARDS_ID, type PanelDef } from "@/lib/layout";
import type { UserPanelPreset } from "@/lib/panel-model";
import { allPanelPresets, type PanelPreset } from "@/lib/panelPresets";
import type { LibraryItem } from "./drop-ghost";
import { ALL_MODULES, type ModuleMeta } from "./studio-modules";

/**
 * The Add panel's catalog (handoff SPEC §3): every widget, panel and layout as one row shape, with search
 * (§6) and the list's groups (§4.6).
 */

/** What the kind tabs switch between. */
export type AddKind = "widget" | "panel" | "layout";

/** One item of a panel or layout, for the preview's schematic. */
export interface AddPart {
  kind: string;
  label: string;
}

export interface AddItem {
  kind: AddKind;
  id: string;
  name: string;
  /** A widget's Material Symbols name (`iconFor`); panels and layouts draw their own glyph. */
  icon?: string;
  /** Widgets: the meta category. Panels: "My panels" or "Panel presets". Layouts: "Empty" or "Layout starters". */
  category: string;
  /** Default size (what it opens at) and min size (the least it accepts), in cells. */
  w: number;
  h: number;
  mw: number;
  mh: number;
  blurb: string;
  /** Search synonyms (lower case, space separated). */
  tags: string;
  /** The preview card's text. */
  description: string;
  /** Panels and layouts: their items, and the flow the schematic draws them in. */
  parts?: AddPart[];
  dir?: "row" | "column";
  /** A saved panel (My panels): it can be renamed and deleted. */
  saved?: boolean;
  /** What the add path places. */
  drop: LibraryItem;
}

/** The category chips' order; a category not listed goes before Generic. */
export const CATEGORY_ORDER = ["System", "Hardware", "Storage", "Network", "Media", "Audio", "Streaming", "Info", "Gaming", "Generic"];

const MY_PANELS = "My panels";
const PANEL_PRESETS = "Panel presets";
const EMPTY = "Empty";
const STARTERS = "Layout starters";

/** The first sentence of a description (a widget without a blurb). */
export function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return (m ? m[1] : text.trim()).replace(/\.$/, "");
}

const PART_LABELS: Record<string, string> = { clock: "Time" };

/** A panel's items as schematic parts: each widget's label, else its kind. */
function partsOf(panel: PanelDef): AddPart[] {
  return panel.widgets.map((w) => ({
    kind: w.kind,
    label: w.label?.trim() || PART_LABELS[w.kind] || w.kind.charAt(0).toUpperCase() + w.kind.slice(1),
  }));
}

/** A widget's default size: its declared one, else 3×2; never below its minimum. */
function defaultSize(def: [number, number] | undefined, mw: number, mh: number): [number, number] {
  const [w, h] = def ?? [3, 2];
  return [Math.max(w, mw), Math.max(h, mh)];
}

/** A widget's row, then one per further view (`Name · View`, added with that view set); the first view is the widget's own row. */
function moduleItems(m: ModuleMeta): AddItem[] {
  const [w, h] = defaultSize(m.defaultSize, m.minCols, m.minRows);
  const description = m.description ?? (m.id === CARDS_ID ? "Every sensor no other widget shows, as cards." : "");
  const item: AddItem = {
    kind: "widget",
    id: m.id,
    name: m.title,
    icon: m.icon,
    category: m.category && m.category !== "All" ? m.category : "Generic",
    w,
    h,
    mw: m.minCols,
    mh: m.minRows,
    blurb: m.blurb ?? (firstSentence(description) || "Widget"),
    tags: m.tags ?? "",
    description,
    drop: { kind: "module", id: m.id },
  };
  const views = m.views ?? [];
  if (views.length < 2) return [item];
  const key = m.viewKey ?? "view";
  return [
    item,
    ...views.slice(1).map((v): AddItem => {
      const [mw, mh] = v.minSize ?? [m.minCols, m.minRows];
      const [vw, vh] = defaultSize(v.defaultSize ?? m.defaultSize, mw, mh);
      return {
        ...item,
        id: `${m.id}:${v.id}`,
        name: `${m.title} · ${v.name}`,
        w: vw,
        h: vh,
        mw,
        mh,
        blurb: v.blurb ?? item.blurb,
        tags: v.tags ?? item.tags,
        drop: { kind: "module", id: m.id, settings: { [key]: v.id, ...v.applies } },
      };
    }),
  ];
}

function widgetItems(): AddItem[] {
  return ALL_MODULES.flatMap(moduleItems);
}

/** Whether two library items add the same thing (a widget's views differ by their settings). */
export const sameDrop = (a: LibraryItem, b: LibraryItem): boolean =>
  a.kind === b.kind && a.id === b.id && JSON.stringify(a.settings ?? {}) === JSON.stringify(b.settings ?? {});

/** A panel preset (built in or saved) as a row. */
function presetItem(p: PanelPreset, kind: AddKind, category: string): AddItem {
  const panel = p.make();
  const parts = partsOf(panel);
  const blurb = p.blurb ?? (parts.slice(0, 3).map((x) => x.label).join(", ") || "Empty panel");
  return {
    kind,
    id: p.id,
    name: p.title,
    category,
    w: p.colSpan,
    h: p.rowSpan,
    mw: 1,
    mh: 1,
    blurb,
    tags: p.user ? parts.map((x) => x.label.toLowerCase()).join(" ") : "",
    description:
      kind === "panel"
        ? `${blurb}. A group of mini widgets you can rearrange; each use is a fresh copy.`
        : `${blurb}. A panel layout with placeholder items to bind.`,
    parts,
    dir: panel.direction === "column" ? "column" : "row",
    saved: p.user,
    drop: { kind: "panel", id: p.id },
  };
}

/** The Blank zone row (Layouts › Empty). */
const BLANK_ZONE: AddItem = {
  kind: "layout",
  id: BLANK_MODULE,
  name: "Blank space",
  category: EMPTY,
  w: 2,
  h: 2,
  mw: 1,
  mh: 1,
  blurb: "Reserve space, fill it later",
  tags: "empty placeholder",
  description: "Empty space that holds its place. Select it later and pick a widget to fill it.",
  parts: [],
  dir: "row",
  drop: { kind: "module", id: BLANK_MODULE },
};

export type AddCatalog = Record<AddKind, AddItem[]>;

/** Every widget, panel (saved first, then presets) and layout (Blank zone, then the starters). */
export function addCatalog(saved?: UserPanelPreset[]): AddCatalog {
  const presets = allPanelPresets(saved);
  const isLayout = (p: PanelPreset) => !p.user && p.id.startsWith("layout-");
  return {
    widget: widgetItems(),
    panel: [
      ...presets.filter((p) => p.user).map((p) => presetItem(p, "panel", MY_PANELS)),
      ...presets.filter((p) => !p.user && !isLayout(p)).map((p) => presetItem(p, "panel", PANEL_PRESETS)),
    ],
    layout: [BLANK_ZONE, ...presets.filter(isLayout).map((p) => presetItem(p, "layout", STARTERS))],
  };
}

/** The widget categories present, in chip order (unknown ones before Generic). */
export function categoriesOf(widgets: AddItem[]): string[] {
  const present = [...new Set(widgets.map((w) => w.category))];
  const known = CATEGORY_ORDER.filter((c) => c !== "Generic" && present.includes(c));
  const unknown = present.filter((c) => !CATEGORY_ORDER.includes(c));
  return [...known, ...unknown, ...(present.includes("Generic") ? ["Generic"] : [])];
}

/** The text a query is matched against: widgets name, blurb, category and tags; panels and layouts name and blurb (+ saved items). */
function haystack(item: AddItem): string {
  return (item.kind === "widget" ? `${item.name} ${item.blurb} ${item.category} ${item.tags}` : `${item.name} ${item.blurb} ${item.tags}`).toLowerCase();
}

/**
 * The items where every word of the query appears, ranked: the name starts with the first word (3), contains it
 * (2), other matches (1); ties keep catalog order. An empty query = every item, unranked.
 */
export function searchItems(items: AddItem[], query: string): AddItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const rank = (item: AddItem) => {
    const name = item.name.toLowerCase();
    return name.startsWith(words[0]) ? 3 : name.includes(words[0]) ? 2 : 1;
  };
  return items
    .filter((item) => {
      const text = haystack(item);
      return words.every((w) => text.includes(w));
    })
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.item);
}

export interface AddGroup {
  title: string;
  items: AddItem[];
}

/**
 * The list's groups (SPEC §4.6): with a query one "Best matches" group; widgets by category (Recent first when
 * showing All), or the one category; panels My panels then Panel presets; layouts Empty then Layout starters.
 */
export function addGroups(kind: AddKind, items: AddItem[], opts: { query: string; category: string; recent: string[] }): AddGroup[] {
  if (opts.query.trim()) {
    const hits = searchItems(items, opts.query);
    return hits.length ? [{ title: "Best matches", items: hits }] : [];
  }
  if (kind !== "widget") {
    const titles = kind === "panel" ? [MY_PANELS, PANEL_PRESETS] : [EMPTY, STARTERS];
    return titles.map((title) => ({ title, items: items.filter((i) => i.category === title) })).filter((g) => g.items.length > 0);
  }
  if (opts.category !== "All") return [{ title: opts.category, items: items.filter((i) => i.category === opts.category) }];
  const recent = opts.recent.map((id) => items.find((i) => i.id === id)).filter((i): i is AddItem => i !== undefined);
  return [
    ...(recent.length ? [{ title: "Recent", items: recent }] : []),
    ...categoriesOf(items).map((c) => ({ title: c, items: items.filter((i) => i.category === c) })),
  ];
}

/** The size label: `3×2`. */
export const sizeText = (w: number, h: number): string => `${w}×${h}`;

/** Whether an item fits a zone of `w`×`h` (its min size is not larger). */
export const fitsIn = (item: AddItem, w: number, h: number): boolean => item.mw <= w && item.mh <= h;
