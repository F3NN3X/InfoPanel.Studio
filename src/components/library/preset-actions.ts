/**
 * What the Library does with a Theme, a skin or a Style, each a config edit through the studio's history (one undo
 * step): apply a Theme or a skin at a scope, edit a Theme in Theme, apply a Style to the selection or overwrite it
 * from the selection, rename, duplicate and delete. The built-ins (palettes, template looks, skins, Styles) can be
 * applied and duplicated, nothing more; a skin's copy is a saved Theme with that skin.
 */
import { Copy, Paintbrush, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { applyThemeAt, deleteAppearancePreset, duplicateAppearancePreset, renameAppearancePreset, type ThemeTarget } from "@/lib/appearance-preset-apply";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { uid, type DashboardConfig, type StylePreset } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { BUILTIN_LOOK, BUILTIN_THEME, CONFIG_STYLE, CONFIG_THEME, isBuiltinItem, type SkinData } from "@/lib/my-library/config-items";
import { sectionsWithValues } from "@/lib/theme-model";
import { deleteStylePreset, duplicateStylePreset, renameStylePreset, updateStylePreset } from "@/lib/style-presets";
import type { ThemePreset } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { scopeOfAt, withTokens, type ThemeAt } from "@/components/studio/theme-cards";
import { withPageFollow, withScopeValues } from "@/components/studio/theme-editor-model";
import { applyStyle, type StudioBridge } from "./library-actions";
import type { DetailAction } from "./library-detail";

export interface PresetContext {
  bridge: StudioBridge;
  /** The page on the canvas (a page scope's target). */
  pageId: string;
  /** The look the selected widget has of its own; null = nothing selected. */
  selectionStyle: ModuleSettings | null;
  /** Open Theme at All screens with the saved Theme applied and in its "Editing" state. */
  onEditInTheme: (preset: AppearancePreset) => void;
  /** Select an item (a copy just made, or none after a delete). */
  select: (id: string | null) => void;
  /** Focus the item's name field. */
  rename: (id: string) => void;
}

/** One place a Theme can be applied. */
export interface ScopeChoice {
  label: string;
  title?: string;
  disabled?: boolean;
  run: () => void;
}

/** A saved Theme or Style: the ones the Library may rename and delete. */
export const isUserPreset = (item: Pick<LibraryItem, "id">): boolean => item.id.startsWith(CONFIG_THEME) || item.id.startsWith(CONFIG_STYLE);
export const isPresetItem = (item: Pick<LibraryItem, "kind">): boolean => item.kind === "theme" || item.kind === "style" || item.kind === "skin";

const isTheme = (item: LibraryItem) => item.kind === "theme";
const isSkin = (item: LibraryItem) => item.kind === "skin";
const builtin = isBuiltinItem;
/** A built-in palette: colors only. */
const isPalette = (item: LibraryItem) => item.id.startsWith(BUILTIN_THEME);
/** A screen template's look: a whole built-in Theme, its background included (as Theme › Start from applies it). */
const isLook = (item: LibraryItem) => item.id.startsWith(BUILTIN_LOOK);
const dataId = (item: LibraryItem) => (item.data as { id: string }).id;

/** Why a Style can't take the selection's look, or undefined when it can. */
function updateBlocked(ctx: PresetContext): string | undefined {
  if (ctx.selectionStyle === null) return "Select a widget on the canvas first";
  return Object.keys(ctx.selectionStyle).length === 0 ? "The selected widget follows the theme: it has no look of its own" : undefined;
}

/** The item's main action (double-click, Enter): edit a saved Theme in Theme, apply a Style to the selection. */
export function presetPrimary(item: LibraryItem, ctx: PresetContext): DetailAction | null {
  if (isSkin(item)) return null;
  if (isTheme(item))
    return builtin(item) ? null : { label: "Edit in Theme", icon: Pencil, run: () => ctx.onEditInTheme(item.data as AppearancePreset), title: "Open it in Theme, applied to All screens" };
  const none = ctx.bridge.selection.length === 0;
  return {
    label: "Apply to selection",
    icon: Paintbrush,
    run: () => void applyStyle(ctx.bridge, item),
    disabled: none,
    title: none ? "Select a widget on the canvas first" : undefined,
  };
}

/**
 * The skin's widget style at a Theme level (the Theme page's Start from › Skins writes the same). A page uses its own
 * values only in the sections it customises, so it customises the ones the skin writes, as applying a Theme to a page
 * does; a section its screen locks stays the screen's.
 */
function withSkin(c: DashboardConfig, profileId: string, at: ThemeAt, data: SkinData): DashboardConfig {
  const written = withScopeValues(c, profileId, scopeOfAt(at), (st) => ({ ...st, ...data.settings }));
  if (at.level !== "page") return written;
  const locks = written.profiles.find((p) => p.id === profileId)?.widgetTheme?.locks;
  return sectionsWithValues(data.settings)
    .filter((sec) => locks?.[sec] !== true)
    .reduce((cfg, sec) => withPageFollow(cfg, profileId, at.pageId, sec, false), written);
}

/** A Theme's or a skin's "Apply to…" scopes: All screens, this screen, this page (a palette has no page level). */
export function presetScopes(item: LibraryItem, ctx: PresetContext): ScopeChoice[] {
  if (!isTheme(item) && !isSkin(item)) return [];
  const { bridge } = ctx;
  const screen = bridge.config.profiles.find((p) => p.id === bridge.profileId);
  const palette = isPalette(item);
  const done = (where: string) => bridge.toast(`Applied ${item.name} to ${where}`);
  const apply = (target: ThemeTarget, where: string) => {
    if (isSkin(item)) {
      const at: ThemeAt = target.kind === "all" ? { level: "all" } : target.kind === "profile" ? { level: "screen", profileId: bridge.profileId } : { level: "page", profileId: bridge.profileId, pageId: target.pageId };
      bridge.setConfig((c) => withSkin(c, bridge.profileId, at, item.data as SkinData));
    } else if (palette) {
      const tokens = (item.data as ThemePreset).tokens;
      bridge.setConfig((c) => withTokens(c, target.kind === "all" ? { level: "all" } : { level: "screen", profileId: bridge.profileId }, tokens));
    } else bridge.setConfig((c) => applyThemeAt(c, item.data as AppearancePreset, target, { includeBackground: isLook(item) }));
    done(where);
  };
  return [
    { label: "All screens", run: () => apply({ kind: "all" }, "All screens") },
    { label: "This screen", title: screen ? `Apply to ${screen.name}` : undefined, run: () => apply({ kind: "profile", profileId: bridge.profileId }, screen?.name ?? "this screen") },
    {
      label: "This page",
      title: palette ? "Palettes are set per screen" : isSkin(item) ? undefined : "The widget style only: a page has no colors of its own",
      disabled: palette,
      run: () => apply({ kind: "page", profileId: bridge.profileId, pageId: ctx.pageId }, "this page"),
    },
  ];
}

/** The rest of the item's actions. */
export function presetSecondary(item: LibraryItem, ctx: PresetContext): DetailAction[] {
  const { bridge } = ctx;
  // A skin's copy is a saved Theme: the current colors and corners with that skin.
  const theme = isTheme(item) || isSkin(item);
  const out: DetailAction[] = [];
  if (!theme && !builtin(item)) {
    const blocked = updateBlocked(ctx);
    out.push({
      label: "Update from selection",
      icon: RefreshCw,
      disabled: blocked !== undefined,
      title: blocked ?? "Replace this Style's settings with the selected widget's look",
      run: () => {
        bridge.setConfig((c) => updateStylePreset(c, dataId(item), ctx.selectionStyle ?? {}));
        bridge.toast(`Updated ${item.name} from the selection`);
      },
    });
  }
  if (!builtin(item)) out.push({ label: "Rename", icon: Pencil, run: () => ctx.rename(item.id) });
  out.push({
    label: "Duplicate",
    icon: Copy,
    run: () => {
      const id = uid(theme ? "look" : "style");
      if (isSkin(item)) {
        const skin = item.data as SkinData;
        const copy: AppearancePreset = { id, name: `${item.name} skin`, description: "Saved theme", theme: { ...bridge.config.theme }, radius: bridge.config.radius, style: { ...skin.settings } };
        bridge.setConfig((c) => ({ ...c, appearancePresets: [...(c.appearancePresets ?? []), copy] }));
      } else if (isLook(item)) {
        const look = item.data as AppearancePreset;
        bridge.setConfig((c) => ({ ...c, appearancePresets: [...(c.appearancePresets ?? []), { ...structuredClone(look), id, name: `${look.name} copy` }] }));
      } else if (builtin(item)) {
        if (theme) {
          const palette = item.data as ThemePreset;
          const copy: AppearancePreset = { id, name: `${palette.label} copy`, description: "Saved theme", theme: { ...palette.tokens }, radius: bridge.config.radius, style: {} };
          bridge.setConfig((c) => ({ ...c, appearancePresets: [...(c.appearancePresets ?? []), copy] }));
        } else {
          const style = item.data as StylePreset;
          bridge.setConfig((c) => ({ ...c, stylePresets: [...(c.stylePresets ?? []), { id, name: `${style.name} copy`, settings: { ...style.settings } }] }));
        }
      } else bridge.setConfig((c) => (theme ? duplicateAppearancePreset(c, dataId(item), id) : duplicateStylePreset(c, dataId(item), id)));
      ctx.select((theme ? CONFIG_THEME : CONFIG_STYLE) + id);
    },
    title: "A saved copy to change",
  });
  if (!builtin(item))
    out.push({
      label: "Delete",
      icon: Trash2,
      run: () => {
        bridge.setConfig((c) => (theme ? deleteAppearancePreset(c, dataId(item)) : deleteStylePreset(c, dataId(item))));
        ctx.select(null);
        bridge.toast(`Deleted ${item.name}`);
      },
    });
  return out;
}

/** Rename a saved Theme or Style (the detail's name field). */
export function renamePreset(item: LibraryItem, bridge: StudioBridge, name: string): void {
  bridge.setConfig((c) => (isTheme(item) ? renameAppearancePreset(c, dataId(item), name) : renameStylePreset(c, dataId(item), name)));
}
