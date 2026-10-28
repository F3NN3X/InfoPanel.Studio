import type { ModuleSettings } from "@/modules/types";
import { normalizeBackground, type PageBackground } from "./appearance";
import { isValidStyleValue, presetTokens, themeValues, type AppearancePreset } from "./appearance-presets";
import type { DashboardConfig } from "./layout";
import { normalizeThemePatch, type ThemeTokens } from "./theme";

/**
 * What applying a theme wrote at a level (a screen or a page), stored there as its snapshot
 * (`lib/theme-apply.ts`). A value that still equals the snapshot is the theme's: the next theme replaces it, Reset
 * clears it, and Update rewrites it. A value that differs is the level's own and is kept. Nothing marks values
 * one by one.
 */
export interface AppliedTheme {
  /** The theme's id (a saved theme's, or `builtin:tpl-…` for a template theme). */
  id: string;
  /** Its name when applied: the card still names a theme deleted since. */
  name: string;
  /** The color tokens and corner radius it wrote (a screen; a page has none). */
  tokens?: Partial<ThemeTokens>;
  radius?: number;
  /** The background, only when it was included. */
  background?: PageBackground;
  /** The widget-style values it wrote at this level, its skin among them. */
  values: ModuleSettings;
  /**
   * What it wrote into widgets' own settings (a template variant's colour swaps and card opacity), by placement id:
   * the value it wrote, and the one it replaced (a key missing from `was` was unset).
   */
  zones?: Readonly<Record<string, ZoneWrite>>;
}

export interface ZoneWrite {
  was: ModuleSettings;
  now: ModuleSettings;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): boolean => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

const scalars = (v: unknown): ModuleSettings => (isObject(v) ? (Object.fromEntries(Object.entries(v).filter(([, x]) => isScalar(x))) as ModuleSettings) : {});

function zonesOf(v: unknown): Record<string, ZoneWrite> | undefined {
  if (!isObject(v)) return undefined;
  const kept = Object.entries(v).flatMap(([id, w]): [string, ZoneWrite][] => {
    if (!isObject(w)) return [];
    const now = scalars(w.now);
    return Object.keys(now).length > 0 ? [[id, { was: scalars(w.was), now }]] : [];
  });
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** A stored snapshot, guarded: an id and a name are required; look values that aren't valid options are dropped. */
export function normalizeAppliedTheme(v: unknown): AppliedTheme | undefined {
  if (!isObject(v) || typeof v.id !== "string" || !v.id || v.id.length > 120 || typeof v.name !== "string") return undefined;
  const tokens = normalizeThemePatch(v.tokens);
  const background = normalizeBackground(v.background);
  const zones = zonesOf(v.zones);
  const values = isObject(v.values) ? (Object.fromEntries(Object.entries(v.values).filter(([key, value]) => isValidStyleValue(key, value))) as ModuleSettings) : {};
  return {
    id: v.id,
    name: v.name.slice(0, 80),
    ...(tokens ? { tokens } : {}),
    ...(typeof v.radius === "number" && Number.isFinite(v.radius) ? { radius: v.radius } : {}),
    ...(background ? { background } : {}),
    values,
    ...(zones ? { zones } : {}),
  };
}

/** Whether two maps hold the same values, whatever the key order. */
export function sameValues(a: object | undefined, b: object | undefined): boolean {
  const x = (a ?? {}) as Record<string, unknown>;
  const y = (b ?? {}) as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((key) => x[key] === y[key]);
}

export const sameBackground = (a: PageBackground | undefined, b: PageBackground | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A theme's snapshot with what it wrote. */
export const snapshot = (preset: Pick<AppearancePreset, "id" | "name">, rest: Omit<AppliedTheme, "id" | "name">): AppliedTheme => ({ id: preset.id, name: preset.name, ...rest });

/** The look a screen shows, as a theme's snapshot compares it. */
export interface LevelLook {
  values: ModuleSettings | undefined;
  tokens: Partial<ThemeTokens> | undefined;
  radius: number | undefined;
  background: PageBackground | undefined;
}

/**
 * The snapshot of a look that is exactly a saved theme (its tokens, corners and the style values it would write over
 * `shadow`, the style it sat on), else none: the look is a custom one.
 */
export function guessApplied(saved: readonly AppearancePreset[], look: LevelLook, shadow?: ModuleSettings): AppliedTheme | undefined {
  const p = saved.find((s) => sameValues(look.tokens, presetTokens(s)) && look.radius === s.radius && sameValues(look.values ?? {}, themeValues(s, shadow)));
  if (!p) return undefined;
  const bg = p.background !== undefined && sameBackground(look.background, p.background);
  return snapshot(p, { tokens: { ...presetTokens(p) }, radius: p.radius, ...(bg ? { background: { ...p.background! } } : {}), values: themeValues(p, shadow) });
}

/**
 * The snapshot of each screen that shows exactly a saved theme, for a config saved before screens kept one (the
 * v16 migration runs it before it copies the dashboard's look down, `shadow` that style). Anything less than an
 * exact match keeps none. Nothing a screen shows changes. Pages keep none.
 */
export function guessAppliedThemes(config: DashboardConfig, shadow?: ModuleSettings): DashboardConfig {
  const saved = config.appearancePresets ?? [];
  if (saved.length === 0) return config;
  return {
    ...config,
    profiles: config.profiles.map((p) => {
      if (p.appliedTheme || !p.theme) return p;
      const guess = guessApplied(saved, { values: p.widgetTheme?.values, tokens: p.theme, radius: p.radius, background: p.background }, shadow);
      return guess ? { ...p, appliedTheme: guess } : p;
    }),
  };
}
