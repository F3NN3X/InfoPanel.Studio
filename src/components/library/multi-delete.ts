/**
 * Selecting several Library cards and deleting them at once. The click rules follow the item lists elsewhere in the
 * studio (Ctrl / ⌘ toggles one, Shift takes a range); the plan says which of the picked items can go and why the rest
 * stay: a built-in never goes, and an image, video or SVG a screen uses never goes (the remove itself checks each file
 * again). A saved Theme, Style or panel is deleted from the config, all in one edit.
 */
import { deleteAppearancePreset } from "@/lib/appearance-preset-apply";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { CONFIG_PANEL, CONFIG_STYLE, CONFIG_THEME, isBuiltinItem } from "@/lib/my-library/config-items";
import { hashOf } from "@/lib/my-library/model";
import { deleteStylePreset } from "@/lib/style-presets";
import { deletePanelPreset } from "@/components/studio/panel-preset-actions";
import { nextSelection } from "@/components/studio/selection";
import { FILE_KINDS } from "./remove-item";

/** The keys held during a card click. */
export interface ClickMod {
  /** Ctrl / ⌘: add or remove this card. */
  toggle: boolean;
  /** Shift: everything from the last selected card to this one. */
  range: boolean;
}

/**
 * The picked ids after a click on `id`. `anchor` is the card last selected on its own, `order` the cards as shown.
 * A plain click outside select mode picks nothing (it only selects the card).
 */
export function pickedAfterClick(picked: readonly string[], anchor: string | null, order: readonly string[], id: string, mod: ClickMod, selectMode: boolean): string[] {
  if (mod.range && anchor) {
    const a = order.indexOf(anchor);
    const b = order.indexOf(id);
    if (a >= 0 && b >= 0) return order.slice(Math.min(a, b), Math.max(a, b) + 1);
  }
  if (mod.toggle || mod.range || selectMode) return nextSelection(picked.length > 0 || !anchor ? picked : [anchor], id, "toggle");
  return [];
}

export type KeptWhy = "built-in" | "used";

export interface DeletePlan {
  remove: LibraryItem[];
  kept: { item: LibraryItem; why: KeptWhy }[];
}

/** Which of `items` go and which stay; `used` is every file hash the studio's config names. */
export function planDelete(items: readonly LibraryItem[], used: ReadonlySet<string>): DeletePlan {
  const plan: DeletePlan = { remove: [], kept: [] };
  for (const item of items) {
    const hash = hashOf(item);
    if (isBuiltinItem(item)) plan.kept.push({ item, why: "built-in" });
    else if (FILE_KINDS.has(item.kind) && hash !== undefined && used.has(hash)) plan.kept.push({ item, why: "used" });
    else plan.remove.push(item);
  }
  return plan;
}

/** Whether the item is a saved Theme, Style or panel: kept in the config rather than on the server. */
export const isSavedInConfig = (item: Pick<LibraryItem, "id">): boolean => [CONFIG_PANEL, CONFIG_STYLE, CONFIG_THEME].some((p) => item.id.startsWith(p));

/** The config without the saved Themes, Styles and panels among `items` (anything else is left alone). */
export function deleteConfigItems(config: DashboardConfig, items: readonly LibraryItem[]): DashboardConfig {
  return items.reduce((c, item) => {
    const id = (item.data as { id: string }).id;
    if (item.id.startsWith(CONFIG_THEME)) return deleteAppearancePreset(c, id);
    if (item.id.startsWith(CONFIG_STYLE)) return deleteStylePreset(c, id);
    if (item.id.startsWith(CONFIG_PANEL)) return deletePanelPreset(c, id);
    return c;
  }, config);
}
