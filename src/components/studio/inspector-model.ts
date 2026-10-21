import { SKIN_PACKS } from "@/widgets/core/theme";
import {
  isMore,
  settingKeys,
  type CompactShape,
  type DashboardModule,
  type HeaderMode,
  type InspectorTab,
  type ModuleSetting,
  type ModuleSettings,
  type SharedSectionId,
} from "@/modules/types";
import { resolveStyle, type Appearance, type StyleSource } from "@/lib/style-resolve";
import {
  following,
  isLocked,
  isSectionId,
  ownApplies,
  sectionOfKey,
  themeKeyOf,
  type SectionFlags,
  type SectionId,
  type ThemeLevels,
} from "@/lib/theme-model";
import {
  categorize,
  categoryTab,
  isTrailing,
  tabOf,
  withHeaderMode,
  withShared,
  type InspectorCategory,
} from "./inspector-categories";
import { matchesQuery, rowMatches, SET_HERE, settingStateOf, type SettingState } from "./settings-model";
import { itemSections, type ItemContext } from "./inspector/item-model";
import { STATUS_COLORS_TITLE, THEME_EDITOR_SETTINGS } from "./theme-editor-settings";

/**
 * The tabbed inspector as data: which tabs a selection has, the ordered
 * sections of each tab, search across tabs, each section's "More" rows and
 * the "N changed" counts. Pure: the inspector UI renders what this describes.
 * Sections are built from the existing categories (`categorize`); custom
 * card UIs (panel editor, presets gallery, ...) are markers (`special`,
 * `extras`) the UI fills in with the components it already has.
 */

export type DashboardTab = "layout" | "look" | "behaviour";
export type TabId = InspectorTab | DashboardTab;

export const TAB_LABELS: Record<TabId, string> = {
  show: "Show",
  style: "Style",
  data: "Data",
  behaviour: "Behaviour",
  layout: "Layout",
  look: "Look",
};

const ZONE_TABS: readonly TabId[] = ["show", "style", "data", "behaviour"];
const DASHBOARD_TABS: readonly TabId[] = ["layout", "look", "behaviour"];
/** The theme editor's: no Show tab (SPEC §7). */
const THEME_TABS: readonly TabId[] = ["style", "data", "behaviour"];

export type PanelLayoutKind = "stack" | "grid" | "overlay";

/** The level the theme editor edits: the all-profiles base, the profile theme or a page theme. */
export type ThemeScopeKind = "base" | "profile" | "page";

/** What is selected, with what the sections depend on. */
export type InspectorContext =
  | {
      kind: "widget";
      defs: ModuleSetting[];
      /** It offers a look subset (`DashboardModule.styleSubset`): the note says so; every row it has keeps its section. */
      reducedStyle?: boolean;
      /** It binds nothing (`DashboardModule.noData`): no Bound data card. */
      noData?: boolean;
      /** Whether the widget draws a header (`DashboardModule.header`); unset: "yes". */
      header?: HeaderMode;
      /** What it draws in small zones (`DashboardModule.compact`). */
      compact?: CompactShape;
    }
  | {
      kind: "panel";
      /** The panel zone's own settings (`PANEL_SETTINGS`). */
      defs: ModuleSetting[];
      layout?: PanelLayoutKind;
      /** The panel is shown as JSON (Code): the layout and widget cards give way to it. */
      codeView?: boolean;
    }
  /** A widget of a panel (SPEC §8): its kind's sections (`inspector/item-model.ts`). */
  | ItemContext
  | { kind: "blank" }
  /** Several zones: the shared look only, no tabs. */
  | { kind: "multi"; defs: ModuleSetting[] }
  | { kind: "dashboard"; scope: "all" | "profile"; profileName?: string }
  /** The theme editor (SPEC §7): the same sections at a theme level. */
  | { kind: "theme"; scope: ThemeScopeKind }
  /** An item of a canvas zone (an imported InfoPanel profile): its kind's fields, from the InfoPanel schema. */
  | {
      kind: "infopanel";
      groups: { id: string; title: string; defs: ModuleSetting[]; advanced: boolean }[];
      /** A group draws nothing itself: no mode, position or kind fields beyond its own. */
      group: boolean;
      bound: boolean;
      unknown: boolean;
    };

/** The context of a selected widget zone. */
export const widgetContext = (mod: DashboardModule): InspectorContext => ({
  kind: "widget",
  defs: (mod.settings ?? []).filter((d) => !d.hidden),
  reducedStyle: mod.styleSubset !== undefined,
  noData: mod.noData,
  header: mod.header,
  compact: mod.compact,
});

/** Custom UI a whole section stands for (not a list of settings). */
export type SpecialSection =
  | "panel"
  | "panelJson"
  | "panelLayout"
  | "panelBackground"
  | "panelWidgets"
  | "itemKind"
  | "boundData"
  | "panelData"
  | "blankPick"
  | "zoneFrame"
  | "layoutScreen"
  | "layoutGrid"
  | "lookTheme"
  | "lookStyle"
  | "lookBackground"
  | "behaviourPages"
  | "behaviourIsland"
  | "behaviourPerformance"
  | "behaviourClock"
  | "behaviourDisplay"
  | "behaviourStudio"
  | "behaviourConnection"
  | "ipMode"
  | "ipPosition"
  | "ipSensor"
  | "ipUnknown";

/** Custom UI placed inside a section next to its settings. */
export type ExtraKind = "widgetPicker" | "visible" | "styleTools" | "zoneFrame";

export interface SectionExtra {
  kind: ExtraKind;
  /** Listed after the section's "More (n)" link. */
  more: boolean;
  /** How many fields it stands for (counts in "More (n)"). */
  count: number;
}

const EXTRA_TERMS: Record<ExtraKind, string[]> = {
  widgetPicker: ["Widget type", "Change widget"],
  visible: ["Visible", "Hide"],
  styleTools: ["Copy style", "Paste style", "Save style", "Style preset"],
  zoneFrame: ["Zone frame", "Frame accent", "Frame background", "Title header"],
};

const extra = (kind: ExtraKind, more = false, count = 1): SectionExtra => ({ kind, more, count });

export interface InspectorSection {
  /** Stable and unique within a context. */
  id: string;
  title: string;
  tab: TabId;
  /** One of the shared sections (the same on every zone). */
  general: boolean;
  hint?: string;
  settings: ModuleSetting[];
  extras: SectionExtra[];
  /** A section that is custom UI only (or leads with it). */
  special?: SpecialSection;
  /** The existing document-inspector card that renders it. */
  cardId?: string;
  /** Extra search terms for custom UI. */
  terms: string[];
}

const section = (s: Partial<InspectorSection> & Pick<InspectorSection, "id" | "title" | "tab">): InspectorSection => ({
  general: false,
  settings: [],
  extras: [],
  terms: [],
  ...s,
});

/** The tabs of a context, in order (none for a blank zone or several zones). */
export function inspectorTabs(context: InspectorContext): { id: TabId; label: string }[] {
  const ids =
    context.kind === "dashboard"
      ? DASHBOARD_TABS
      : context.kind === "theme"
        ? THEME_TABS
        : context.kind === "blank" || context.kind === "multi" || context.kind === "infopanel"
        ? []
        : ZONE_TABS;
  return ids.map((id) => ({ id, label: TAB_LABELS[id] }));
}

// -- sections from categories ------------------------------------------------

/** The extras the shared cards of a zone carry. */
function extrasOf(category: InspectorCategory, context: InspectorContext): SectionExtra[] {
  if (!category.general) return [];
  const zone = context.kind === "widget" || context.kind === "panel";
  switch (category.id) {
    case "header":
      return identityExtras(context);
    case "colors":
      return zone ? [extra("styleTools")] : [];
    case "border":
      return zone ? [extra("zoneFrame", true, 3)] : [];
    default:
      return [];
  }
}

/** The widget picker and Visible (the Header section's, or another's on a widget without one). */
const identityExtras = (context: InspectorContext): SectionExtra[] =>
  context.kind === "widget" ? [extra("widgetPicker"), extra("visible")] : context.kind === "panel" ? [extra("visible")] : [];

/**
 * A category as sections, one per tab its settings sit in (usually one).
 * A section holds only its own tab's settings; when a category is split,
 * the part outside the category's own tab gets `@tab` appended to its id.
 */
function categorySections(
  category: InspectorCategory,
  context: InspectorContext
): InspectorSection[] {
  const main = categoryTab(category);
  const tabs = new Set<InspectorTab>(category.defs.map((d) => tabOf(d, category)));
  if (category.defs.length === 0) tabs.add(main);
  return [...tabs].map((tab) => {
    const extras = tab === main ? extrasOf(category, context) : [];
    return section({
      id: `${category.id}${tabs.size > 1 && tab !== main ? `@${tab}` : ""}`,
      title: category.title,
      tab,
      general: category.general,
      hint: category.hint,
      settings: category.defs.filter((d) => tabOf(d, category) === tab),
      extras,
      terms: extras.flatMap((e) => EXTRA_TERMS[e.kind]),
    });
  });
}

const sectionsOfCategories = (categories: InspectorCategory[], context: InspectorContext) =>
  categories.flatMap((c) => categorySections(c, context));

/** Widget and panel zones: the shared cards (Header, Colors, Border & glow always) and the widget's own. */
function zoneCategories(defs: ModuleSetting[], header = true): InspectorCategory[] {
  return withShared(categorize(defs), header ? ["header", "colors", "border"] : ["colors", "border"]);
}

const inTab = (sections: InspectorSection[], tab: InspectorTab) => sections.filter((s) => s.tab === tab);

/** A tab's sections in order: the leading shared ones, `lead`, the widget's own, then the trailing shared ones. */
function ordered(sections: InspectorSection[], tab: InspectorTab, lead: InspectorSection[] = []): InspectorSection[] {
  const here = inTab(sections, tab);
  return [
    ...here.filter((s) => s.general && !isTrailing(s)),
    ...lead,
    ...here.filter((s) => !s.general),
    ...here.filter((s) => isTrailing(s)),
  ];
}

/** A zone's sections tab by tab, its Bound data card (if any) leading the Data tab. */
const zoneTabs = (sections: InspectorSection[], bound?: InspectorSection) => [
  ...ordered(sections, "show"),
  ...ordered(sections, "style"),
  ...ordered(sections, "data", bound ? [bound] : []),
  ...ordered(sections, "behaviour"),
];

/**
 * A widget without a header has no Header section: its widget picker and
 * Visible go to its first Show section instead (an empty Header when it has none).
 */
function withIdentity(sections: InspectorSection[], context: InspectorContext): InspectorSection[] {
  if (sections.some((s) => s.id === "header")) return sections;
  const host = ordered(sections, "show")[0];
  const extras = identityExtras(context);
  const terms = extras.flatMap((e) => EXTRA_TERMS[e.kind]);
  if (!host) return [section({ id: "header", title: "Header", tab: "show", general: true, extras, terms }), ...sections];
  return sections.map((s) => (s === host ? { ...s, extras: [...extras, ...s.extras], terms: [...terms, ...s.terms] } : s));
}

function widgetSections(context: Extract<InspectorContext, { kind: "widget" }>): InspectorSection[] {
  const defs = withHeaderMode(context.defs, context.header, context.compact);
  const sections = withIdentity(sectionsOfCategories(zoneCategories(defs, context.header !== "none"), context), context);
  return zoneTabs(
    sections,
    context.noData
      ? undefined
      : section({
          id: "bound",
          title: "Bound data",
          tab: "data",
          special: "boundData",
          terms: ["Sensors", "Used by", "Data points", "Source"],
        })
  );
}

function panelSections(context: Extract<InspectorContext, { kind: "panel" }>): InspectorSection[] {
  const sections = sectionsOfCategories(zoneCategories(context.defs), context);
  const visual = !context.codeView;
  const show = (id: string, title: string, special: SpecialSection, terms: string[] = []) =>
    section({ id, title, tab: "show", special, terms });
  return [
    show("panel", "Panel", "panel", ["Visual", "Code", "JSON", "Fill", "Hug", "Gap", "Padding"]),
    ...(visual ? [show("layout", "Layout", "panelLayout", ["Stack", "Grid", "Overlay", "Direction", "Columns"])] : []),
    ...(visual && context.layout === "overlay" ? [show("background", "Background", "panelBackground", ["Image", "Dim"])] : []),
    ...(visual ? [show("widgets", "Widgets", "panelWidgets", ["Add panel widget"])] : []),
    ...(!visual ? [show("json", "Panel JSON", "panelJson", ["Apply"])] : []),
    ...zoneTabs(
      sections,
      section({
        id: "panel-data",
        title: "Bound data",
        tab: "data",
        special: "panelData",
        terms: ["Sensors", "Data points"],
      })
    ),
  ];
}

const blankSections = (): InspectorSection[] => [
  section({ id: "pick", title: "Widget", tab: "show", special: "blankPick", terms: ["Pick a widget", "Blank zone"] }),
  section({
    id: "frame",
    title: "Zone frame",
    tab: "show",
    special: "zoneFrame",
    terms: EXTRA_TERMS.zoneFrame,
  }),
];

/** The shared sections of the look, in order: what several zones edit together. */
const LOOK_SECTIONS: readonly SharedSectionId[] = ["skin", "colors", "surface", "type", "spacing", "border", "css", "fit", "motion"];

function lookCategories(defs: ModuleSetting[]): InspectorCategory[] {
  const categories = categorize(defs);
  return LOOK_SECTIONS.flatMap((id) => categories.filter((c) => c.general && c.id === id));
}

/** Several zones: just the shared look cards. */
function multiSections(context: Extract<InspectorContext, { kind: "multi" }>): InspectorSection[] {
  return sectionsOfCategories(lookCategories(context.defs), context);
}

// -- the theme editor -------------------------------------------------------------

/** The theme editor's sections: every themed key in its shared section, the palette as Status & series colors. */
const themeSections = (context: InspectorContext): InspectorSection[] =>
  sectionsOfCategories(categorize(THEME_EDITOR_SETTINGS), context).map((s) =>
    s.id === "palette" ? { ...s, title: STATUS_COLORS_TITLE, hint: "The theme palette: series and status colors widgets follow" } : s
  );

// -- the dashboard (nothing selected) -----------------------------------------

const dashboardMarker = (tab: DashboardTab, id: string, title: string, special: SpecialSection, terms: string[]) =>
  section({ id, title, tab, special, terms });

/** The parts of the profile inspector the palette's "Appearance…" and friends jump to. */
export type DocumentTab = "appearance" | "background" | "font" | "general" | "connection";

/** The section each part jumps to (its section id). */
export const DOCUMENT_CARD: Record<DocumentTab, string> = {
  appearance: "lk-theme",
  background: "lk-bg",
  font: "lk-theme",
  general: "bh-clock",
  connection: "bh-conn",
};

/** The profile inspector's sections (nothing selected): Layout, Look and Behaviour. */
function dashboardSections(): InspectorSection[] {
  return [
    dashboardMarker("layout", "ly-screen", "Screen", "layoutScreen", [
      "Name", "Rename", "Design size", "Width", "Height", "Window size", "When it doesn't fit", "Fill", "Scroll", "Fit mode",
    ]),
    dashboardMarker("layout", "ly-grid", "Grid", "layoutGrid", [
      "Columns", "Rows", "Gap", "Edge padding", "Padding", "Spacing", "Preview",
    ]),
    dashboardMarker("look", "lk-theme", "Theme", "lookTheme", [
      "Theme colors", "Colors", "Primary", "Accent", "Card", "Corners", "Corner radius", "Radius", "Font", "Sans", "Serif", "Mono", "Rounded",
      "All profiles", "This profile",
    ]),
    dashboardMarker("look", "lk-style", "Widget style", "lookStyle", [
      "Skin", "Presets", "Saved looks", "Look", "Save current look as preset", "Replace the page background", "Surface", "Glass", "Matte",
      "Background opacity", "Background blur", "Apply to every widget", "Lock", "Widget theme", "Theme editor", "All profiles", "This profile",
      ...SKIN_PACKS.map((p) => p.name),
    ]),
    dashboardMarker("look", "lk-bg", "Background", "lookBackground", [
      "Page background", "Color", "Gradient", "Image", "Video", "Fit", "Position", "Tint", "Dim", "Blur", "All profiles", "This profile",
    ]),
    dashboardMarker("behaviour", "bh-pages", "Pages", "behaviourPages", [
      "Add page", "Delete page", "Reorder", "Cycle through pages", "Auto-rotate", "Switch every", "Seconds per page", "Rotation", "Kiosk",
      "Page dots", "Swipe",
    ]),
    dashboardMarker("behaviour", "bh-island", "Dynamic Island", "behaviourIsland", [
      "Island", "Notch", "Pill", "Time", "Date", "Alerts", "Notifications", "Collapse", "Touch", "Pop-up alerts",
    ]),
    dashboardMarker("behaviour", "bh-performance", "Performance", "behaviourPerformance", [
      "Frame rate limit", "Max FPS", "Frame rate", "FPS", "No limit", "Animations", "Motion", "Disable animations", "Reduce", "All profiles", "This profile",
    ]),
    dashboardMarker("behaviour", "bh-clock", "Clock and date", "behaviourClock", ["Clock", "12 h", "24 h", "Time", "Locale", "Show seconds", "Date locale"]),
    dashboardMarker("behaviour", "bh-display", "Display", "behaviourDisplay", ["Hide cursor", "Kiosk", "Cursor"]),
    dashboardMarker("behaviour", "bh-studio", "Studio", "behaviourStudio", ["Quick bar", "Inspector sections", "Accordion", "One open", "Many open"]),
    dashboardMarker("behaviour", "bh-conn", "Connection", "behaviourConnection", ["Data API", "URL", "Test connection"]),
  ];
}

/** Every section of a context across all its tabs, in display order. */
export function allSections(context: InspectorContext): InspectorSection[] {
  switch (context.kind) {
    case "widget":
      return widgetSections(context);
    case "panel":
      return panelSections(context);
    case "item":
      return itemSections(context);
    case "blank":
      return blankSections();
    case "multi":
      return multiSections(context);
    case "dashboard":
      return dashboardSections();
    case "theme":
      return themeSections(context);
    case "infopanel":
      return infopanelSections(context);
  }
}

/**
 * A canvas item: how it draws, where, what it reads, then its kind's field groups as the
 * InfoPanel schema has them (the registry, not a panel per kind), and the unknown fields.
 */
function infopanelSections(context: Extract<InspectorContext, { kind: "infopanel" }>): InspectorSection[] {
  const ip = (id: string, title: string, special: SpecialSection, terms: string[]) => section({ id, title, tab: "show", special, terms });
  // The Position group's other fields (scale, corner radius) are rows under the X / Y / W / H grid.
  const position = context.group ? undefined : context.groups.find((g) => g.id === "ip-position");
  return [
    ...(context.group ? [] : [ip("ip-mode", "Draw as", "ipMode", ["Native", "InfoPanel", "Faithful", "Mode", "Convert"])]),
    ...(context.group
      ? []
      : [{ ...ip("ip-position", "Position", "ipPosition", ["X", "Y", "W", "H", "Width", "Height", "Rotation", "Flip"]), settings: position?.defs ?? [] }]),
    ...(context.bound ? [ip("ip-binding", "Sensor", "ipSensor", ["Sensor", "Remap", "Data API key"])] : []),
    ...context.groups
      .filter((g) => g !== position)
      // An advanced group's fields all sit behind its "More (n)".
      .map((g) => section({ id: g.id, title: g.title, tab: "show", settings: g.advanced ? g.defs.map((d) => ({ ...d, more: true })) : g.defs })),
    ...(context.unknown ? [ip("ip-unknown", "Unknown fields", "ipUnknown", ["Unknown", "Kept"])] : []),
  ];
}

/** The sections of one tab (all of them for a context without tabs). */
export function sectionsFor(context: InspectorContext, tab?: TabId): InspectorSection[] {
  const all = allSections(context);
  return tab && inspectorTabs(context).length > 0 ? all.filter((s) => s.tab === tab) : all;
}

// -- search -------------------------------------------------------------------

export interface SearchGroup {
  tab: TabId;
  /** Empty in a context without tabs. */
  tabLabel: string;
  /** The section with only the settings that matched. */
  section: InspectorSection;
}

export interface SearchResult {
  groups: SearchGroup[];
  /** "N settings across all tabs": matching settings plus matching custom cards. */
  total: number;
}

/**
 * Search every tab. Like the category search, matching rows win (label,
 * key, option, keyword) and are listed in their sections; custom cards match
 * by title and terms. Only when nothing matches that way does a section
 * title count, listing all of that section's settings. Blank = everything.
 */
export function searchAll(context: InspectorContext, query: string): SearchResult {
  const all = allSections(context);
  const labelOf = (tab: TabId) => (inspectorTabs(context).length > 0 ? TAB_LABELS[tab] : "");
  const group = (s: InspectorSection): SearchGroup => ({ tab: s.tab, tabLabel: labelOf(s.tab), section: s });
  const sizeOf = (g: SearchGroup, hits: number) => g.section.settings.length + hits;
  if (query.trim() === "") {
    const groups = all.map(group);
    return { groups, total: groups.reduce((n, g) => n + sizeOf(g, g.section.extras.length + (g.section.special ? 1 : 0)), 0) };
  }
  const hits: { group: SearchGroup; marks: number }[] = [];
  for (const s of all) {
    const settings = s.settings.filter((d) => rowMatches(d, query));
    const extraHits = s.extras.filter((e) => matchesQuery(EXTRA_TERMS[e.kind], query)).length;
    const specialHit = s.special !== undefined && matchesQuery([s.title, ...s.terms], query);
    if (settings.length > 0 || extraHits > 0 || specialHit)
      hits.push({ group: group({ ...s, settings }), marks: extraHits + (specialHit ? 1 : 0) });
  }
  if (hits.length === 0) {
    const titled = all.filter((s) => matchesQuery([s.title], query)).map(group);
    return { groups: titled, total: titled.reduce((n, g) => n + sizeOf(g, 0), 0) };
  }
  return { groups: hits.map((h) => h.group), total: hits.reduce((n, h) => n + sizeOf(h.group, h.marks), 0) };
}

// -- more ---------------------------------------------------------------------

/** A section's rows before its "More (n)" link and after it; `count` is the n (rows and extras flagged `more`). */
export function splitMore(s: InspectorSection): { rows: ModuleSetting[]; more: ModuleSetting[]; count: number } {
  const more = s.settings.filter(isMore);
  return {
    rows: s.settings.filter((d) => !isMore(d)),
    more,
    count: more.length + s.extras.filter((e) => e.more).reduce((n, e) => n + e.count, 0),
  };
}

/** The tabs with the ones that have no section disabled (shown dimmed, never picked by default). */
export function tabStates(
  tabs: { id: TabId; label: string }[],
  sections: InspectorSection[]
): { id: TabId; label: string; disabled: boolean }[] {
  return tabs.map((t) => ({ ...t, disabled: !sections.some((s) => s.tab === t.id) }));
}

// -- source states and counts ---------------------------------------------------

/** Where a zone's or the dashboard's values come from, for the source dots. */
export interface LookValues {
  /** What is stored at the level being edited. */
  own?: ModuleSettings;
  /** What it sits over (the dashboard + profile style). */
  inherited?: ModuleSettings;
  inheritedFrom?: Record<string, StyleSource>;
  /**
   * A zone: whether its own value of a key applies (the key is not themed,
   * or its section is custom). Unset: every own value applies.
   */
  applies?: (key: string) => boolean;
}

/**
 * The source state of a setting. On a zone only own values that apply
 * count, as one dot: the section's Follow bar says where the rest comes from.
 * A colour row with a palette role applies by its role's section.
 */
export function sourceState(def: ModuleSetting, values: LookValues): SettingState {
  const applies = values.applies;
  if (!applies) return settingStateOf(def, values.own, values.inherited, values.inheritedFrom);
  const own = values.own && Object.fromEntries(Object.entries(values.own).filter(([key]) => def.perWidget || applies(themeKeyOf(def, key))));
  const state = settingStateOf(def, own, values.inherited, values.inheritedFrom);
  return state === "overriding" ? "here" : state === "dashboard" || state === "profile" ? "default" : state;
}

/** A widget's values: its settings over the theme it follows (`resolveStyle`). */
export function widgetLookValues(input: {
  own: ModuleSettings | undefined;
  levels: ThemeLevels;
  moduleDefaults?: ModuleSettings;
  follow?: SectionFlags;
}): LookValues {
  const { settings, source } = resolveStyle({ moduleDefaults: input.moduleDefaults, levels: input.levels });
  return {
    own: input.own,
    inherited: settings,
    inheritedFrom: source,
    applies: (key) => ownApplies(input.levels, { follow: input.follow }, key),
  };
}

/** The look a scope of the Appearance tab shows: the dashboard's style, or this profile's theme over it. */
export function globalStyleValues(
  scope: "all" | "profile",
  dashboard: ModuleSettings | undefined,
  profile: ModuleSettings | undefined
): LookValues {
  if (scope === "all") return { own: dashboard };
  return {
    own: profile,
    inherited: dashboard,
    inheritedFrom: Object.fromEntries(Object.keys(dashboard ?? {}).map((k): [string, StyleSource] => [k, "dashboard"])),
  };
}

/** Whether a setting shows given the current values (`visibleIf`, e.g. glow color only with a glow). */
export const isVisible = (def: ModuleSetting, values: ModuleSettings): boolean => def.visibleIf?.(values) ?? true;

/** The settings of a section set on the widget itself (own values that apply). */
export function changedSettings(s: InspectorSection, values: LookValues): ModuleSetting[] {
  return s.settings.filter((d) => SET_HERE.has(sourceState(d, values)));
}

/** "N changed" of a section: only fields set here. */
export const changedCount = (s: InspectorSection, values: LookValues): number => changedSettings(s, values).length;

/** The stored keys a section's Reset drops. */
export const resetKeysOfSection = (s: InspectorSection, values: LookValues): string[] =>
  changedSettings(s, values).flatMap(settingKeys);

/** The changed-count pill of each tab (every section counts, More rows too). */
export function tabChangedCounts(sections: InspectorSection[], values: LookValues): Partial<Record<TabId, number>> {
  const counts: Partial<Record<TabId, number>> = {};
  for (const s of sections) counts[s.tab] = (counts[s.tab] ?? 0) + changedCount(s, values);
  return counts;
}

// -- follow / custom ----------------------------------------------------------

/** The theme section a row reads from (undefined: a per-widget row, or a key no theme sets). */
export function rowSection(def: ModuleSetting): SectionId | undefined {
  if (def.perWidget) return undefined;
  const secs = settingKeys(def).map((key) => sectionOfKey(themeKeyOf(def, key)));
  return secs.every((sec) => sec !== undefined && sec === secs[0]) ? secs[0] : undefined;
}

/**
 * The followable section an inspector section stands for: a shared section
 * of SPEC §2.1 with a row the theme sets (else there is nothing to follow).
 */
export function followSection(s: InspectorSection): SectionId | undefined {
  const id = s.id.split("@")[0];
  if (!s.general || !isSectionId(id)) return undefined;
  return s.settings.some((d) => rowSection(d) === id) ? id : undefined;
}

/** A widget section's state: following the theme, custom, or locked by the profile. */
export type FollowMode = "theme" | "custom" | "locked";

export interface FollowInfo {
  mode: FollowMode;
  /** The theme it follows: "the profile theme · Desk", "the page theme · Gaming". */
  from: string;
  /** Which theme `from` names (its link opens that scope of the theme editor). */
  level: "profile" | "page";
}

/** The Follow bar of a widget section (SPEC §4.1): a page custom for the section names the page's theme. */
export function followInfo(appearance: Appearance, follow: SectionFlags | undefined, sec: SectionId): FollowInfo {
  const named = (level: string, name: string | undefined) => `the ${level} theme${name ? ` · ${name}` : ""}`;
  if (isLocked(appearance, sec)) return { mode: "locked", from: named("profile", appearance.profileName), level: "profile" };
  const level = appearance.page?.follow?.[sec] === false ? "page" : "profile";
  const from = level === "page" ? named("page", appearance.pageName) : named("profile", appearance.profileName);
  return { mode: following(appearance, follow, sec) ? "theme" : "custom", from, level };
}

// -- notes ----------------------------------------------------------------------

export interface InspectorNote {
  kind: "reduced" | "blank" | "theme";
  text: string;
}

/** The banners and context notes of a tab (whether a section follows the theme is its Follow bar). */
export function inspectorNotes(context: InspectorContext, tab: TabId | undefined): InspectorNote[] {
  if (context.kind === "blank") return [{ kind: "blank", text: "This zone is blank. Pick a widget or a panel to fill it." }];
  if (context.kind === "dashboard") return [];
  if (context.kind === "theme") {
    return context.scope === "base"
      ? [{ kind: "theme", text: "The base under every profile's theme: what a profile leaves unset. It has no locks." }]
      : [];
  }
  if (tab !== "style") return [];
  const notes: InspectorNote[] = [];
  if (context.kind === "widget" && context.reducedStyle) {
    notes.push({ kind: "reduced", text: "Web Page widgets have reduced style options." });
  }
  return notes;
}

// -- view helpers -----------------------------------------------------------------

/**
 * The settings several zones share, in the first zone's order (the
 * multi-select edits only what every selected zone has).
 */
export function sharedDefs(defsList: readonly ModuleSetting[][]): ModuleSetting[] {
  const [first = [], ...rest] = defsList;
  const others = rest.map((defs) => new Set(defs.map((d) => d.key)));
  return first.filter((d) => others.every((keys) => keys.has(d.key)));
}

/**
 * The sections with only the settings that show for the current values
 * (`visibleIf`); a section left with nothing to show drops out.
 */
export function visibleSections(
  sections: InspectorSection[],
  visible: (def: ModuleSetting) => boolean
): InspectorSection[] {
  return sections.flatMap((s) => {
    const settings = s.settings.filter(visible);
    if (settings.length === s.settings.length) return [s];
    return settings.length > 0 || s.extras.length > 0 || s.special ? [{ ...s, settings }] : [];
  });
}

/**
 * The section a jump ("Go to …" in the palette, the selection chip's
 * Style) lands on: by its id, its document card id, or the first section
 * of a general category that was split across tabs.
 */
export function jumpTarget(sections: InspectorSection[], id: string): InspectorSection | undefined {
  return (
    sections.find((s) => s.id === id) ??
    sections.find((s) => s.cardId === id) ??
    sections.find((s) => s.id.startsWith(`${id}@`))
  );
}

/** Whether a section's custom UI matches a search (blank = yes). */
export const extraMatches = (e: SectionExtra, query: string): boolean => matchesQuery(EXTRA_TERMS[e.kind], query);
