import { presetTokens, type AppearancePreset } from "./appearance-presets";
import { sameValues } from "./applied-theme";
import type { DashboardConfig, SavedPalette } from "./layout";
import { resolveTheme, THEME_PRESETS, type ThemeTokens } from "./theme";

/**
 * The user's saved palettes (`config.palettes`, handoff SPEC §4.3.3, §8 items 6 and 12): save the current colors,
 * rename, duplicate, delete, who uses one, and the name a level's tokens go by. A theme keeps a copy of its tokens,
 * so nothing refers to a palette by its id. Pure config → config.
 */

const withPalettes = (config: DashboardConfig, list: SavedPalette[]): DashboardConfig => ({ ...config, palettes: list.length > 0 ? list : undefined });

const clean = (name: string): string => name.trim().slice(0, 80);

/** Save tokens as a palette, first among the user's own (the picker lists them under Yours). */
export function savePalette(config: DashboardConfig, id: string, name: string, tokens: ThemeTokens): DashboardConfig {
  if (!clean(name)) return config;
  return withPalettes(config, [{ id, name: clean(name), tokens: { ...tokens } }, ...(config.palettes ?? [])]);
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
  const copy = { id: copyId, name: clean(`${list[i].name} copy`), tokens: { ...list[i].tokens } };
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

/** A palette a built-in theme carries (its first theme's id and name). */
export interface ThemePalette {
  id: string;
  name: string;
  tokens: ThemeTokens;
}

/** The palettes the built-in themes carry, each once, in theme order; one equal to a built-in palette is left out. */
export function themePalettes(themes: readonly AppearancePreset[]): ThemePalette[] {
  const out: ThemePalette[] = [];
  for (const t of themes) {
    const tokens = presetTokens(t);
    if (THEME_PRESETS.some((p) => sameValues(p.tokens, tokens)) || out.some((p) => sameValues(p.tokens, tokens))) continue;
    out.push({ id: t.id, name: t.name, tokens });
  }
  return out;
}

/** The name tokens go by: the built-in they equal, else the user's palette, else a theme's, else Custom. */
export function paletteName(tokens: ThemeTokens, saved: readonly SavedPalette[] = [], themes: readonly ThemePalette[] = []): string {
  const same = (p: { tokens: ThemeTokens }) => sameValues(p.tokens, tokens);
  return THEME_PRESETS.find(same)?.label ?? saved.find(same)?.name ?? themes.find(same)?.name ?? "Custom";
}
