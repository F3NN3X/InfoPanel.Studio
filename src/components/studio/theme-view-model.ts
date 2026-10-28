import type { PageBackground } from "@/lib/appearance";
import { isBuiltinPreset, type AppearancePreset } from "@/lib/appearance-presets";
import type { ThemeState, ThemeUse } from "@/lib/theme-apply";
import { isSectionId } from "@/lib/theme-model";
import { isLightTheme, type TemplateThemeRow } from "@/lib/screen-templates/template-rows";
import { cardOfSection, THEME_CARDS, type ThemeAt, type ThemeCardId } from "./theme-cards";
import type { ThemeScope } from "./theme-editor-model";

/**
 * The Theme view's words and choices as data (handoff SPEC §4.2, §4.3, §5.4): the level help, the theme card's
 * name, kind line and Update bar, the Reset and apply texts, where a link opens, the Switch theme filters and the
 * command palette's level. Pure.
 */

export type ThemeLevel = ThemeAt["level"];

/** The left column: Main, or one of the pickers drilled into. */
export type ThemeDrill = "main" | "themes" | "palette" | "skin" | "background";

/** The level help beside the level control; a page adds where its parts come from. */
export function levelHelp(level: ThemeLevel, screen: string, page: string): string {
  if (level === "all") return "The base theme for every screen";
  if (level === "screen") return `What ${screen} changes from All screens`;
  return `What ${page} changes from ${screen}. ${pageParts(screen)}`;
}

/** What a page can't hold (owner decision 1). */
export const pageParts = (screen: string): string => `Palette, corners and background come from ${screen}.`;

/** "A", "A and B", "A, B and C". */
export const listText = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Where a theme is used, in words: "All screens, MyDefault and the Gaming and Work pages". */
export function placesText(uses: readonly ThemeUse[]): string {
  const pages = uses.filter((u) => u.target.kind === "page").map((u) => u.name);
  const others = uses.filter((u) => u.target.kind !== "page").map((u) => u.name);
  const pageText = pages.length === 0 ? [] : [`the ${listText(pages)} ${pages.length === 1 ? "page" : "pages"}`];
  return listText([...others, ...pageText]);
}

const sameTarget = (a: ThemeUse["target"], b: ThemeUse["target"]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The uses of a theme other than this level. */
export const otherUses = (uses: readonly ThemeUse[], here: ThemeUse["target"]): ThemeUse[] => uses.filter((u) => !sameTarget(u.target, here));

/** A saved theme's "used by" line in the picker. */
export const usedByText = (uses: readonly ThemeUse[]): string => (uses.length === 0 ? "Not in use" : `Used by ${placesText(uses)}`);

/** What the theme card shows: the theme, or a custom look, and whether it can be updated or only saved. */
export type CardKind = "saved" | "template" | "deleted" | "custom";

export function cardKind(state: ThemeState): CardKind {
  if (!state.applied) return "custom";
  if (state.deleted) return "deleted";
  return isBuiltinPreset(state.applied.id) ? "template" : "saved";
}

/** The theme card's name: the theme's, "‹name› (deleted)", or "Custom look". */
export function cardName(state: ThemeState): string {
  if (!state.applied) return "Custom look";
  if (state.deleted) return `${state.applied.name} (deleted)`;
  return state.theme?.name ?? state.applied.name;
}

/** The theme card's kind line (SPEC §4.3.1, owner decision 3). */
export function kindLine(state: ThemeState, others: readonly ThemeUse[], levelName: string): string {
  switch (cardKind(state)) {
    case "custom":
    case "deleted":
      return "not saved";
    case "template":
      return `From a screen template · applied to ${levelName}`;
    case "saved":
      return others.length === 0 ? "Saved theme · only here" : `Saved theme · also on ${placesText(others)}`;
  }
}

/** The Update bar's text, or none while nothing changed since the theme was applied (owner decision 4). */
export function updateBarText(state: ThemeState, others: readonly ThemeUse[]): string | undefined {
  if (state.changed.length === 0) return undefined;
  const name = cardName(state);
  if (cardKind(state) !== "saved") return `Changed from ${name}. Save it to reuse it on other screens.`;
  return others.length === 0 ? "Changed here." : `Changed here. Updating ${name} also changes ${placesText(others)}.`;
}

/** Reset to ‹name›'s sub-text: N counts the level's own sections (`themeState().own`). */
export function resetText(name: string, own: number, level: ThemeLevel, levelName: string): string {
  const clears = own === 0 ? "part changes" : `${own} fine-tune ${own === 1 ? "change" : "changes"} and part changes`;
  return `Back to exactly ${name}: clears ${clears} on ${levelName}. ${level === "page" ? "Widgets" : "Pages"} keep their own.`;
}

/** Switch theme's counts: "2 saved · 55 from templates". */
export const themeCounts = (saved: number, rows: readonly TemplateThemeRow[]): string =>
  `${saved} saved · ${rows.reduce((n, r) => n + r.presets.length, 0)} from templates`;

/** The template group's heading: "FROM SCREEN TEMPLATES · 22 TEMPLATES, 55 LOOKS". */
export const templatesHeading = (rows: readonly TemplateThemeRow[]): string =>
  `From screen templates · ${rows.length} templates, ${rows.reduce((n, r) => n + r.presets.length, 0)} looks`;

/** A template row's tag: "Starter", "3 variants", "4 variants · also Orbit, Ticker". */
export function rowTag(row: TemplateThemeRow): string {
  const base = row.presets.length > 1 ? `${row.presets.length} variants` : "Starter";
  return row.also.length > 0 ? `${base} · also ${row.also.join(", ")}` : base;
}

export type ThemeFilter = "all" | "saved" | "templates" | "light";

/** What Switch theme lists under a filter: the saved themes and the template rows (none: the group is hidden). */
export function filteredThemes(filter: ThemeFilter, saved: readonly AppearancePreset[], rows: readonly TemplateThemeRow[]) {
  if (filter === "saved") return { saved, rows: undefined };
  if (filter === "templates") return { saved: undefined, rows };
  if (filter === "light") return { saved: saved.filter(isLightTheme), rows: rows.filter((r) => r.presets.some(isLightTheme)) };
  return { saved, rows };
}

/** The Background row's label: "Solid #09090B", "Gradient #0B1023 → #05060A", "Image · aurora, dim 25". */
export function backgroundLabel(bg: PageBackground | undefined): string {
  if (!bg || bg.type === "none") return "None";
  if (bg.type === "color") return `Solid ${(bg.color ?? "").toUpperCase()}`.trim();
  if (bg.type === "gradient") return bg.gradient ? `Gradient ${bg.gradient.from.toUpperCase()} → ${bg.gradient.to.toUpperCase()}` : "Gradient";
  // The file's name without its folder, query or extension (a data: image has none).
  const path = bg.src?.startsWith("data:") ? "" : (bg.src ?? "").split(/[?#]/)[0];
  const name = (path.split(/[/\\]/).at(-1) ?? "").replace(/\.[a-z0-9]+$/i, "");
  const kind = bg.type === "image" ? "Image" : "Video";
  const extras = [name, bg.dim ? `dim ${bg.dim}` : ""].filter(Boolean).join(", ");
  return extras ? `${kind} · ${extras}` : kind;
}

/** Corners: the slider's px (0–24) from the stored rem, and back (rem = px / 16). */
export const radiusPx = (rem: number): number => Math.round(rem * 16);
export const pxRadius = (px: number): number => px / 16;

/** "0.63 rem". */
export const remText = (rem: number): string => `${Number(rem.toFixed(2))} rem`;

/** Where a link into Theme opens: a picker, or a fine-tune section (none: Main as it is). */
export interface ThemeLink {
  drill?: Exclude<ThemeDrill, "main">;
  section?: ThemeCardId;
}

/**
 * The old link ids onto the new places: "start" opens Switch theme, "background" the Background picker, "skin" the
 * Skin picker, "border" Surface & border, "tokens" Colors; a section card's or a widget-style section's id its
 * fine-tune section.
 */
export function themeLinkOf(id: string | undefined): ThemeLink | undefined {
  if (!id) return undefined;
  if (id === "start") return { drill: "themes" };
  if (id === "background") return { drill: "background" };
  if (id === "skin") return { drill: "skin" };
  if (id === "tokens") return { section: "colors" };
  // The page inspector's "Change a section…": the first section, each with its Change here.
  if (id === "customise") return { section: "colors" };
  if (id === "border") return { section: "surface" };
  if (THEME_CARDS.some((c) => c.id === id)) return { section: id as ThemeCardId };
  return isSectionId(id) ? { section: cardOfSection(id).id } : undefined;
}

/**
 * The level the command palette's "Apply theme" uses: the one Theme is set to, on its screen and page, or All
 * screens before Theme has been opened (owner decision 5).
 */
export function commandThemeAt(scope: ThemeScope | undefined, profileId: string): ThemeAt {
  if (!scope || scope.kind === "base") return { level: "all" };
  return scope.kind === "profile" ? { level: "screen", profileId } : { level: "page", profileId, pageId: scope.pageId };
}

/** A skin's name as the UI writes it: Default (also for unset and the old Auto), TUI, HUD, else capitalized. */
export function skinLabel(skin: unknown): string {
  const name = typeof skin === "string" && skin && skin !== "auto" ? skin : "default";
  if (name === "tui" || name === "hud") return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}
