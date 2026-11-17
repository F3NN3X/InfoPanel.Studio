// The recipes on the server as Add rows, for the studio's Add panel: listed, each loaded and validated (`store.ts`, shared with the
// recipe renderer) and made a row (`recipe-item.ts`), in a lazy chunk, so the studio entry carries only this hook.
// A recipe the validator refuses is not offered; with user widgets switched off on the server the list is empty.
import { useEffect, useState } from "react";
import type { AddItem } from "@/components/studio/add-catalog";

let pending: Promise<readonly AddItem[]> | undefined;
let loaded: readonly AddItem[] = [];

/** The Add rows of the recipes the server holds that pass the validator, loaded once (again after `reloadRecipes`). */
export const loadRecipeItems = (): Promise<readonly AddItem[]> => (pending ??= import("@/components/studio/recipe-item").then((m) => m.recipeItems()));

/** The user's widgets a page rail's slot can hold (P6), from the same chunk; read afresh each time (the rail editor opens). */
export const loadUserRailWidgets = () => import("@/components/studio/recipe-item").then((m) => m.userRailWidgets());

/** Reads the list again on the next load (a package was imported or removed). */
export const reloadRecipes = (): void => {
  pending = undefined;
};

/** The recipes' Add rows; empty until the list has loaded. */
export function useRecipeItems(): readonly AddItem[] {
  const [list, setList] = useState(loaded);
  useEffect(() => {
    let live = true;
    void loadRecipeItems().then((r) => {
      loaded = r;
      if (live) setList(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return list;
}
