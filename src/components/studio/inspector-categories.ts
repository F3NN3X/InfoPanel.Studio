import { isIslandKey } from "@/lib/island/sources";
import {
  isDeviceKind,
  type CompactShape,
  type HeaderMode,
  type InspectorTab,
  type ModuleSetting,
  type SharedSectionId,
} from "@/modules/types";
import { matchesQuery, rowMatches } from "./settings-model";

/** A shared section: the same on every widget, panel and blank zone. */
interface SharedSection {
  id: SharedSectionId;
  title: string;
  hint: string;
  /** The inspector tab it sits in. */
  tab: InspectorTab;
  /** Before the widget's own sections of its tab, or after them. */
  place: "lead" | "trail";
}

/**
 * The shared sections, in the order the inspector shows them within a tab:
 * Show = Header · the widget's own · Fit; Style = the look (SPEC §6.3: Skin,
 * Colors, Typography, Shape & spacing, Surface & effects, Border & glow,
 * Advanced); Data = the widget's sources · Units & format; Behaviour =
 * Thresholds · the widget's own · Motion · Send to island. The standard block files its keys by `section`;
 * a widget's own rows land here by the rules of `sharedSectionOf`.
 */
export const SHARED_SECTIONS: readonly SharedSection[] = [
  { id: "header", tab: "show", place: "lead", title: "Header", hint: "Title and icon" },
  { id: "fit", tab: "show", place: "trail", title: "Fit", hint: "Small sizes (summary card, dense view) and density" },
  { id: "skin", tab: "style", place: "lead", title: "Skin", hint: "Skin, ring and bar thickness, graph and meter style" },
  { id: "colors", tab: "style", place: "lead", title: "Colors", hint: "Accent and text colors" },
  { id: "palette", tab: "style", place: "lead", title: "Widget colors", hint: "The widget's own colors and look toggles" },
  { id: "type", tab: "style", place: "lead", title: "Typography", hint: "Font, value weight and label case" },
  { id: "spacing", tab: "style", place: "lead", title: "Shape & spacing", hint: "Size, alignment, padding, gaps and corners" },
  { id: "surface", tab: "style", place: "lead", title: "Surface & effects", hint: "Material, opacity, blur and background image" },
  { id: "border", tab: "style", place: "lead", title: "Border & glow", hint: "Border and edge glow" },
  { id: "css", tab: "style", place: "lead", title: "Advanced · CSS & locks", hint: "CSS scoped to the widget" },
  { id: "format", tab: "data", place: "trail", title: "Units & format", hint: "Units and decimals" },
  { id: "thresholds", tab: "behaviour", place: "lead", title: "Thresholds", hint: "Warning and critical levels" },
  { id: "motion", tab: "behaviour", place: "trail", title: "Motion", hint: "Graph updates" },
  { id: "island", tab: "behaviour", place: "trail", title: "Send to island", hint: "What the widget sends to the island" },
];

const SHARED_BY_ID: ReadonlyMap<string, SharedSection> = new Map(SHARED_SECTIONS.map((s) => [s.id, s] as const));

/** A widget's own group of that title is filed in Behaviour › Thresholds. */
const THRESHOLDS_GROUP = "Thresholds";

/** Where settings that name no group (and no shared section) end up. */
export const OTHER_TITLE = "Other";

export interface InspectorCategory {
  /** Stable, unique per sheet: the shared section id, or `module:` + the title. */
  id: string;
  title: string;
  hint?: string;
  /** One of the shared sections (same on every widget). */
  general: boolean;
  defs: ModuleSetting[];
}

/**
 * The shared section a setting is filed in, or undefined for its own group:
 * its `section`, then Dynamic Island for the island keys, Widget colors for a
 * row with `tab: "style"`, Thresholds for a row of a "Thresholds" group.
 * (A group made of color pickers only goes to Widget colors too, see `categorize`.)
 */
export function sharedSectionOf(def: ModuleSetting): SharedSectionId | undefined {
  if (def.section) return def.section;
  if (isIslandKey(def.key)) return "island";
  if (def.tab === "style") return "palette";
  if (def.group === THRESHOLDS_GROUP) return "thresholds";
  return undefined;
}

const isColorGroup = (defs: ModuleSetting[]): boolean => defs.length > 0 && defs.every((d) => d.type === "color");

/** The titles of the groups made of color pickers only (Device colors, Dot colors, ...). */
function colorGroups(defs: ModuleSetting[]): Set<string> {
  const groups = new Map<string, ModuleSetting[]>();
  for (const def of defs) {
    if (sharedSectionOf(def)) continue;
    const title = def.group ?? OTHER_TITLE;
    groups.set(title, [...(groups.get(title) ?? []), def]);
  }
  return new Set([...groups].filter(([, list]) => isColorGroup(list)).map(([title]) => title));
}

/** The title of the section a setting is filed in. */
export function categoryTitleOf(def: ModuleSetting, colors: ReadonlySet<string> = new Set()): string {
  const id = sharedSectionOf(def) ?? (colors.has(def.group ?? OTHER_TITLE) ? "palette" : undefined);
  return id ? SHARED_BY_ID.get(id)!.title : (def.group ?? OTHER_TITLE);
}

const moduleId = (title: string) => `module:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/**
 * A settings schema as ordered categories: the shared ones first, in their
 * canonical order (only those that have settings), then the widget's own in
 * the order they first appear, then "Other" for anything unfiled. Each
 * category keeps its settings in schema order.
 */
export function categorize(defs: ModuleSetting[]): InspectorCategory[] {
  const colors = colorGroups(defs);
  const shared = new Map<string, InspectorCategory>();
  const own = new Map<string, InspectorCategory>();
  for (const def of defs) {
    const title = def.group ?? OTHER_TITLE;
    const id = sharedSectionOf(def) ?? (colors.has(title) ? "palette" : undefined);
    if (id) {
      const spec = SHARED_BY_ID.get(id)!;
      const cat = shared.get(id) ?? { id, title: spec.title, hint: spec.hint, general: true, defs: [] };
      shared.set(id, { ...cat, defs: [...cat.defs, def] });
      continue;
    }
    const cat = own.get(title) ?? { id: moduleId(title), title, general: false, defs: [] };
    own.set(title, { ...cat, defs: [...cat.defs, def] });
  }
  const other = own.get(OTHER_TITLE);
  return [
    ...SHARED_SECTIONS.flatMap((s) => shared.get(s.id) ?? []),
    ...[...own.values()].filter((c) => c !== other),
    ...(other ? [other] : []),
  ];
}

/**
 * A zone's Style tab files the widget's own colors in Colors (SPEC §6.3). Their theme section stays Widget
 * colors (`palette`); the Colors card's chip covers both (`chipSections`).
 */
export function mergeWidgetColors(categories: InspectorCategory[]): InspectorCategory[] {
  const palette = categories.find((c) => c.general && c.id === "palette");
  if (!palette) return categories;
  return categories
    .filter((c) => c !== palette)
    .map((c) => (c.general && c.id === "colors" ? { ...c, defs: [...c.defs, ...palette.defs] } : c));
}

/**
 * `categories` with the named shared sections present: the ones the zone
 * adds cards to itself (the widget picker, the zone frame) exist even when
 * the schema files no setting in them. Canonical order is kept.
 */
export function withShared(categories: InspectorCategory[], ids: readonly SharedSectionId[]): InspectorCategory[] {
  const have = new Map(categories.filter((c) => c.general).map((c) => [c.id, c] as const));
  const shared = SHARED_SECTIONS.flatMap((spec): InspectorCategory[] => {
    const present = have.get(spec.id);
    if (present) return [present];
    return ids.includes(spec.id) ? [{ id: spec.id, title: spec.title, hint: spec.hint, general: true, defs: [] }] : [];
  });
  return [...shared, ...categories.filter((c) => !c.general)];
}

/** Shown when a title-only widget's Title is the only way to get its header. */
export const TITLE_ONLY_HINT = "This widget draws a header only when a title is set.";

/**
 * A widget's settings for its header mode. `title-only` keeps Title always
 * visible (a title draws the header) and drops Show title (config v7 dropped
 * a stored one); `none` drops Show title and moves Title and Icon to the end
 * of Fit (they still name the summary views), or drops them when the widget
 * has no summary view at all.
 */
export function withHeaderMode(defs: ModuleSetting[], mode: HeaderMode = "yes", compact?: CompactShape): ModuleSetting[] {
  if (mode === "yes") return defs;
  if (mode === "title-only")
    return defs.flatMap((d): ModuleSetting[] =>
      d.section !== "header" ? [d] : d.key === "showTitle" ? [] : d.key === "label" ? [{ ...d, hint: TITLE_ONLY_HINT, visibleIf: undefined }] : [d]
    );
  const header = defs.filter((d) => d.section === "header" && d.key !== "showTitle");
  const rest = defs.filter((d) => d.section !== "header");
  const summary = compact !== undefined && (compact.card || compact.dense !== false);
  return summary ? [...rest, ...header.map((d): ModuleSetting => ({ ...d, section: "fit", visibleIf: undefined }))] : rest;
}

/**
 * Search over categories, with `filterSettings`' semantics: matching rows
 * (label, key, option, keyword) win and are returned in their categories;
 * only when no row matches does a category title count, returning all of
 * that category's settings. A blank query keeps everything.
 */
export function filterCategories(categories: InspectorCategory[], query: string): InspectorCategory[] {
  if (query.trim() === "") return categories;
  const rows = categories
    .map((c) => ({ ...c, defs: c.defs.filter((d) => rowMatches(d, query)) }))
    .filter((c) => c.defs.length > 0);
  return rows.length > 0 ? rows : categories.filter((c) => matchesQuery([c.title], query));
}

/** The tab a category sits in (a widget's own setting can still move, see `tabOf`). */
export function categoryTab(category: InspectorCategory): InspectorTab {
  return category.general ? (SHARED_BY_ID.get(category.id)?.tab ?? "style") : "show";
}

/** Whether a shared section comes after the widget's own sections of its tab. */
export const isTrailing = (category: Pick<InspectorCategory, "id" | "general">): boolean =>
  category.general && SHARED_BY_ID.get(category.id)?.place === "trail";

/** Whether a setting binds data: a sensor, or a device picked from the live keys. */
export const isDataSetting = (def: ModuleSetting): boolean => def.type === "sensor" || isDeviceKind(def.optionsFrom);

/**
 * The tab a setting sits in: a shared section's own; for a widget's own
 * setting its `tab`, else Data for data settings, else Show.
 */
export function tabOf(def: ModuleSetting, category: InspectorCategory): InspectorTab {
  if (category.general) return categoryTab(category);
  return def.tab ?? (isDataSetting(def) ? "data" : "show");
}
