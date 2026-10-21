/**
 * The Library items the config and the app supply, shown beside the server's: saved panels, Styles and
 * Themes (the config's `panelPresets`, `stylePresets`, `appearancePresets`) and the built-in Styles and
 * palettes. They are read-only stand-ins: renamed and removed where they live, never from the Library.
 */
import { presetTokens } from "@/lib/appearance-presets";
import { BUILTIN_STYLES } from "@/lib/builtin-styles";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";

/** Config presets shown as library items carry these id prefixes; they live in the config, not the library. */
export const CONFIG_PANEL = "cfg-panel:";
export const CONFIG_STYLE = "cfg-style:";
export const CONFIG_THEME = "cfg-theme:";
/** The built-ins: palettes and Styles that ship with the app. */
export const BUILTIN_THEME = "builtin-theme:";
export const BUILTIN_STYLE = "builtin-style:";
export const CONFIG_PREFIXES: readonly string[] = [CONFIG_PANEL, CONFIG_STYLE, CONFIG_THEME, BUILTIN_THEME, BUILTIN_STYLE];

const AT = "1970-01-01T00:00:00.000Z";

/** A theme card's three swatches: the page, the surface, the accent. */
const swatchOf = (t: ThemeTokens): string[] => [t.background, t.secondary, t.primary].map((c) => `hsl(${c})`);

function stand(id: string, kind: LibraryItem["kind"], name: string, meta: Record<string, unknown>, data: unknown, order: number): LibraryItem {
  // The epoch stamps keep the config's own order under "Recently added"; their uses aren't counted, so never flagged Unused.
  const at = new Date(Date.parse(AT) + order).toISOString();
  return { id, kind, name, createdAt: at, updatedAt: at, files: [], meta, copies: [{ profileId: "*" }], data };
}

type Source = Pick<DashboardConfig, "panelPresets" | "stylePresets" | "appearancePresets">;

/** The config's saved panels, Styles and Themes, then the built-in Styles and palettes, as library items. */
export function configItems(config: Source): LibraryItem[] {
  const panels = (config.panelPresets ?? []).map((p, i) => stand(CONFIG_PANEL + p.id, "panel", p.name, { cols: p.colSpan, rows: p.rowSpan, source: "config" }, p, i));
  const styles = (config.stylePresets ?? []).map((s, i) => stand(CONFIG_STYLE + s.id, "style", s.name, { source: "config" }, s, i));
  const themes = (config.appearancePresets ?? []).map((t, i) => stand(CONFIG_THEME + t.id, "theme", t.name, { source: "config", swatch: swatchOf(presetTokens(t)) }, t, i));
  const builtinThemes = THEME_PRESETS.map((t, i) => stand(BUILTIN_THEME + t.name, "theme", t.label, { source: "builtin", swatch: swatchOf(t.tokens) }, t, i));
  const builtinStyles = BUILTIN_STYLES.map((s, i) => stand(BUILTIN_STYLE + s.id, "style", s.name, { source: "builtin" }, s, i));
  return [...panels, ...styles, ...themes, ...builtinThemes, ...builtinStyles];
}
