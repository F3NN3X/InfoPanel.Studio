import { withBackground, type PageBackground } from "@/lib/appearance";
import { GENERAL_DEFAULTS, withGeneral, type GeneralFont } from "@/lib/general";
import { LEVEL_LABELS, type InheritLevel, type InheritState } from "@/lib/inheritance";
import type { DashboardConfig, MonitorProfile, ProfilePage } from "@/lib/layout";
import { DEFAULT_THEME, resolveTheme, type ThemeTokens } from "@/lib/theme";
import { SECTION_KEYS, sectionsWithValues, type SectionId } from "@/lib/theme-model";
import type { ModuleSettings } from "@/modules/types";
import { customiseInheritance, resetInheritance } from "./inheritance-actions";
import { withLock, withPageFollow, withScopeValues, type ThemeScope } from "./theme-editor-model";

/**
 * Theme's fine-tune sections as data (handoff SPEC §4.3.2): the eight sections in their order, the stores each
 * one writes (widget-style sections, and the page font), its chip at a scope, and the edits (Reset to inherited,
 * Change here, the lock, the two-level writes of the theme parts). Pure config → config.
 */

/** The level Theme edits, with the ids that find it. */
export type ThemeAt =
  | { level: "all" }
  | { level: "screen"; profileId: string }
  | { level: "page"; profileId: string; pageId: string };

export type ThemeCardId = "colors" | "type" | "spacing" | "surface" | "format" | "thresholds" | "motion" | "css";

/** The two-level data (All screens → Screen, no page level): the theme's palette, corners and background, and the page font. */
export type TwoLevel = "tokens" | "radius" | "font" | "background";

export interface ThemeCard {
  id: ThemeCardId;
  title: string;
  /** The widget-style sections it covers (its chip, lock, Reset and exceptions). */
  sections: readonly SectionId[];
  /** The page font (Text): the one two-level datum that is fine-tune, not a theme part. */
  data?: "font";
  /** A lock toggle in its header at Screen scope. */
  lockable: boolean;
}

/**
 * The sections, in order. Colors holds the widget colors (the palette's tokens are a theme part, shown under its
 * More); Text the page font and the widget type; Shape & spacing the widget spacing (the corners are a theme part).
 * Surface & border also covers the skin section (its stroke, graph and meter rows): the skin is a theme part, and
 * locks with the surface. The background is a theme part, not a section.
 */
export const THEME_CARDS: readonly ThemeCard[] = [
  { id: "colors", title: "Colors", sections: ["colors", "palette"], lockable: true },
  { id: "type", title: "Text", sections: ["type"], data: "font", lockable: true },
  { id: "spacing", title: "Shape & spacing", sections: ["spacing"], lockable: true },
  { id: "surface", title: "Surface & border", sections: ["surface", "skin", "border"], lockable: true },
  { id: "format", title: "Units & format", sections: ["format"], lockable: true },
  { id: "thresholds", title: "Thresholds", sections: ["thresholds"], lockable: true },
  { id: "motion", title: "Motion", sections: ["motion"], lockable: true },
  { id: "css", title: "Custom CSS", sections: ["css"], lockable: false },
];

export const themeCard = (id: ThemeCardId): ThemeCard => THEME_CARDS.find((c) => c.id === id)!;

/** The card a widget-style section is edited in. */
export const cardOfSection = (sec: SectionId): ThemeCard => THEME_CARDS.find((c) => c.sections.includes(sec))!;

/** Theme's scope as the old `ThemeScope` (the widget-style writers take it). */
export const scopeOfAt = (at: ThemeAt): ThemeScope =>
  at.level === "all" ? { kind: "base" } : at.level === "screen" ? { kind: "profile" } : { kind: "page", pageId: at.pageId };

/** Theme's scope from a link's `ThemeScope` and screen. */
export const atOfScope = (scope: ThemeScope, profileId: string): ThemeAt =>
  scope.kind === "base" ? { level: "all" } : scope.kind === "profile" ? { level: "screen", profileId } : { level: "page", profileId, pageId: scope.pageId };

/** The default corner radius (rem), as `defaultConfig` stores it. */
const DEFAULT_RADIUS = 0.5;

const profileOf = (config: DashboardConfig, id: string): MonitorProfile | undefined => config.profiles.find((p) => p.id === id);

const pageIn = (profile: MonitorProfile | undefined, id: string): ProfilePage | undefined => profile?.pages.find((pg) => pg.id === id);

const valuesSet = (values: ModuleSettings | undefined, sec: SectionId): boolean => SECTION_KEYS[sec].some((key) => values?.[key] !== undefined);

/** Whether All screens (no profile) or a screen holds its own value of a two-level datum. */
export function dataSet(config: DashboardConfig, data: TwoLevel, profile?: MonitorProfile): boolean {
  if (profile) {
    switch (data) {
      case "tokens":
        return profile.theme !== undefined;
      case "radius":
        return profile.radius !== undefined;
      case "font":
        return profile.font !== undefined;
      case "background":
        return profile.background !== undefined;
    }
  }
  switch (data) {
    case "tokens":
      return JSON.stringify(config.theme) !== JSON.stringify(DEFAULT_THEME);
    case "radius":
      return config.radius !== DEFAULT_RADIUS;
    case "font":
      return config.general?.font !== undefined;
    case "background":
      return config.background !== undefined;
  }
}

/** Whether a level sets anything of a card: All screens or a screen holds a value of it, a page changes a section of it. */
export function cardSet(config: DashboardConfig, at: ThemeAt, card: ThemeCard): boolean {
  if (at.level === "all") return card.sections.some((sec) => valuesSet(config.style, sec)) || (card.data !== undefined && dataSet(config, card.data));
  const profile = profileOf(config, at.profileId);
  if (!profile) return false;
  if (at.level === "screen")
    return (
      card.sections.some((sec) => valuesSet(profile.widgetTheme?.values, sec)) || (card.data !== undefined && dataSet(config, card.data, profile))
    );
  const page = pageIn(profile, at.pageId);
  return card.sections.some((sec) => page?.widgetTheme?.follow?.[sec] === false);
}

/** Whether a screen locks a card (every section of it; a card without sections has no lock). */
export function cardLocked(config: DashboardConfig, profileId: string, card: ThemeCard): boolean {
  const locks = profileOf(config, profileId)?.widgetTheme?.locks;
  return card.sections.length > 0 && card.sections.every((sec) => locks?.[sec] === true);
}

/** How many sections a level sets (a screen's "N own"). */
export const ownCount = (config: DashboardConfig, at: ThemeAt): number => THEME_CARDS.filter((card) => cardSet(config, at, card)).length;

export interface CardInherit {
  state: InheritState;
  from?: InheritLevel;
  fromName?: string;
  /** Locked, but the page keeps its own values for the card (they return on unlock). */
  keptOverride: boolean;
}

/**
 * A card's chip at a scope (SPEC §7.2): All screens `base` or `builtin`; a screen `custom` when it owns the card,
 * else inherited from All screens; a page `custom` (from Screen), or `locked` by the screen.
 */
export function cardInherit(config: DashboardConfig, at: ThemeAt, card: ThemeCard): CardInherit {
  const set = cardSet(config, at, card);
  if (at.level === "all") return { state: set ? "base" : "builtin", keptOverride: false };
  if (at.level === "screen") return { state: set ? "custom" : "inherited", from: "all", fromName: LEVEL_LABELS.all, keptOverride: false };
  const locked = cardLocked(config, at.profileId, card);
  return {
    state: locked ? "locked" : set ? "custom" : "inherited",
    from: "screen",
    fromName: profileOf(config, at.profileId)?.name,
    keptOverride: locked && set,
  };
}

// -- edits ------------------------------------------------------------------------

/** The config with one screen changed. */
const withProfile = (config: DashboardConfig, profileId: string, fn: (p: MonitorProfile) => MonitorProfile): DashboardConfig => ({
  ...config,
  profiles: config.profiles.map((p) => (p.id === profileId ? fn(p) : p)),
});

/** The profile without a key (absent, not undefined). */
const without = (p: MonitorProfile, key: keyof MonitorProfile): MonitorProfile =>
  Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)) as unknown as MonitorProfile;

const DATA_KEY: Readonly<Record<TwoLevel, keyof MonitorProfile>> = { tokens: "theme", radius: "radius", font: "font", background: "background" };

/** All screens back to the built-in value, or a screen back to All screens (its own value dropped). */
function resetData(config: DashboardConfig, at: Exclude<ThemeAt, { level: "page" }>, data: TwoLevel): DashboardConfig {
  if (at.level === "screen") return withProfile(config, at.profileId, (p) => without(p, DATA_KEY[data]));
  switch (data) {
    case "tokens":
      return { ...config, theme: { ...DEFAULT_THEME } };
    case "radius":
      return { ...config, radius: DEFAULT_RADIUS };
    case "font":
      return { ...config, general: withGeneral(config.general, "font", undefined) };
    case "background":
      return withBackground(config, { kind: "all" }, undefined);
  }
}

/** A screen takes All screens' value as its own. */
function customiseData(config: DashboardConfig, profileId: string, data: TwoLevel): DashboardConfig {
  return withProfile(config, profileId, (p) => {
    switch (data) {
      case "tokens":
        return { ...p, theme: { ...config.theme } };
      case "radius":
        return { ...p, radius: config.radius };
      case "font":
        return { ...p, font: config.general?.font ?? GENERAL_DEFAULTS.font };
      case "background":
        return { ...p, background: config.background ? { ...config.background } : { type: "none" } };
    }
  });
}

/**
 * Reset to inherited: All screens back to the built-in defaults, a screen back to All screens (its values for the
 * card dropped), a page following its screen again (its values stay stored, they return on Change here).
 */
export function resetCard(config: DashboardConfig, at: ThemeAt, card: ThemeCard): DashboardConfig {
  const sections = card.sections.reduce((c, sec) => resetInheritance(c, sec, at), config);
  return card.data && at.level !== "page" ? resetData(sections, at, card.data) : sections;
}

/** Change here: a screen copies All screens' values of the card, a page stops following its unlocked sections. */
export function customiseCard(config: DashboardConfig, at: ThemeAt, card: ThemeCard): DashboardConfig {
  if (at.level === "all") return config;
  if (at.level === "page") {
    const locks = profileOf(config, at.profileId)?.widgetTheme?.locks;
    return card.sections.filter((sec) => locks?.[sec] !== true).reduce((c, sec) => withPageFollow(c, at.profileId, at.pageId, sec, false), config);
  }
  const sections = card.sections.reduce((c, sec) => customiseInheritance(c, sec, at), config);
  return card.data ? customiseData(sections, at.profileId, card.data) : sections;
}

/** Lock or unlock a card on a screen; the pages' and widgets' own values stay stored either way. */
export const withCardLock = (config: DashboardConfig, profileId: string, card: ThemeCard, on: boolean): DashboardConfig =>
  card.sections.reduce((c, sec) => withLock(c, profileId, sec, on), config);

/** Edit a level's widget-style values. */
export const withValuesAt = (config: DashboardConfig, at: ThemeAt, fn: (values: ModuleSettings) => ModuleSettings): DashboardConfig =>
  withScopeValues(config, at.level === "all" ? "" : at.profileId, scopeOfAt(at), fn);

/**
 * Style values written at a level (a skin and its surface): merged into its values. A page uses its own values only
 * in the sections it changes, so it changes the ones the values are in, as applying a theme to a page does; a section
 * its screen locks stays the screen's.
 */
export function withLookAt(config: DashboardConfig, at: ThemeAt, settings: ModuleSettings): DashboardConfig {
  const written = withValuesAt(config, at, (values) => ({ ...values, ...settings }));
  if (at.level !== "page") return written;
  const locks = profileOf(written, at.profileId)?.widgetTheme?.locks;
  return sectionsWithValues(settings)
    .filter((sec) => locks?.[sec] !== true)
    .reduce((c, sec) => withPageFollow(c, at.profileId, at.pageId, sec, false), written);
}

type TwoLevelAt = Exclude<ThemeAt, { level: "page" }>;

/** One color token: All screens', or the screen's own set (starting from what it shows). */
export function withToken(config: DashboardConfig, at: TwoLevelAt, key: keyof ThemeTokens, value: string): DashboardConfig {
  if (at.level === "all") return { ...config, theme: { ...config.theme, [key]: value } };
  return withProfile(config, at.profileId, (p) => ({ ...p, theme: { ...resolveTheme(config, p).tokens, [key]: value } }));
}

/** Every color token at once (a palette from the Palette picker). */
export function withTokens(config: DashboardConfig, at: TwoLevelAt, tokens: ThemeTokens): DashboardConfig {
  if (at.level === "all") return { ...config, theme: { ...tokens } };
  return withProfile(config, at.profileId, (p) => ({ ...p, theme: { ...tokens } }));
}

/** The corner radius (rem) of All screens or a screen. */
export function withThemeRadius(config: DashboardConfig, at: TwoLevelAt, radius: number): DashboardConfig {
  if (at.level === "all") return { ...config, radius };
  return withProfile(config, at.profileId, (p) => ({ ...p, radius }));
}

/**
 * The page font (SPEC §11.1, PLAN decision 10): All screens writes `general.font` (System is stored as none, as
 * before); a screen writes its own `profile.font`.
 */
export function withPageFont(config: DashboardConfig, at: TwoLevelAt, font: GeneralFont): DashboardConfig {
  if (at.level === "all") return { ...config, general: withGeneral(config.general, "font", font === "system" ? undefined : font) };
  return withProfile(config, at.profileId, (p) => ({ ...p, font }));
}

/** The page background of All screens or a screen. */
export const withBackgroundAt = (config: DashboardConfig, at: TwoLevelAt, bg: PageBackground | undefined): DashboardConfig =>
  withBackground(config, at.level === "all" ? { kind: "all" } : { kind: "profile", profileId: at.profileId }, bg);
