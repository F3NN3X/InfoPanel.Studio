import { normalizeAppearancePresets, type AppearancePreset } from "./appearance-presets";
import type { DashboardConfig } from "./layout";
import { applyLookToLevel, applyThemeToLevel } from "./theme-apply";

/**
 * A theme previewed without applying it (Theme › a card): the config as Apply would leave it, which the studio's canvas
 * draws and, with "Show on the kiosks too", the kiosks draw from the control channel's `themePreview`. Nothing here
 * writes the config: Apply is the studio's one `setConfig` of the same result. Pure.
 */

/** Where a preview draws and Apply writes: every screen, one screen, or one page of it. */
export type PreviewScope = { kind: "all" } | { kind: "profile"; profileId: string } | { kind: "page"; profileId: string; pageId: string };

export interface ThemePreview {
  preset: AppearancePreset;
  /** A gallery Look or a pack (it keeps the level's own colors, corners and fine-tune), not a saved theme. */
  look: boolean;
  scope: PreviewScope;
  keepBackground: boolean;
}

/**
 * The config with the preview applied, by the same rule as Switch theme: a Look by `applyLookToLevel`, a theme by
 * `applyThemeToLevel`; All screens applies at each screen in turn (as Apply to other screens does).
 */
export function applyPreview(config: DashboardConfig, p: ThemePreview): DashboardConfig {
  const apply = p.look ? applyLookToLevel : applyThemeToLevel;
  const options = { keepBackground: p.keepBackground };
  if (p.scope.kind === "all") return config.profiles.reduce((c, profile) => apply(c, p.preset, { kind: "profile", profileId: profile.id }, options), config);
  return apply(config, p.preset, p.scope, options);
}

/** Whether a preview draws on a screen. */
export const previewCovers = (scope: PreviewScope, profileId: string): boolean => scope.kind === "all" || scope.profileId === profileId;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function scopeOf(v: unknown): PreviewScope | undefined {
  if (!isObject(v)) return undefined;
  if (v.kind === "all") return { kind: "all" };
  if (typeof v.profileId !== "string") return undefined;
  if (v.kind === "profile") return { kind: "profile", profileId: v.profileId };
  if (v.kind === "page" && typeof v.pageId === "string") return { kind: "page", profileId: v.profileId, pageId: v.pageId };
  return undefined;
}

/**
 * A preview as the control channel carries it, checked as a stored theme is (`normalizeAppearancePresets`: its tokens,
 * style values and background), so a malformed one is never drawn. A built-in theme's id is kept.
 */
export function parsePreview(v: unknown): ThemePreview | undefined {
  if (!isObject(v) || !isObject(v.preset)) return undefined;
  const scope = scopeOf(v.scope);
  const preset = normalizeAppearancePresets([{ ...v.preset, id: "preview" }])?.[0];
  if (!scope || !preset) return undefined;
  const id = typeof v.preset.id === "string" && v.preset.id ? v.preset.id : preset.id;
  return { preset: { ...preset, id }, look: v.look === true, scope, keepBackground: v.keepBackground === true };
}
