// The recipes' and code widgets' Add rows (FORMAT.md §14, §18): the lazy chunk `widgets/recipe/use-recipes.ts` loads, so the studio
// entry carries none of it.
import { loadCode } from "@/widgets/code/loader";
import { listUserWidgets, loadRecipe } from "@/widgets/recipe/store";
import type { ModuleSettings } from "@/modules/types";
import type { CodeWidgetDefinition } from "@/widgets/sdk";
import type { Recipe } from "@/widgets/recipe/types";
import { type AddItem, moduleItem } from "./add-catalog";
import type { ModuleMeta } from "./studio-modules";

/**
 * A recipe's row, after the built-in ones: its presets as rows, as a built-in's are. Every add, the default preset's too, stores
 * the recipe's version with the placement.
 */
export function recipeItem(r: Recipe): AddItem {
  const m: ModuleMeta = { id: r.id, title: r.name, minCols: r.size.min[0], minRows: r.size.min[1], category: r.category, icon: r.icon, description: r.description, defaultSize: r.size.default };
  const versioned = (i: AddItem): AddItem => ({ ...i, drop: { ...i.drop, settings: { recipeVersion: r.version, ...i.drop.settings } } });
  const item = moduleItem(m, r.presets);
  return { ...versioned(item), ...(item.presets ? { presets: item.presets.map(versioned) } : {}) };
}

/** A code widget's row (Phase 6b): one, at its definition's size. */
export function codeItem(id: string, def: CodeWidgetDefinition): AddItem {
  const [mc, mr] = def.minSize ?? [1, 1];
  const m: ModuleMeta = { id, title: def.name, minCols: mc, minRows: mr, category: "Imported", icon: def.icon ?? "dashboard", description: def.description ?? "", defaultSize: def.defaultSize };
  return moduleItem(m, []);
}

/**
 * The rows of the recipes the server holds that pass the validator, then the code widgets that verified and loaded (`loadCode`): a
 * refused, switched-off or turned-off one is listed nowhere. None while the store is off.
 */
export async function recipeItems(): Promise<AddItem[]> {
  const { list } = await listUserWidgets();
  const all = await Promise.all(
    list.map(async (w): Promise<AddItem[]> => {
      if (w.kind === "code") {
        const s = w.off ? undefined : await loadCode(w.id);
        return s && "def" in s ? [codeItem(w.id, s.def)] : [];
      }
      const l = await loadRecipe(w.id);
      return l.recipe ? [recipeItem(l.recipe)] : [];
    }),
  );
  return all.flat();
}

/** One of the user's widgets a page rail's slot can hold (decision 8, P6): its module, its name in the list, its settings there. */
export interface UserRailWidget {
  module: string;
  name: string;
  settings: ModuleSettings;
}

/** A recipe's rail presets as rail widgets, each storing the recipe's version as an add does. */
export const recipeRailWidgets = (r: Recipe): UserRailWidget[] =>
  r.presets.flatMap((p) => (p.size === "rail" ? [{ module: r.id, name: `${r.name} · ${p.name}`, settings: { recipeVersion: r.version, ...p.settings } }] : []));

/** A code widget's rail offer (`CodeWidgetDefinition.rail`) as a rail widget. */
export const codeRailWidget = (id: string, def: CodeWidgetDefinition): UserRailWidget[] =>
  def.rail ? [{ module: id, name: def.name, settings: { ...def.rail.settings } }] : [];

/**
 * The user's widgets with a rail preset (P6): the recipes that pass the validator, and the code widgets that verified, loaded and
 * offer themselves for the rail. None while the store is off.
 */
export async function userRailWidgets(): Promise<UserRailWidget[]> {
  const { list } = await listUserWidgets();
  const all = await Promise.all(
    list.map(async (w): Promise<UserRailWidget[]> => {
      if (w.kind === "code") {
        const s = w.off ? undefined : await loadCode(w.id);
        return s && "def" in s ? codeRailWidget(w.id, s.def) : [];
      }
      const l = await loadRecipe(w.id);
      return l.recipe ? recipeRailWidgets(l.recipe) : [];
    }),
  );
  return all.flat();
}
