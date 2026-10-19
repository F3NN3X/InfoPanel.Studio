import type { ModuleSetting, ModuleSettingValue, ModuleSettings, ThresholdQuantity } from "@/modules/types";

/**
 * The widget theme (widget settings v2, SPEC §3): which look keys a theme
 * sets, the section each belongs to, and how a widget's value resolves.
 * Pure, no registry imports (layout.ts and the migration read it).
 *
 * Levels, lowest first (owner decision Q1):
 *
 *   THEME_DEFAULTS → all-profiles style (`DashboardConfig.style`, no locks)
 *     → profile theme (`MonitorProfile.widgetTheme`: values + locks)
 *     → page theme (`ProfilePage.widgetTheme`: values + follow per section)
 *     → the widget (`Placement.follow` per section, its own settings)
 *
 * A widget section follows the theme unless `follow[section] === false`,
 * and always while the profile locks the section. A following section's
 * own values stay stored but do not apply. A locked section is the
 * profile's on every page too: a page's own values for it stay stored,
 * inactive, like a widget's.
 */

/** The followable sections (SPEC §2.1). */
export type SectionId =
  | "skin"
  | "colors"
  | "palette"
  | "surface"
  | "type"
  | "spacing"
  | "border"
  | "css"
  | "format"
  | "thresholds"
  | "motion";

export const SECTION_IDS: readonly SectionId[] = [
  "skin",
  "colors",
  "palette",
  "surface",
  "type",
  "spacing",
  "border",
  "css",
  "format",
  "thresholds",
  "motion",
];

export const isSectionId = (v: unknown): v is SectionId => SECTION_IDS.includes(v as SectionId);

/** Per section: follow the level above (true, the default) or not; on a profile, locked. */
export type SectionFlags = Partial<Record<SectionId, boolean>>;

/** A profile's or a page's widget theme. */
export interface WidgetTheme {
  /** Values of themed keys (partial: the level below fills the rest). */
  values?: ModuleSettings;
  /** Page only: `false` = this page's own values for the section, else the profile's. */
  follow?: SectionFlags;
  /** Profile only: widgets always follow a locked section. */
  locks?: SectionFlags;
}

/** The theme levels a widget renders under (see the module comment). */
export interface ThemeLevels {
  /** The all-profiles style: the base layer. */
  base?: ModuleSettings;
  profile?: WidgetTheme;
  page?: WidgetTheme;
}

/** A threshold quantity's control (SPEC §4.4): label, unit, slider range and theme default. */
export interface QuantitySpec {
  label: string;
  /** Stored in this unit (°C for temperatures; shown in °F when the resolved `tempUnit` is f). */
  unit: string;
  min: number;
  max: number;
  step: number;
  warn: number;
  crit: number;
}

/** The threshold quantities (SPEC §4.4); `value` slides over a sensor's own range. */
export const QUANTITIES: Readonly<Record<ThresholdQuantity, QuantitySpec>> = {
  load: { label: "Load", unit: "%", min: 0, max: 100, step: 5, warn: 80, crit: 92 },
  temp: { label: "Temperature", unit: "°C", min: 30, max: 110, step: 5, warn: 80, crit: 90 },
  full: { label: "Fullness", unit: "%", min: 0, max: 100, step: 5, warn: 85, crit: 95 },
  db: { label: "Audio level", unit: "dB", min: -40, max: 0, step: 1, warn: -9, crit: -2 },
  value: { label: "Value", unit: "", min: 0, max: 100, step: 5, warn: 70, crit: 90 },
};

export const THRESHOLD_QUANTITIES = Object.keys(QUANTITIES) as ThresholdQuantity[];

/** A quantity's warning and critical keys (`warn.<q>` / `crit.<q>`; absent = the theme's). */
export const warnKey = (q: ThresholdQuantity): string => `warn.${q}`;
export const critKey = (q: ThresholdQuantity): string => `crit.${q}`;

/** A threshold level that is switched off (stored instead of a number). */
export const OFF = "off";

/** The theme palette roles (Style › Widget colors; SPEC §4.3); `accent` is the Colors accent. */
export const PALETTE_ROLES: readonly string[] = ["s1", "s2", "s3", "s4", "s5", "s6", "ok", "warn", "crit"];

/** What a role is called: the theme editor's rows, and a following colour row's value ("Series 1"). */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  s1: "Series 1",
  s2: "Series 2",
  s3: "Series 3",
  s4: "Series 4",
  s5: "Series 5",
  s6: "Series 6",
  ok: "OK",
  warn: "Warning",
  crit: "Critical",
  accent: "Accent",
};

/**
 * The themed keys of each section: today's look keys (the old
 * `PROFILE_STYLE_KEYS` minus `autoScale`, `variant` and `compactView`;
 * `alignX` / `alignY` stay readable until PR 8, `align` + `alignSpread`
 * replace them), Units & format, the thresholds of every quantity, the
 * palette roles and the meters' response.
 */
export const SECTION_KEYS: Readonly<Record<SectionId, readonly string[]>> = {
  skin: ["skin", "stroke", "graph", "meter"],
  colors: ["accent", "textColor", "mutedColor"],
  palette: PALETTE_ROLES,
  surface: ["surface", "surfaceOpacity", "blur"],
  type: ["font", "fontWeight", "labelCase"],
  spacing: ["scale", "align", "alignSpread", "alignX", "alignY", "padding", "gap", "radius"],
  border: ["borderWidth", "borderColor", "glow", "glowColor"],
  css: ["customCss"],
  format: ["tempUnit", "rateUnit", "decimals", "clock"],
  thresholds: THRESHOLD_QUANTITIES.flatMap((q) => [warnKey(q), critKey(q)]),
  motion: ["smoothing", "meterBallistics"],
};

const SECTION_OF: ReadonlyMap<string, SectionId> = new Map(
  SECTION_IDS.flatMap((sec) => SECTION_KEYS[sec].map((key): [string, SectionId] => [key, sec]))
);

/** Every key a theme can set. */
export const THEMED_KEYS: ReadonlySet<string> = new Set(SECTION_OF.keys());

/** The section a themed key belongs to (undefined: not themed). */
export const sectionOfKey = (key: string): SectionId | undefined => SECTION_OF.get(key);

/**
 * The value of each themed key when no level sets it: today's defaults
 * (owner decision Q2), so nothing repaints on upgrade; the thresholds take
 * the spec's (owner decision Q3, the shifts are in the CHANGELOG), the
 * palette roles "" (each widget's own colour). A widget kind with a
 * default of its own (the cards' Theme surface, a panel's Card, a Clock's
 * 24 h) keeps it: `valueOf` falls back to the row's default first.
 */
export const THEME_DEFAULTS: Readonly<ModuleSettings> = {
  skin: "auto",
  stroke: 100,
  graph: "auto",
  meter: "auto",
  accent: "",
  textColor: "",
  mutedColor: "",
  ...Object.fromEntries(PALETTE_ROLES.map((role) => [role, ""])),
  surface: "glass",
  surfaceOpacity: 100,
  blur: "auto",
  font: "auto",
  fontWeight: "auto",
  labelCase: "auto",
  scale: 100,
  align: "auto",
  alignSpread: false,
  alignX: "auto",
  alignY: "auto",
  padding: "auto",
  gap: "auto",
  radius: "auto",
  borderWidth: "auto",
  borderColor: "",
  glow: "none",
  glowColor: "",
  customCss: "",
  tempUnit: "c",
  rateUnit: "auto",
  decimals: "auto",
  clock: "auto",
  ...Object.fromEntries(THRESHOLD_QUANTITIES.flatMap((q) => [[warnKey(q), QUANTITIES[q].warn], [critKey(q), QUANTITIES[q].crit]])),
  smoothing: "stepped",
  meterBallistics: "peak",
};

/** The theme key a row reads: its palette role (`accent`: the Colors accent), else its own key. */
export function themeKeyOf(def: Pick<ModuleSetting, "key" | "role">, key = def.key): string {
  return def.role && key === def.key && (def.role === "accent" || PALETTE_ROLES.includes(def.role)) ? def.role : key;
}

/** Whether a page uses its own values for a section (else the profile's, always while the profile locks it). */
export const pageCustom = (levels: ThemeLevels, sec: SectionId): boolean =>
  levels.page?.follow?.[sec] === false && !isLocked(levels, sec);

/**
 * The value the theme levels set for a key (undefined: none sets it):
 * the page's own values only where the page is custom for the section.
 */
export function themeSet(levels: ThemeLevels, key: string): ModuleSettingValue | undefined {
  const sec = sectionOfKey(key);
  if (!sec) return undefined;
  const page = pageCustom(levels, sec) ? levels.page?.values?.[key] : undefined;
  return page ?? levels.profile?.values?.[key] ?? levels.base?.[key];
}

/** The theme value of a key (§3.2 `themeVal`): what the levels set, else `THEME_DEFAULTS`. */
export const themeVal = (levels: ThemeLevels, key: string): ModuleSettingValue | undefined =>
  themeSet(levels, key) ?? THEME_DEFAULTS[key];

/** Whether the profile locks a section. */
export const isLocked = (levels: ThemeLevels, sec: SectionId): boolean => levels.profile?.locks?.[sec] === true;

/** Whether every followable section is locked (the old "Force global style"). */
export const allLocked = (theme: WidgetTheme | undefined): boolean => SECTION_IDS.every((sec) => theme?.locks?.[sec] === true);

/** Whether a widget section follows the theme (§3.2 `following`). */
export const following = (levels: ThemeLevels, follow: SectionFlags | undefined, sec: SectionId): boolean =>
  isLocked(levels, sec) || follow?.[sec] !== false;

/** A widget as the resolution reads it. */
export interface ThemedZone {
  settings?: ModuleSettings;
  follow?: SectionFlags;
}

/** Whether a widget's own value of a key applies (not themed, or its section is custom). */
export function ownApplies(levels: ThemeLevels, zone: ThemedZone, key: string): boolean {
  const sec = sectionOfKey(key);
  return !sec || !following(levels, zone.follow, sec);
}

/**
 * A row's value on a widget (§3.2 `value`): a per-widget row or a key no
 * theme sets reads the widget; a following section the theme; a custom
 * section the widget's own value over the theme. The row's default stands
 * in for `THEME_DEFAULTS` (see there).
 */
export function valueOf(
  levels: ThemeLevels,
  zone: ThemedZone,
  def: Pick<ModuleSetting, "key" | "default" | "perWidget" | "role">,
  key = def.key
): ModuleSettingValue | undefined {
  const own = zone.settings?.[key];
  const themeKey = themeKeyOf(def, key);
  const sec = sectionOfKey(themeKey);
  if (def.perWidget || !sec) return own ?? def.default;
  const theme = themeSet(levels, themeKey) ?? def.default ?? THEME_DEFAULTS[themeKey];
  return following(levels, zone.follow, sec) ? theme : (own ?? theme);
}

/** Just the themed keys of a settings map. */
export function themedOf(settings: ModuleSettings | undefined): ModuleSettings {
  return Object.fromEntries(Object.entries(settings ?? {}).filter(([key]) => THEMED_KEYS.has(key)));
}

/** The sections a settings map has own themed values in. */
export function sectionsWithValues(settings: ModuleSettings | undefined): SectionId[] {
  const secs = new Set<SectionId>();
  for (const [key, value] of Object.entries(settings ?? {})) {
    const sec = sectionOfKey(key);
    if (sec && value !== undefined) secs.add(sec);
  }
  return SECTION_IDS.filter((sec) => secs.has(sec));
}

/**
 * Flags with one section set; the flag's default (`true` for follow,
 * `false` for locks) is stored as absent. Empty = undefined.
 */
export function withFlag(flags: SectionFlags | undefined, sec: SectionId, value: boolean, fallback = true): SectionFlags | undefined {
  const { [sec]: _drop, ...rest } = flags ?? {};
  const next: SectionFlags = value === fallback ? rest : { ...rest, [sec]: value };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** A theme with its values replaced (`undefined` values: none; `undefined` when nothing is left). */
export function withThemeValues(theme: WidgetTheme | undefined, values: ModuleSettings | undefined): WidgetTheme | undefined {
  const { values: _old, ...rest } = theme ?? {};
  const next: WidgetTheme = values ? { ...rest, values } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** A theme with one section's flag set: a page's `follow` (default true) or a profile's `locks` (default false). */
export function withSectionFlag(
  theme: WidgetTheme | undefined,
  field: "follow" | "locks",
  sec: SectionId,
  value: boolean
): WidgetTheme | undefined {
  const { [field]: old, ...rest } = theme ?? {};
  const flags = withFlag(old, sec, value, field === "follow");
  const next: WidgetTheme = flags ? { ...rest, [field]: flags } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** A theme with every section locked, or none (the profile theme's "Lock all"). */
export function withAllLocked(theme: WidgetTheme | undefined, on: boolean): WidgetTheme | undefined {
  const { locks: _old, ...rest } = theme ?? {};
  const next: WidgetTheme = on ? { ...rest, locks: Object.fromEntries(SECTION_IDS.map((sec) => [sec, true])) } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const flagsOf = (v: unknown): SectionFlags | undefined => {
  if (!isObject(v)) return undefined;
  const kept = Object.entries(v).filter(([sec, on]) => isSectionId(sec) && typeof on === "boolean");
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
};

/** A stored widget theme, guarded: themed values only, boolean flags per known section. */
export function normalizeWidgetTheme(v: unknown): WidgetTheme | undefined {
  if (!isObject(v)) return undefined;
  const values = isObject(v.values)
    ? Object.fromEntries(
        Object.entries(v.values).filter(
          ([key, value]) => THEMED_KEYS.has(key) && ["string", "number", "boolean"].includes(typeof value)
        )
      )
    : {};
  const theme: WidgetTheme = {
    // An empty object stays: the profile has a style of its own, nothing set yet.
    ...(isObject(v.values) ? { values: values as ModuleSettings } : {}),
    ...(flagsOf(v.follow) ? { follow: flagsOf(v.follow) } : {}),
    ...(flagsOf(v.locks) ? { locks: flagsOf(v.locks) } : {}),
  };
  return Object.keys(theme).length > 0 ? theme : undefined;
}

/** Stored follow flags, guarded (undefined when none). */
export const normalizeFlags = flagsOf;
