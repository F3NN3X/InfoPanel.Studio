/**
 * What the Library does with a Theme or a Style, each a config edit through the studio's history (one undo step):
 * apply a Theme at a scope, edit it in Theme, apply a Style to the selection or overwrite it from the selection,
 * rename, duplicate and delete. The built-in palettes and Styles can be applied and duplicated, nothing more.
 */
import { Copy, Paintbrush, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { applyThemeAt, deleteAppearancePreset, duplicateAppearancePreset, renameAppearancePreset, type ThemeTarget } from "@/lib/appearance-preset-apply";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { uid, type StylePreset } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { BUILTIN_STYLE, BUILTIN_THEME, CONFIG_STYLE, CONFIG_THEME } from "@/lib/my-library/config-items";
import { deleteStylePreset, duplicateStylePreset, renameStylePreset, updateStylePreset } from "@/lib/style-presets";
import type { ThemePreset } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { withTokens } from "@/components/studio/theme-cards";
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
export const isPresetItem = (item: Pick<LibraryItem, "kind">): boolean => item.kind === "theme" || item.kind === "style";

const isTheme = (item: LibraryItem) => item.kind === "theme";
const builtin = (item: LibraryItem) => item.id.startsWith(BUILTIN_THEME) || item.id.startsWith(BUILTIN_STYLE);
const dataId = (item: LibraryItem) => (item.data as { id: string }).id;

/** Why a Style can't take the selection's look, or undefined when it can. */
function updateBlocked(ctx: PresetContext): string | undefined {
  if (ctx.selectionStyle === null) return "Select a widget on the canvas first";
  return Object.keys(ctx.selectionStyle).length === 0 ? "The selected widget follows the theme: it has no look of its own" : undefined;
}

/** The item's main action (double-click, Enter): edit a saved Theme in Theme, apply a Style to the selection. */
export function presetPrimary(item: LibraryItem, ctx: PresetContext): DetailAction | null {
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

/** The Theme's "Apply to…" scopes: All screens, this screen, this page (a palette has no page level). */
export function presetScopes(item: LibraryItem, ctx: PresetContext): ScopeChoice[] {
  if (!isTheme(item)) return [];
  const { bridge } = ctx;
  const screen = bridge.config.profiles.find((p) => p.id === bridge.profileId);
  const palette = builtin(item);
  const done = (where: string) => bridge.toast(`Applied ${item.name} to ${where}`);
  const apply = (target: ThemeTarget, where: string) => {
    if (palette) {
      const tokens = (item.data as ThemePreset).tokens;
      bridge.setConfig((c) => withTokens(c, target.kind === "all" ? { level: "all" } : { level: "screen", profileId: bridge.profileId }, tokens));
    } else bridge.setConfig((c) => applyThemeAt(c, item.data as AppearancePreset, target, { includeBackground: false }));
    done(where);
  };
  return [
    { label: "All screens", run: () => apply({ kind: "all" }, "All screens") },
    { label: "This screen", title: screen ? `Apply to ${screen.name}` : undefined, run: () => apply({ kind: "profile", profileId: bridge.profileId }, screen?.name ?? "this screen") },
    {
      label: "This page",
      title: palette ? "Palettes are set per screen" : "The widget style only: a page has no colors of its own",
      disabled: palette,
      run: () => apply({ kind: "page", profileId: bridge.profileId, pageId: ctx.pageId }, "this page"),
    },
  ];
}

/** The rest of the item's actions. */
export function presetSecondary(item: LibraryItem, ctx: PresetContext): DetailAction[] {
  const { bridge } = ctx;
  const theme = isTheme(item);
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
      if (builtin(item)) {
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
