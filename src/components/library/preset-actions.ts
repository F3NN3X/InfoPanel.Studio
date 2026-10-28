/**
 * What the Library does with a Style, each a config edit through the studio's history (one undo step): apply it to
 * the selection or overwrite it from the selection, rename, duplicate and delete. The built-in Styles can be applied
 * and duplicated, nothing more. Themes, palettes and skins are handled in Theme.
 */
import { Copy, Paintbrush, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { uid, type StylePreset } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { CONFIG_STYLE, isBuiltinItem } from "@/lib/my-library/config-items";
import { deleteStylePreset, duplicateStylePreset, renameStylePreset, updateStylePreset } from "@/lib/style-presets";
import type { ModuleSettings } from "@/modules/types";
import { applyStyle, type StudioBridge } from "./library-actions";
import type { DetailAction } from "./library-detail";

export interface PresetContext {
  bridge: StudioBridge;
  /** The look the selected widget has of its own; null = nothing selected. */
  selectionStyle: ModuleSettings | null;
  /** Select an item (a copy just made, or none after a delete). */
  select: (id: string | null) => void;
  /** Focus the item's name field. */
  rename: (id: string) => void;
}

/** A saved Style: the ones the Library may rename and delete. */
export const isUserPreset = (item: Pick<LibraryItem, "id">): boolean => item.id.startsWith(CONFIG_STYLE);
export const isPresetItem = (item: Pick<LibraryItem, "kind">): boolean => item.kind === "style";

const dataId = (item: LibraryItem) => (item.data as { id: string }).id;

/** Why a Style can't take the selection's look, or undefined when it can. */
function updateBlocked(ctx: PresetContext): string | undefined {
  if (ctx.selectionStyle === null) return "Select a widget on the canvas first";
  return Object.keys(ctx.selectionStyle).length === 0 ? "The selected widget follows the theme: it has no look of its own" : undefined;
}

/** The item's main action (double-click, Enter): apply the Style to the selection. */
export function presetPrimary(item: LibraryItem, ctx: PresetContext): DetailAction {
  const none = ctx.bridge.selection.length === 0;
  return {
    label: "Apply to selection",
    icon: Paintbrush,
    run: () => void applyStyle(ctx.bridge, item),
    disabled: none,
    title: none ? "Select a widget on the canvas first" : undefined,
  };
}

/** The rest of the item's actions. */
export function presetSecondary(item: LibraryItem, ctx: PresetContext): DetailAction[] {
  const { bridge } = ctx;
  const builtin = isBuiltinItem(item);
  const out: DetailAction[] = [];
  if (!builtin) {
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
    out.push({ label: "Rename", icon: Pencil, run: () => ctx.rename(item.id) });
  }
  out.push({
    label: "Duplicate",
    icon: Copy,
    run: () => {
      const id = uid("style");
      if (builtin) {
        const style = item.data as StylePreset;
        bridge.setConfig((c) => ({ ...c, stylePresets: [...(c.stylePresets ?? []), { id, name: `${style.name} copy`, settings: { ...style.settings } }] }));
      } else bridge.setConfig((c) => duplicateStylePreset(c, dataId(item), id));
      ctx.select(CONFIG_STYLE + id);
    },
    title: "A saved copy to change",
  });
  if (!builtin)
    out.push({
      label: "Delete",
      icon: Trash2,
      run: () => {
        bridge.setConfig((c) => deleteStylePreset(c, dataId(item)));
        ctx.select(null);
        bridge.toast(`Deleted ${item.name}`);
      },
    });
  return out;
}

/** Rename a saved Style (the detail's name field). */
export function renamePreset(item: LibraryItem, bridge: StudioBridge, name: string): void {
  bridge.setConfig((c) => renameStylePreset(c, dataId(item), name));
}
