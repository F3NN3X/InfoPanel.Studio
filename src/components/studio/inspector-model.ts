import { PROFILE_STYLE_KEYS, PROFILE_STYLE_SETTINGS } from "@/modules/standard-settings";
import { SKIN_PACKS } from "@/widgets/core/theme";
import {
  settingKeys,
  type DashboardModule,
  type InspectorTab,
  type ModuleSetting,
  type ModuleSettings,
} from "@/modules/types";
import { followsGlobal, resolveStyle, type StyleMode, type StyleSource } from "@/lib/style-resolve";
import {
  categorize,
  categoryAdvanced,
  categoryTab,
  tabOf,
  withGeneral,
  type InspectorCategory,
} from "./inspector-categories";
import { matchesQuery, rowMatches, SET_HERE, settingStateOf, type SettingState } from "./settings-model";

/**
 * The tabbed inspector as data: which tabs a selection has, the ordered
 * sections of each tab, search across tabs, the Advanced filter and the
 * "N changed" counts. Pure: the inspector UI renders what this describes.
 * Sections are built from the existing categories (`categorize`); custom
 * card UIs (panel editor, presets gallery, ...) are markers (`special`,
 * `extras`) the UI fills in with the components it already has.
 */

export type DashboardTab = "profile" | "appearance" | "gstyle" | "general";
export type TabId = InspectorTab | DashboardTab;

export const TAB_LABELS: Record<TabId, string> = {
  content: "Content",
  style: "Style",
  data: "Data",
  profile: "Profile",
  appearance: "Appearance",
  gstyle: "Global style",
  general: "General",
};

const ZONE_TABS: readonly TabId[] = ["content", "style", "data"];
const DASHBOARD_TABS: readonly TabId[] = ["profile", "appearance", "gstyle", "general"];

/**
 * The modules with reduced style options: their schema simply offers fewer
 * look settings (the note says so); every one it has keeps its normal section.
 */
const REDUCED_STYLE_MODULES: ReadonlySet<string> = new Set(["WebPage"]);

export type PanelLayoutKind = "stack" | "grid" | "overlay";

/** What is selected, with what the sections depend on. */
export type InspectorContext =
  | { kind: "widget"; defs: ModuleSetting[]; reducedStyle?: boolean }
  | {
      kind: "panel";
      /** The panel zone's own settings (`PANEL_SETTINGS`). */
      defs: ModuleSetting[];
      layout?: PanelLayoutKind;
      /** The panel is shown as JSON (Code): the layout and widget cards give way to it. */
      codeView?: boolean;
      /** A panel widget is selected: its cards follow the list. */
      selectedWidget?: boolean;
      /** The selected panel widget's kind name (the titles of its cards). */
      selectedLabel?: string;
    }
  | { kind: "blank" }
  /** Several zones: the shared look only, no tabs. */
  | { kind: "multi"; defs: ModuleSetting[] }
  | { kind: "dashboard"; scope: "all" | "profile"; profileName?: string }
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
  defs: mod.settings ?? [],
  reducedStyle: REDUCED_STYLE_MODULES.has(mod.id),
});

/** Custom UI a whole section stands for (not a list of settings). */
export type SpecialSection =
  | "panel"
  | "panelJson"
  | "panelLayout"
  | "panelBackground"
  | "panelWidgets"
  | "widgetKind"
  | "widgetDisplay"
  | "widgetPlacement"
  | "widgetColors"
  | "widgetAdvanced"
  | "boundData"
  | "panelData"
  | "blankPick"
  | "zoneFrame"
  | "profileFields"
  | "profileInherit"
  | "profileSelection"
  | "profileRotate"
  | "profileIsland"
  | "scope"
  | "presets"
  | "theme"
  | "pageBackground"
  | "type"
  | "clock"
  | "display"
  | "studio"
  | "connection"
  | "ipMode"
  | "ipPosition"
  | "ipSensor"
  | "ipUnknown";

/** Custom UI placed inside a section next to its settings. */
export type ExtraKind = "widgetPicker" | "visible" | "styleMode" | "styleTools" | "zoneFrame";

export interface SectionExtra {
  kind: ExtraKind;
  advanced: boolean;
  /** How many fields it stands for (counts for hidden-advanced totals). */
  count: number;
}

const EXTRA_TERMS: Record<ExtraKind, string[]> = {
  widgetPicker: ["Widget type", "Change widget"],
  visible: ["Visible", "Hide"],
  styleMode: ["Look", "Follow global", "Custom"],
  styleTools: ["Copy style", "Paste style", "Save style", "Style preset"],
  zoneFrame: ["Zone frame", "Frame accent", "Frame background", "Title header"],
};

const extra = (kind: ExtraKind, advanced = false, count = 1): SectionExtra => ({ kind, advanced, count });

export interface InspectorSection {
  /** Stable and unique within a context. */
  id: string;
  title: string;
  tab: TabId;
  /** The whole section only shows with Advanced settings on. */
  advanced: boolean;
  /** One of the general categories (the same on every zone). */
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
  advanced: false,
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
      : context.kind === "blank" || context.kind === "multi" || context.kind === "infopanel"
        ? []
        : ZONE_TABS;
  return ids.map((id) => ({ id, label: TAB_LABELS[id] }));
}

// -- sections from categories ------------------------------------------------

/** The extras the general cards of a zone carry. */
function extrasOf(category: InspectorCategory, context: InspectorContext): SectionExtra[] {
  if (!category.general) return [];
  const zone = context.kind === "widget" || context.kind === "panel";
  switch (category.id) {
    case "widget":
      return context.kind === "widget" ? [extra("widgetPicker"), extra("visible")] : zone ? [extra("visible")] : [];
    case "colors":
      return zone ? [extra("styleMode"), extra("styleTools")] : context.kind === "multi" ? [extra("styleMode")] : [];
    case "effects":
      return zone ? [extra("zoneFrame", true, 3)] : [];
    default:
      return [];
  }
}

/**
 * A category as sections, one per tab its settings sit in (usually one).
 * A section holds only its own tab's settings; when a category is split,
 * the part outside the category's own tab gets `@tab` appended to its id.
 */
function categorySections(
  category: InspectorCategory,
  context: InspectorContext,
  idPrefix = ""
): InspectorSection[] {
  const main = categoryTab(category);
  const tabs = new Set<InspectorTab>(category.defs.map((d) => tabOf(d, category)));
  if (category.defs.length === 0) tabs.add(main);
  return [...tabs].map((tab) => {
    const settings = category.defs.filter((d) => tabOf(d, category) === tab);
    const extras = tab === main ? extrasOf(category, context) : [];
    const advanced =
      categoryAdvanced(category) ||
      (settings.length > 0 && settings.every((d) => d.advanced) && extras.every((e) => e.advanced));
    return section({
      id: `${idPrefix}${category.id}${tabs.size > 1 && tab !== main ? `@${tab}` : ""}`,
      title: category.title,
      tab,
      advanced,
      general: category.general,
      hint: category.hint,
      settings,
      extras,
      terms: extras.flatMap((e) => EXTRA_TERMS[e.kind]),
    });
  });
}

const sectionsOfCategories = (categories: InspectorCategory[], context: InspectorContext, idPrefix = "") =>
  categories.flatMap((c) => categorySections(c, context, idPrefix));

/** Widget and panel zones: the Widget card, the look cards and any widget-own categories. */
function zoneCategories(defs: ModuleSetting[]): InspectorCategory[] {
  return withGeneral(categorize(defs), ["widget", "colors", "effects"]);
}

const inTab = (sections: InspectorSection[], tab: InspectorTab) => sections.filter((s) => s.tab === tab);

function widgetSections(context: Extract<InspectorContext, { kind: "widget" }>): InspectorSection[] {
  const sections = sectionsOfCategories(zoneCategories(context.defs), context);
  return [
    ...inTab(sections, "content"),
    ...inTab(sections, "style"),
    section({
      id: "bound",
      title: "Bound data",
      tab: "data",
      special: "boundData",
      terms: ["Sensors", "Used by", "Data points", "Source"],
    }),
    ...inTab(sections, "data"),
  ];
}

const PANEL_WIDGET_CARDS: [SpecialSection, string, string[]][] = [
  ["widgetKind", "Selected", ["Kind", "Change kind"]],
  ["widgetDisplay", "Display", ["Label", "Sensor", "Unit"]],
  ["widgetPlacement", "Size & placement", ["Sizing", "Span", "Band"]],
  ["widgetColors", "Typography & colors", ["Color"]],
  ["widgetAdvanced", "Selected · Advanced", ["Class names", "Custom CSS"]],
];

function panelSections(context: Extract<InspectorContext, { kind: "panel" }>): InspectorSection[] {
  const sections = sectionsOfCategories(zoneCategories(context.defs), context);
  const visual = !context.codeView;
  const content = (id: string, title: string, special: SpecialSection, terms: string[] = [], advanced = false) =>
    section({ id, title, tab: "content", special, advanced, terms });
  return [
    content("panel", "Panel", "panel", ["Visual", "Code", "JSON", "Fill", "Hug", "Gap", "Padding"]),
    ...(visual ? [content("layout", "Layout", "panelLayout", ["Stack", "Grid", "Overlay", "Direction", "Columns"])] : []),
    ...(visual && context.layout === "overlay" ? [content("background", "Background", "panelBackground", ["Image", "Dim"])] : []),
    ...(visual ? [content("widgets", "Widgets", "panelWidgets", ["Add panel widget"])] : []),
    ...(!visual ? [content("json", "Panel JSON", "panelJson", ["Apply"])] : []),
    ...(visual && context.selectedWidget
      ? PANEL_WIDGET_CARDS.map(([special, title, terms]) =>
          content(
            `item-${special}`,
            special === "widgetKind" ? `Selected · ${context.selectedLabel ?? "widget"}` : title,
            special,
            terms,
            special === "widgetAdvanced"
          )
        )
      : []),
    ...inTab(sections, "content"),
    ...inTab(sections, "style"),
    section({
      id: "panel-data",
      title: "Bound data",
      tab: "data",
      special: "panelData",
      terms: ["Sensors", "Data points"],
    }),
    ...inTab(sections, "data"),
  ];
}

const blankSections = (): InspectorSection[] => [
  section({ id: "pick", title: "Widget", tab: "content", special: "blankPick", terms: ["Pick a widget", "Blank zone"] }),
  section({
    id: "frame",
    title: "Zone frame",
    tab: "content",
    special: "zoneFrame",
    terms: EXTRA_TERMS.zoneFrame,
  }),
];

/** Several zones: just the shared look cards. */
function multiSections(context: Extract<InspectorContext, { kind: "multi" }>): InspectorSection[] {
  return inTab(sectionsOfCategories(categorize(context.defs).filter((c) => c.general), context), "style");
}

// -- the dashboard (nothing selected) -----------------------------------------

/** The document inspector's card ids (`DOCUMENT_CARD` and `generalCards`). */
const dashboardMarker = (
  tab: DashboardTab,
  id: string,
  title: string,
  special: SpecialSection,
  terms: string[],
  cardId?: string
) => section({ id, title, tab, special, terms, cardId });

function dashboardSections(): InspectorSection[] {
  const look = categorize(PROFILE_STYLE_SETTINGS).filter((c) => c.general && categoryTab(c) === "style");
  const styleContext: InspectorContext = { kind: "dashboard", scope: "all" };
  return [
    dashboardMarker("profile", "profile", "Profile", "profileFields", [
      "Name", "Design size", "Grid", "Columns", "Rows", "Fit", "Fill", "Scroll", "Gap", "Padding", "Corner radius", "Radius",
    ]),
    dashboardMarker("profile", "profile-inherit", "This profile", "profileInherit", [
      "Theme", "Style", "Background", "Inherit", "Custom",
    ]),
    dashboardMarker("profile", "profile-selection", "Profile selection", "profileSelection", [
      "Auto-pick profile", "Window size",
    ]),
    dashboardMarker("profile", "profile-rotate", "Auto-rotate", "profileRotate", [
      "Auto-rotate pages", "Seconds per page", "Pages", "Rotation", "Kiosk",
    ]),
    dashboardMarker("profile", "profile-island", "Dynamic Island", "profileIsland", [
      "Island", "Notch", "Pill", "Time", "Date", "Alerts", "Notifications", "Collapse", "Touch",
    ]),
    dashboardMarker(
      "appearance", "ap-scope", "Scope", "scope",
      ["Global style", "All profiles", "This profile", "Force global style"], "doc:appearance"
    ),
    dashboardMarker(
      "appearance", "ap-presets", "Skins", "presets",
      ["Skin", "Presets", "Saved looks", "Look", "Save current look as preset", "Replace the page background", ...SKIN_PACKS.map((p) => p.name)],
      "doc:presets"
    ),
    dashboardMarker(
      "appearance", "ap-theme", "Theme & surface", "theme",
      ["Theme colors", "Colors", "Primary", "Surface", "Card", "Glass", "Matte"], "doc:theme"
    ),
    dashboardMarker(
      "appearance", "ap-bg", "Page background", "pageBackground",
      ["Background", "Color", "Gradient", "Image", "Video"], "doc:background"
    ),
    ...sectionsOfCategories(look, styleContext, "gs-").map((s) => ({ ...s, tab: "gstyle" as const })),
    dashboardMarker("general", "g-type", "Type", "type", ["Font", "Sans", "Serif", "Mono", "Rounded"], "doc:type"),
    dashboardMarker("general", "g-clock", "Clock & date", "clock", ["Clock", "Time", "Locale", "Show seconds"], "doc:clock"),
    dashboardMarker("general", "g-display", "Display", "display", ["Motion", "Reduce", "Hide cursor", "Kiosk", "Pages", "Page dots", "Swipe"], "doc:display"),
    dashboardMarker("general", "g-studio", "Studio", "studio", ["Quick bar", "Inspector sections", "Accordion", "One open", "Many open"]),
    dashboardMarker("general", "g-conn", "Connection", "connection", ["Data API", "URL", "Test connection"], "doc:connection"),
  ];
}

/** Every section of a context across all its tabs, in display order. */
export function allSections(context: InspectorContext): InspectorSection[] {
  switch (context.kind) {
    case "widget":
      return widgetSections(context);
    case "panel":
      return panelSections(context);
    case "blank":
      return blankSections();
    case "multi":
      return multiSections(context);
    case "dashboard":
      return dashboardSections();
    case "infopanel":
      return infopanelSections(context);
  }
}

/**
 * A canvas item: how it draws, where, what it reads, then its kind's field groups as the
 * InfoPanel schema has them (the registry, not a panel per kind), and the unknown fields.
 */
function infopanelSections(context: Extract<InspectorContext, { kind: "infopanel" }>): InspectorSection[] {
  const ip = (id: string, title: string, special: SpecialSection, terms: string[]) => section({ id, title, tab: "content", special, terms });
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
      .map((g) => section({ id: g.id, title: g.title, tab: "content", settings: g.defs, advanced: g.advanced })),
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

// -- advanced -----------------------------------------------------------------

/** How many fields a section stands for. */
export function sectionSize(s: InspectorSection): number {
  return s.settings.length + s.extras.reduce((n, e) => n + e.count, 0) + (s.special ? 1 : 0);
}

/**
 * With Advanced settings off, the advanced sections, settings and extras
 * drop out (a section left with nothing goes too); `hiddenCount` is how many
 * fields that hid ("Show N advanced settings").
 */
export function applyAdvanced(
  sections: InspectorSection[],
  showAdvanced: boolean
): { sections: InspectorSection[]; hiddenCount: number } {
  if (showAdvanced) return { sections, hiddenCount: 0 };
  let hiddenCount = 0;
  const visible: InspectorSection[] = [];
  for (const s of sections) {
    if (s.advanced) {
      hiddenCount += sectionSize(s);
      continue;
    }
    const settings = s.settings.filter((d) => !d.advanced);
    const extras = s.extras.filter((e) => !e.advanced);
    const dropped =
      s.settings.length - settings.length + s.extras.filter((e) => e.advanced).reduce((n, e) => n + e.count, 0);
    hiddenCount += dropped;
    if (dropped === 0) visible.push(s);
    else if (settings.length > 0 || extras.length > 0 || s.special) visible.push({ ...s, settings, extras });
  }
  return { sections: visible, hiddenCount };
}

// -- source states and counts ---------------------------------------------------

/** Where a zone's or the dashboard's values come from, for the source dots. */
export interface LookValues {
  /** What is stored at the level being edited. */
  own?: ModuleSettings;
  /** What it sits over (the dashboard + profile style). */
  inherited?: ModuleSettings;
  inheritedFrom?: Record<string, StyleSource>;
  /** The widget follows the global style (or it is forced): its look values are ignored. */
  ignoreOwn?: boolean;
}

const isLookDef = (def: ModuleSetting) => settingKeys(def).some((k) => PROFILE_STYLE_KEYS.has(k));

/** The source state of a setting (only look settings can be ignored). */
export function sourceState(def: ModuleSetting, values: LookValues): SettingState {
  return settingStateOf(def, values.own, values.inherited, values.inheritedFrom, values.ignoreOwn && isLookDef(def));
}

/** A widget's values: its settings over the layers it inherits (`resolveStyle`). */
export function widgetLookValues(input: {
  own: ModuleSettings | undefined;
  dashboard?: ModuleSettings;
  profile?: ModuleSettings;
  moduleDefaults?: ModuleSettings;
  mode?: StyleMode;
  enforce?: boolean;
}): LookValues {
  const { settings, source } = resolveStyle({
    moduleDefaults: input.moduleDefaults,
    dashboard: input.dashboard,
    profile: input.profile,
  });
  return {
    own: input.own,
    inherited: settings,
    inheritedFrom: source,
    ignoreOwn: followsGlobal(input.mode, input.enforce),
  };
}

/** The global style being edited: the dashboard's, or this profile's over it. */
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

/** The settings of a section set on the widget itself (including ignored ones). */
export function changedSettings(s: InspectorSection, values: LookValues): ModuleSetting[] {
  return s.settings.filter((d) => SET_HERE.has(sourceState(d, values)));
}

/** "N changed" of a section: only fields set here. */
export const changedCount = (s: InspectorSection, values: LookValues): number => changedSettings(s, values).length;

/** The stored keys a section's Reset drops. */
export const resetKeysOfSection = (s: InspectorSection, values: LookValues): string[] =>
  changedSettings(s, values).flatMap(settingKeys);

/** The changed-count pill of each tab (every section counts, advanced or not). */
export function tabChangedCounts(sections: InspectorSection[], values: LookValues): Partial<Record<TabId, number>> {
  const counts: Partial<Record<TabId, number>> = {};
  for (const s of sections) counts[s.tab] = (counts[s.tab] ?? 0) + changedCount(s, values);
  return counts;
}

// -- follow / custom ----------------------------------------------------------

/**
 * Editing a look setting while the widget follows the global style makes it
 * Custom: otherwise the edit would be stored but ignored. Returns what to
 * merge into the placement beside the edit (nothing when the edit is not a
 * look key, the widget is already Custom, or the style is forced, where
 * Custom would change nothing).
 */
export function lookEditPatch(
  keys: string | readonly string[],
  mode: StyleMode | undefined,
  enforce: boolean | undefined
): { styleMode?: StyleMode } {
  const edited = typeof keys === "string" ? [keys] : keys;
  return mode === "follow" && !enforce && edited.some((k) => PROFILE_STYLE_KEYS.has(k))
    ? { styleMode: "custom" }
    : {};
}

// -- notes ----------------------------------------------------------------------

export interface InspectorNote {
  kind: "follow" | "forced" | "reduced" | "blank" | "gstyle";
  text: string;
}

/** The banners and context notes of a tab. */
export function inspectorNotes(
  context: InspectorContext,
  tab: TabId | undefined,
  state: { mode?: StyleMode; enforce?: boolean } = {}
): InspectorNote[] {
  if (context.kind === "blank") return [{ kind: "blank", text: "This zone is blank. Pick a widget or a panel to fill it." }];
  if (context.kind === "dashboard") {
    if (tab !== "gstyle") return [];
    return [
      {
        kind: "gstyle",
        text:
          context.scope === "all"
            ? "Editing the dashboard style — applies to all profiles. Change the scope under Appearance."
            : `Editing the style of '${context.profileName ?? "this profile"}' only. It sits above the dashboard style.`,
      },
    ];
  }
  if (tab !== "style") return [];
  const notes: InspectorNote[] = [];
  if (state.enforce) {
    notes.push({ kind: "forced", text: "Force global style is on — this widget's own look values are ignored." });
  } else if (state.mode === "follow") {
    notes.push({
      kind: "follow",
      text: "Following the global style. Editing a look setting below switches this widget to Custom.",
    });
  }
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
