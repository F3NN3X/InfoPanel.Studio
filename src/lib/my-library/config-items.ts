/**
 * The Library items the config and the app supply, shown beside the server's: saved panels and Styles
 * (the config's `panelPresets`, `stylePresets`), the built-in Styles, and (`builtinItems`) the built-in panels,
 * screen templates, InfoPanel templates and fonts. Themes, palettes and skins live in Theme. They are
 * stand-ins: a saved one is renamed and deleted in the config it lives in, a built-in never.
 */
import { BUILTIN_STYLES } from "@/lib/builtin-styles";
import { FONT_CATALOG } from "@/lib/fonts";
import type { Template } from "@/lib/infopanel/templates/kit";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { panelPresets } from "@/lib/panelPresets";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";

/** Config presets shown as library items carry these id prefixes; they live in the config, not the library. */
export const CONFIG_PANEL = "cfg-panel:";
export const CONFIG_STYLE = "cfg-style:";
/** The built-ins that ship with the app. */
export const BUILTIN_STYLE = "builtin-style:";
/** The built-in panels and the screen templates. */
export const BUILTIN_PANEL = "builtin-panel:";
export const BUILTIN_TEMPLATE = "builtin-template:";
/** The InfoPanel profile templates and the font catalog. */
export const BUILTIN_PROFILE_TEMPLATE = "builtin-ptemplate:";
export const BUILTIN_FONT = "builtin-font:";
export const BUILTIN_PREFIXES: readonly string[] = [
  BUILTIN_STYLE,
  BUILTIN_PANEL,
  BUILTIN_TEMPLATE,
  BUILTIN_PROFILE_TEMPLATE,
  BUILTIN_FONT,
];
export const CONFIG_PREFIXES: readonly string[] = [CONFIG_PANEL, CONFIG_STYLE, ...BUILTIN_PREFIXES];

/** Something that ships with the app: shown, applied and duplicated, never renamed or deleted. */
export const isBuiltinItem = (item: Pick<LibraryItem, "id">): boolean => BUILTIN_PREFIXES.some((p) => item.id.startsWith(p));

const AT = "1970-01-01T00:00:00.000Z";

function stand(id: string, kind: LibraryItem["kind"], name: string, meta: Record<string, unknown>, data: unknown, order: number): LibraryItem {
  // The epoch stamps keep the config's own order under "Recently added"; their uses aren't counted, so never flagged Unused.
  const at = new Date(Date.parse(AT) + order).toISOString();
  return { id, kind, name, createdAt: at, updatedAt: at, files: [], meta, copies: [{ profileId: "*" }], data };
}

type Source = Pick<DashboardConfig, "panelPresets" | "stylePresets">;

/** The config's saved panels and Styles, then the built-in Styles, as library items. */
export function configItems(config: Source): LibraryItem[] {
  const panels = (config.panelPresets ?? []).map((p, i) => stand(CONFIG_PANEL + p.id, "panel", p.name, { cols: p.colSpan, rows: p.rowSpan, source: "config" }, p, i));
  const styles = (config.stylePresets ?? []).map((s, i) => stand(CONFIG_STYLE + s.id, "style", s.name, { source: "config" }, s, i));
  const builtinStyles = BUILTIN_STYLES.map((s, i) => stand(BUILTIN_STYLE + s.id, "style", s.name, { source: "builtin" }, s, i));
  return [...panels, ...styles, ...builtinStyles];
}

/** The catalogs that load on demand (the screen templates are large): absent until loaded. */
export interface BuiltinSources {
  templates?: readonly ScreenTemplate[];
  profileTemplates?: readonly Template[];
}

/**
 * Below the config's own items under "Recently added" (stamped before the epoch), each catalog in its own order:
 * the user's saved panels come first, then these.
 */
const builtinOrder = (i: number) => -1000 - i;

/** The built-in panels, then the screen and InfoPanel templates once loaded, and the fonts, as library items. */
export function builtinItems({ templates = [], profileTemplates = [] }: BuiltinSources = {}): LibraryItem[] {
  const panels = panelPresets.map((p, i) => stand(BUILTIN_PANEL + p.id, "panel", p.title, { cols: p.colSpan, rows: p.rowSpan, source: "builtin" }, p, builtinOrder(i)));
  const templateItems = templates.map((t, i) =>
    stand(BUILTIN_TEMPLATE + t.id, "template", t.name, { source: "builtin", width: t.size.width, height: t.size.height }, t, builtinOrder(i)),
  );
  const profileItems = profileTemplates.map((t, i) =>
    stand(BUILTIN_PROFILE_TEMPLATE + t.id, "ptemplate", t.name, { source: "builtin", blurb: t.blurb, width: t.size?.width ?? 800, height: t.size?.height ?? 480 }, t, builtinOrder(i)),
  );
  const fonts = FONT_CATALOG.map((f, i) =>
    stand(BUILTIN_FONT + f.id, "font", f.label, { source: "builtin", family: f.label, origin: "google" in f ? "Google Fonts" : "System", blurb: "google" in f ? "Loads from Google Fonts when used; a system font stands in offline" : "Uses a font already on the device" }, f, builtinOrder(i)),
  );
  return [...panels, ...templateItems, ...profileItems, ...fonts];
}
