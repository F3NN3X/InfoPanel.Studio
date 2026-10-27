/**
 * The Library items the config and the app supply, shown beside the server's: saved panels, Styles and
 * Themes (the config's `panelPresets`, `stylePresets`, `appearancePresets`), the built-in Styles and
 * palettes, and (`builtinItems`) the skins, template looks, built-in panels and screen templates. They are
 * stand-ins: a saved one is renamed and deleted in the config it lives in, a built-in never.
 */
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import { BUILTIN_STYLES } from "@/lib/builtin-styles";
import { FONT_CATALOG } from "@/lib/fonts";
import type { Template } from "@/lib/infopanel/templates/kit";
import { ISLAND_LOOKS, type IslandLookPreset } from "@/lib/island/looks";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { panelPresets } from "@/lib/panelPresets";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import { SKIN_PACKS } from "@/widgets/core/theme";

/** Config presets shown as library items carry these id prefixes; they live in the config, not the library. */
export const CONFIG_PANEL = "cfg-panel:";
export const CONFIG_STYLE = "cfg-style:";
export const CONFIG_THEME = "cfg-theme:";
/** The built-ins: palettes and Styles that ship with the app. */
export const BUILTIN_THEME = "builtin-theme:";
export const BUILTIN_STYLE = "builtin-style:";
/** The skins, the screen templates' looks (built-in Themes), the built-in panels and the screen templates. */
export const BUILTIN_SKIN = "builtin-skin:";
export const BUILTIN_LOOK = "builtin-look:";
export const BUILTIN_PANEL = "builtin-panel:";
export const BUILTIN_TEMPLATE = "builtin-template:";
/** The InfoPanel profile templates, the Island looks and the font catalog. */
export const BUILTIN_PROFILE_TEMPLATE = "builtin-ptemplate:";
export const BUILTIN_ISLAND = "builtin-island:";
export const BUILTIN_FONT = "builtin-font:";
export const BUILTIN_PREFIXES: readonly string[] = [
  BUILTIN_THEME,
  BUILTIN_STYLE,
  BUILTIN_SKIN,
  BUILTIN_LOOK,
  BUILTIN_PANEL,
  BUILTIN_TEMPLATE,
  BUILTIN_PROFILE_TEMPLATE,
  BUILTIN_ISLAND,
  BUILTIN_FONT,
];
export const CONFIG_PREFIXES: readonly string[] = [CONFIG_PANEL, CONFIG_STYLE, CONFIG_THEME, ...BUILTIN_PREFIXES];

/** Something that ships with the app: shown, applied and duplicated, never renamed or deleted. */
export const isBuiltinItem = (item: Pick<LibraryItem, "id">): boolean => BUILTIN_PREFIXES.some((p) => item.id.startsWith(p));

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

/** What a skin item carries: the widget style it sets (the Theme page's Start from › Skins writes the same). */
export interface SkinData {
  name: string;
  description: string;
  settings: { skin: string; surface: "auto" };
}

/** The look catalogs that load on demand (the screen templates are large): absent until loaded. */
export interface BuiltinSources {
  looks?: readonly AppearancePreset[];
  templates?: readonly ScreenTemplate[];
  profileTemplates?: readonly Template[];
}

/** A skin's name as people write it ("macOS", "TUI"); the rest just capitalised. */
const SKIN_NAMES: Record<string, string> = { tui: "TUI", macos: "macOS", ios: "iOS", hud: "HUD" };
const skinName = (name: string) => SKIN_NAMES[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

/**
 * Below the config's own items under "Recently added" (stamped before the epoch), each catalog in its own order:
 * the user's saved Themes and panels come first, then the palettes, then these.
 */
const builtinOrder = (i: number) => -1000 - i;

/** The skins and built-in panels, then the template looks and screen templates once loaded, as library items. */
export function builtinItems({ looks = [], templates = [], profileTemplates = [] }: BuiltinSources = {}): LibraryItem[] {
  const skins = SKIN_PACKS.map((p, i) => {
    const data: SkinData = { name: p.name, description: p.description, settings: { skin: p.name, surface: "auto" } };
    return stand(BUILTIN_SKIN + p.name, "skin", skinName(p.name), { source: "builtin" }, data, builtinOrder(i));
  });
  const panels = panelPresets.map((p, i) => stand(BUILTIN_PANEL + p.id, "panel", p.title, { cols: p.colSpan, rows: p.rowSpan, source: "builtin" }, p, builtinOrder(i)));
  const lookItems = looks.map((t, i) => stand(BUILTIN_LOOK + t.id, "theme", t.name, { source: "builtin", swatch: swatchOf(presetTokens(t)) }, t, builtinOrder(i)));
  const templateItems = templates.map((t, i) =>
    stand(BUILTIN_TEMPLATE + t.id, "template", t.name, { source: "builtin", width: t.size.width, height: t.size.height }, t, builtinOrder(i)),
  );
  const profileItems = profileTemplates.map((t, i) =>
    stand(BUILTIN_PROFILE_TEMPLATE + t.id, "ptemplate", t.name, { source: "builtin", blurb: t.blurb, width: t.size?.width ?? 800, height: t.size?.height ?? 480 }, t, builtinOrder(i)),
  );
  const islands = ISLAND_LOOKS.map((l, i) => stand(BUILTIN_ISLAND + l.id, "island", l.name, { source: "builtin", blurb: l.description }, l satisfies IslandLookPreset, builtinOrder(i)));
  const fonts = FONT_CATALOG.map((f, i) =>
    stand(BUILTIN_FONT + f.id, "font", f.label, { source: "builtin", family: f.label, origin: "google" in f ? "Google Fonts" : "System", blurb: "google" in f ? "Loads from Google Fonts when used; a system font stands in offline" : "Uses a font already on the device" }, f, builtinOrder(i)),
  );
  return [...skins, ...panels, ...lookItems, ...templateItems, ...profileItems, ...islands, ...fonts];
}
