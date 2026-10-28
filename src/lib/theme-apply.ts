import type { ModuleSettings } from "@/modules/types";
import type { PageBackground } from "./appearance";
import { saveThemeAt, updateAppearancePreset, type ThemeTarget } from "./appearance-preset-apply";
import { presetTokens, themeValues, type AppearancePreset, type ZoneLook } from "./appearance-presets";
import { sameBackground, sameValues, snapshot, type AppliedTheme, type ZoneWrite } from "./applied-theme";
import { levelApplied } from "./theme-state";
import type { DashboardConfig, MonitorProfile, Placement, ProfilePage } from "./layout";
import { swapColors } from "./screen-templates/looks";
import { SECTION_IDS, SECTION_KEYS, themedOf, withSectionFlag, withThemeValues, type WidgetTheme } from "./theme-model";
import { sameSkin } from "./theme-skins";

export { levelApplied, themeState, type ThemePart, type ThemeState } from "./theme-state";

/**
 * Applying a theme at a level (a screen or a page), the theme editor's one rule (handoff SPEC §5): every pick adds to the current look,
 * and only Reset replaces it. Pure config → config; the studio sets each result in one call (one undo step).
 *
 * A pick writes the theme's palette, skin and corners (a page: its skin and style values only; its palette, corners
 * and background are its screen's), its background unless the level keeps its own, and its other style values where
 * the level still holds what the last theme wrote. What it wrote is stored at the level as its snapshot (`AppliedTheme`):
 * a value that still equals the snapshot is the theme's, one that differs is the level's own and stays. A level with
 * no snapshot (saved before snapshots, or never themed) has nothing of its own: the first pick replaces its look, as
 * Reset does, except that a theme without a background leaves the level's. A template
 * variant also writes into the widgets' own settings (its colour swaps and card opacity); the snapshot keeps what
 * those were, so the next theme or Reset puts them back.
 *
 * Update (`updateThemeEverywhere`) saves the theme, then refreshes every level that last applied it: the same merge,
 * with the parts also replaced only where they still equal the snapshot.
 */

export interface ApplyThemeOptions {
  /** Keep the level's background (off by default: a theme that has a background brings it). */
  keepBackground?: boolean;
}

/** A pick writes its parts; a refresh (Update) only where the level still shows what the theme wrote. */
type Mode = "pick" | "refresh";

/** Keys a pick always writes, whatever the level holds: the skin is a part of the theme. */
const PART_KEYS: ReadonlySet<string> = new Set(["skin"]);
const NONE: ReadonlySet<string> = new Set();

const orNone = (values: ModuleSettings): ModuleSettings | undefined => (Object.keys(values).length > 0 ? values : undefined);

const pick = (values: ModuleSettings | undefined, keys: readonly string[]): ModuleSettings =>
  Object.fromEntries(keys.flatMap((key) => (values?.[key] !== undefined ? [[key, values[key]]] : [])));

const omit = (values: ModuleSettings | undefined, keys: readonly string[]): ModuleSettings =>
  Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => !keys.includes(key)));


/** Whether a level's value is still the one the last theme wrote (the Default skin's two spellings are one). */
const theirs = (key: string, value: unknown, written: unknown): boolean =>
  key === "skin" && value !== undefined && written !== undefined ? sameSkin(value, written) : value === written;

/** What the last theme wrote at a level; with no snapshot, everything it holds (the first pick replaces it). */
const writtenAt = (last: AppliedTheme | undefined, values: ModuleSettings): ModuleSettings => last?.values ?? values;

/** A level's values with a theme's merged in: what still equals the last theme's (`written`) becomes `next`'s, the rest stays. */
function merged(values: ModuleSettings, written: ModuleSettings, next: ModuleSettings, force: ReadonlySet<string>): ModuleSettings {
  const keys = new Set([...Object.keys(values), ...Object.keys(written), ...Object.keys(next)]);
  return Object.fromEntries(
    [...keys].flatMap((key) => {
      const own = !theirs(key, values[key], written[key]) && !force.has(key);
      const value = own ? values[key] : next[key];
      return value === undefined ? [] : [[key, value]];
    })
  );
}

/* ---------------- the widgets' own settings ---------------- */

/** Settings with a theme's writes taken back where they still hold them. */
function restored(settings: ModuleSettings, write: ZoneWrite): ModuleSettings {
  const out = { ...settings };
  for (const [key, value] of Object.entries(write.now)) {
    if (out[key] !== value) continue;
    if (key in write.was) out[key] = write.was[key];
    else delete out[key];
  }
  return out;
}

/** Settings with a variant's colours swapped and its values set where the zone has the key. */
function zoned(settings: ModuleSettings, look: ZoneLook): ModuleSettings {
  const swapped = swapColors(settings, look.swap);
  return Object.fromEntries(Object.entries(swapped).map(([key, value]) => [key, key in (look.values ?? {}) ? look.values![key] : value]));
}

/** What a zone's settings changed from and to (empty when nothing did). */
function writeOf(before: ModuleSettings, after: ModuleSettings): ZoneWrite | undefined {
  const keys = Object.keys(after).filter((key) => after[key] !== before[key]);
  if (keys.length === 0) return undefined;
  return { was: pick(before, keys), now: Object.fromEntries(keys.map((key) => [key, after[key]])) };
}

/**
 * The placements with the last theme's writes taken back and the next one's made (`look`, none for a theme that
 * writes nothing there), with the new writes by placement id.
 */
function rezoned(
  placements: readonly Placement[],
  look: ZoneLook | undefined,
  last: AppliedTheme["zones"]
): { placements: Placement[]; zones: Record<string, ZoneWrite> } {
  const zones: Record<string, ZoneWrite> = {};
  const out = placements.map((z) => {
    const before = last?.[z.id];
    if (!z.settings || (!before && !look)) return z;
    const back = before ? restored(z.settings, before) : z.settings;
    const after = look ? zoned(back, look) : back;
    const write = look ? writeOf(back, after) : undefined;
    if (write) zones[z.id] = write;
    return sameValues(after, z.settings) ? z : { ...z, settings: after };
  });
  return { placements: out, zones };
}

/** A profile's pages (or one of them) rezoned for a theme, and the writes it made there. */
function rezonedPages(pages: readonly ProfilePage[], look: ZoneLook | undefined, last: AppliedTheme["zones"], only?: string) {
  const zones: Record<string, ZoneWrite> = {};
  const out = pages.map((pg) => {
    if (only !== undefined && pg.id !== only) return pg;
    const r = rezoned(pg.placements, look, last);
    Object.assign(zones, r.zones);
    return r.placements === pg.placements ? pg : { ...pg, placements: r.placements };
  });
  return { pages: out, zones: Object.keys(zones).length > 0 ? zones : undefined };
}

/* ---------------- the levels ---------------- */

const withProfile = (config: DashboardConfig, profileId: string, fn: (p: MonitorProfile) => MonitorProfile): DashboardConfig => ({
  ...config,
  profiles: config.profiles.map((p) => (p.id === profileId ? fn(p) : p)),
});

/** A profile without a key (absent, not undefined). */
const without = <T extends object>(holder: T, key: keyof T): T => Object.fromEntries(Object.entries(holder).filter(([k]) => k !== key)) as T;

/** The background a level gets: a pick's theme's unless kept, a refresh's where the level still shows the theme's old one. */
function nextBackground(current: PageBackground | undefined, preset: AppearancePreset, last: AppliedTheme | undefined, mode: Mode, keep: boolean) {
  if (mode === "pick") return !keep && preset.background ? { value: { ...preset.background }, written: true } : { value: current, written: false };
  const theirs = last?.background !== undefined && sameBackground(current, last.background);
  return theirs && preset.background ? { value: { ...preset.background }, written: true } : { value: current, written: theirs };
}


function atScreen(config: DashboardConfig, profileId: string, preset: AppearancePreset, mode: Mode, keep: boolean): DashboardConfig {
  return withProfile(config, profileId, (p) => {
    const last = p.appliedTheme;
    const next = themeValues(preset);
    const tokens = presetTokens(preset);
    const keepTokens = mode === "refresh" && !sameValues(p.theme, last?.tokens);
    const keepRadius = mode === "refresh" && p.radius !== last?.radius;
    const bg = nextBackground(p.background, preset, last, mode, keep);
    const own = p.widgetTheme?.values ?? {};
    const values = merged(own, writtenAt(last, own), next, mode === "pick" ? PART_KEYS : NONE);
    const { pages, zones } = mode === "pick" ? rezonedPages(p.pages, preset.zoneLook, last?.zones) : { pages: p.pages, zones: last?.zones };
    const out: MonitorProfile = {
      ...p,
      theme: keepTokens ? p.theme : { ...tokens },
      radius: keepRadius ? p.radius : preset.radius,
      widgetTheme: withThemeValues(p.widgetTheme, orNone(values) ?? (p.widgetTheme?.values !== undefined ? {} : undefined)),
      pages,
      appliedTheme: snapshot(preset, {
        tokens: { ...tokens },
        radius: preset.radius,
        ...(bg.written && preset.background ? { background: { ...preset.background } } : {}),
        values: next,
        ...(zones ? { zones } : {}),
      }),
    };
    return bg.value === undefined ? without(out, "background") : { ...out, background: bg.value };
  });
}

/**
 * A page's widget theme with a theme's values merged in, section by section (a page uses its values only in the
 * sections it customises): a section the theme sets is customised; one left with no values follows its screen again;
 * a section its screen locks is left alone.
 */
function mergedPage(theme: WidgetTheme | undefined, locks: WidgetTheme["locks"], preset: AppearancePreset, last: AppliedTheme | undefined, mode: Mode) {
  const style = themedOf(preset.style);
  const written: ModuleSettings = {};
  let out = theme;
  for (const sec of SECTION_IDS) {
    if (locks?.[sec] === true) continue;
    const keys = SECTION_KEYS[sec];
    const custom = out?.follow?.[sec] === false;
    const next = pick(style, keys);
    Object.assign(written, next);
    if (!custom && Object.keys(next).length === 0) continue;
    const own = custom ? pick(out?.values, keys) : {};
    const values = merged(own, last ? pick(last.values, keys) : own, next, mode === "pick" ? PART_KEYS : NONE);
    out = withThemeValues(out, orNone({ ...omit(out?.values, keys), ...values }));
    out = withSectionFlag(out, "follow", sec, Object.keys(values).length === 0);
  }
  return { theme: out, written };
}

function atPage(config: DashboardConfig, profileId: string, pageId: string, preset: AppearancePreset, mode: Mode): DashboardConfig {
  return withProfile(config, profileId, (p) => {
    const page = p.pages.find((pg) => pg.id === pageId);
    if (!page) return p;
    const last = page.appliedTheme;
    const { theme, written } = mergedPage(page.widgetTheme, p.widgetTheme?.locks, preset, last, mode);
    const { pages, zones } = mode === "pick" ? rezonedPages(p.pages, preset.zoneLook, last?.zones, pageId) : { pages: p.pages, zones: last?.zones };
    return {
      ...p,
      pages: pages.map((pg) => {
        if (pg.id !== pageId) return pg;
        const { widgetTheme: _old, ...rest } = pg;
        return { ...rest, ...(theme ? { widgetTheme: theme } : {}), appliedTheme: snapshot(preset, { values: written, ...(zones ? { zones } : {}) }) };
      }),
    };
  });
}

function applyAt(config: DashboardConfig, preset: AppearancePreset, target: ThemeTarget, mode: Mode, keep: boolean): DashboardConfig {
  if (target.kind === "profile") return atScreen(config, target.profileId, preset, mode, keep);
  return atPage(config, target.profileId, target.pageId, preset, mode);
}

/** Apply a theme at a level, adding to its look (see the module comment). */
export const applyTheme = (config: DashboardConfig, preset: AppearancePreset, target: ThemeTarget, options: ApplyThemeOptions = {}): DashboardConfig =>
  applyAt(config, preset, target, "pick", options.keepBackground === true);

/** A snapshot reduced to its writes into the widgets (Reset clears the rest of the level). */
const writesOnly = (applied: AppliedTheme | undefined): { appliedTheme?: AppliedTheme } => (applied ? { appliedTheme: { ...applied, values: {} } } : {});

/**
 * Reset to a theme: the level's parts set exactly to the theme's (its background included, or none), and every
 * fine-tune value the level holds cleared. A page clears the sections its screen doesn't lock. Pages and widgets
 * below keep their own.
 */
export function resetToTheme(config: DashboardConfig, preset: AppearancePreset, target: ThemeTarget): DashboardConfig {
  // The snapshot keeps only what the last theme wrote into the widgets, so the pick takes that back.
  if (target.kind === "profile") {
    const cleared = withProfile(config, target.profileId, (p) => {
      const { background: _bg, ...rest } = p;
      return { ...rest, widgetTheme: withThemeValues(p.widgetTheme, undefined), ...writesOnly(p.appliedTheme) };
    });
    return applyTheme(cleared, preset, target);
  }
  const cleared = withProfile(config, target.profileId, (p) => {
    const locks = p.widgetTheme?.locks;
    const open = SECTION_IDS.filter((sec) => locks?.[sec] !== true);
    return {
      ...p,
      pages: p.pages.map((pg) => {
        if (pg.id !== target.pageId) return pg;
        const keys = open.flatMap((sec) => SECTION_KEYS[sec]);
        const theme = open.reduce((t, sec) => withSectionFlag(t, "follow", sec, true), withThemeValues(pg.widgetTheme, orNone(omit(pg.widgetTheme?.values, keys))));
        const { widgetTheme: _old, ...rest } = pg;
        return { ...rest, ...(theme ? { widgetTheme: theme } : {}), ...writesOnly(pg.appliedTheme) };
      }),
    };
  });
  return applyTheme(cleared, preset, target);
}

/* ---------------- where a theme is used, and what changed ---------------- */

export interface ThemeUse {
  target: ThemeTarget;
  /** The screen's name, or the page's. */
  name: string;
}

/** Every level that last applied a theme ("used by", and what Update refreshes). */
export function themeUses(config: DashboardConfig, id: string): ThemeUse[] {
  const uses: ThemeUse[] = [];
  for (const p of config.profiles) {
    if (p.appliedTheme?.id === id) uses.push({ target: { kind: "profile", profileId: p.id }, name: p.name });
    for (const pg of p.pages) if (pg.appliedTheme?.id === id) uses.push({ target: { kind: "page", profileId: p.id, pageId: pg.id }, name: pg.name });
  }
  return uses;
}

/**
 * Update ‹name›: the saved theme rewritten from a level's look, then every level that last applied it refreshed.
 * Values a level changed since stay its own.
 */
export function updateThemeEverywhere(config: DashboardConfig, id: string, from: ThemeTarget): DashboardConfig {
  const saved = updateAppearancePreset(config, id, from);
  const preset = saved.appearancePresets?.find((p) => p.id === id);
  if (!preset) return config;
  return themeUses(saved, id).reduce((c, use) => applyAt(c, preset, use.target, "refresh", true), saved);
}

/**
 * Save as new: a level's look saved as a theme, which that level then counts as applied (its look is unchanged, the
 * widgets keep what the last theme wrote into them).
 */
export function saveAsTheme(config: DashboardConfig, target: ThemeTarget, id: string, name: string, includeBackground = true): DashboardConfig {
  const saved = saveThemeAt(config, target, id, name, includeBackground);
  const preset = saved.appearancePresets?.find((p) => p.id === id);
  if (!preset) return config;
  const zones = levelApplied(saved, target)?.zones;
  const locks = target.kind === "page" ? saved.profiles.find((p) => p.id === target.profileId)?.widgetTheme?.locks : undefined;
  const values =
    target.kind === "profile"
      ? themeValues(preset)
      : pick(themedOf(preset.style), SECTION_IDS.filter((sec) => locks?.[sec] !== true).flatMap((sec) => SECTION_KEYS[sec]));
  const parts = target.kind === "page" ? {} : { tokens: { ...presetTokens(preset) }, radius: preset.radius, ...(preset.background ? { background: { ...preset.background } } : {}) };
  return withApplied(saved, target, snapshot(preset, { ...parts, values, ...(zones ? { zones } : {}) }));
}

function withApplied(config: DashboardConfig, target: ThemeTarget, applied: AppliedTheme | undefined): DashboardConfig {
  const set = <T extends { appliedTheme?: AppliedTheme }>(holder: T): T => (applied ? { ...holder, appliedTheme: applied } : without(holder, "appliedTheme"));
  return withProfile(config, target.profileId, (p) =>
    target.kind === "profile" ? set(p) : { ...p, pages: p.pages.map((pg) => (pg.id === target.pageId ? set(pg) : pg)) }
  );
}
