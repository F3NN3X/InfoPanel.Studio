import { presetTokens, themeValues, type AppearancePreset } from "./appearance-presets";
import { sameValues } from "./applied-theme";
import type { DashboardConfig, SavedPalette } from "./layout";
import { hslToHex, resolveTheme, THEME_PRESETS, type ThemeTokens } from "./theme";

/**
 * The user's saved palettes (`config.palettes`, handoff SPEC §4.3.3, §8 items 6 and 12): save the current colors,
 * rename, duplicate, delete, who uses one, and the name a level's tokens go by. A theme keeps a copy of its tokens,
 * so nothing refers to a palette by its id. Pure config → config.
 *
 * A palette also carries the widgets' accent (`accent`): the color a screen is known by lives there, not in the
 * tokens (most palettes' primary is near-white). A theme's palette brings its theme's accent, a saved one the accent
 * it was saved with, a built-in its primary when that is a color; a palette without one keeps the screen's accent.
 */

/** Tokens and the accent they come with; `accent` undefined: the screen's stays. */
export interface PaletteColors {
  tokens: ThemeTokens;
  accent?: string;
}

/** A built-in palette's accent: its primary, when that is a color and not a grey or near-white. */
export function builtinAccent(tokens: ThemeTokens): string | undefined {
  const [, s = "0", l = "0"] = tokens.primary.split(" ").map((v) => v.replace("%", ""));
  return Number(s) >= 30 && Number(l) <= 85 ? hslToHex(tokens.primary) : undefined;
}

const accentOf = (accent: unknown): { accent?: string } => (typeof accent === "string" && accent.trim() !== "" ? { accent } : {});

/** The built-in palettes with their accents. */
export const builtinPalettes = (): (PaletteColors & { name: string; label: string })[] =>
  THEME_PRESETS.map((t) => ({ name: t.name, label: t.label, tokens: t.tokens, ...accentOf(builtinAccent(t.tokens)) }));

const sameColor = (a: string | undefined, b: unknown): boolean => typeof b === "string" && a?.toLowerCase() === b.toLowerCase();

const unset = (accent: unknown) => accent === undefined || accent === "";

/** Whether a level showing `tokens` and `accent` shows the palette: its tokens, and its accent when both have one. */
export const showsPalette = (p: PaletteColors, tokens: ThemeTokens, accent: unknown): boolean =>
  sameValues(p.tokens, tokens) && (p.accent === undefined || unset(accent) || sameColor(p.accent, accent));

const withPalettes = (config: DashboardConfig, list: SavedPalette[]): DashboardConfig => ({ ...config, palettes: list.length > 0 ? list : undefined });

const clean = (name: string): string => name.trim().slice(0, 80);

/** Save tokens as a palette, first among the user's own (the picker lists them under Yours). */
export function savePalette(config: DashboardConfig, id: string, name: string, tokens: ThemeTokens, accent?: unknown): DashboardConfig {
  if (!clean(name)) return config;
  return withPalettes(config, [{ id, name: clean(name), tokens: { ...tokens }, ...accentOf(accent) }, ...(config.palettes ?? [])]);
}

export function renamePalette(config: DashboardConfig, id: string, name: string): DashboardConfig {
  if (!clean(name) || !config.palettes?.some((p) => p.id === id)) return config;
  return withPalettes(config, config.palettes.map((p) => (p.id === id ? { ...p, name: clean(name) } : p)));
}

/** A copy named "‹name› copy", right after the palette. */
export function duplicatePalette(config: DashboardConfig, id: string, copyId: string): DashboardConfig {
  const list = config.palettes ?? [];
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return config;
  const copy = { ...list[i], id: copyId, name: clean(`${list[i].name} copy`), tokens: { ...list[i].tokens } };
  return withPalettes(config, [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]);
}

export function deletePalette(config: DashboardConfig, id: string): DashboardConfig {
  if (!config.palettes?.some((p) => p.id === id)) return config;
  return withPalettes(config, config.palettes.filter((p) => p.id !== id));
}

/** Who uses tokens: the saved themes holding them, then each screen that shows them. Pages hold no palette. */
export function paletteUsers(config: DashboardConfig, tokens: ThemeTokens): string[] {
  const themes = (config.appearancePresets ?? []).filter((p) => sameValues(presetTokens(p), tokens)).map((p) => p.name);
  const screens = config.profiles.filter((p) => sameValues(resolveTheme(p).tokens, tokens)).map((p) => p.name);
  return [...themes, ...screens];
}

/** A palette a built-in theme carries (its first theme's id and name), with the theme's accent. */
export interface ThemePalette extends PaletteColors {
  id: string;
  name: string;
}

const samePalette = (a: PaletteColors, b: PaletteColors) => sameValues(a.tokens, b.tokens) && (a.accent ?? "").toLowerCase() === (b.accent ?? "").toLowerCase();

/** The palettes the built-in themes carry, each once, in theme order; one equal to a built-in palette is left out. */
export function themePalettes(themes: readonly AppearancePreset[]): ThemePalette[] {
  const builtins = builtinPalettes();
  const out: ThemePalette[] = [];
  for (const t of themes) {
    const p = { tokens: presetTokens(t), ...accentOf(themeValues(t).accent) };
    const builtin = builtins.some((b) => sameValues(b.tokens, p.tokens) && (p.accent === undefined || samePalette(b, p)));
    if (builtin || out.some((o) => samePalette(o, p))) continue;
    out.push({ id: t.id, name: t.name, ...p });
  }
  return out;
}

/**
 * The name a level's colors go by: a palette whose tokens and accent it shows (built-in, then the user's, then a
 * theme's), else the first whose tokens it shows (a level with no accent of its own: by tokens alone), else Custom.
 */
export function paletteName(tokens: ThemeTokens, saved: readonly SavedPalette[] = [], themes: readonly ThemePalette[] = [], accent?: unknown): string {
  const all = [...builtinPalettes().map((b) => ({ ...b, name: b.label })), ...saved, ...themes];
  const shows = (p: PaletteColors) => showsPalette(p, tokens, accent);
  const own = unset(accent) ? undefined : all.find((p) => p.accent !== undefined && shows(p));
  return (own ?? all.find(shows))?.name ?? "Custom";
}
