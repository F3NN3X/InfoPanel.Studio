import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { DashboardConfig } from "@/lib/layout";
import { createLibraryItem, listLibrary, updateLibraryItem, type LibraryItem } from "@/lib/library";
import { canvasData, canvasItem, copyOfProfile, unplacedProfiles } from "@/lib/my-library/canvas-link";

/**
 * The InfoPanel profiles saved in the Library that no zone of the dashboard uses, with the actions on them:
 * duplicate, rename and remove. Remove goes through the Library's guard, which keeps every file a screen still uses.
 */
export function useSavedProfiles(config: Pick<DashboardConfig, "profiles">) {
  const toast = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const refresh = useCallback(
    () =>
      listLibrary().then(
        (all) => setItems(all.filter((i) => i.kind === "canvas")),
        () => {},
      ),
    [],
  );
  useEffect(() => void refresh(), [refresh]);

  const duplicate = async (item: LibraryItem) => {
    try {
      const stored = await canvasData(item);
      if (!stored) throw new Error("it couldn’t be read");
      const name = `${item.name} copy`;
      await createLibraryItem(canvasItem(copyOfProfile(stored, name), name));
      await refresh();
    } catch (e) {
      toast(`Not duplicated: ${(e as Error).message}`);
    }
  };
  const rename = async (item: LibraryItem, name: string) => {
    try {
      await updateLibraryItem(item.id, { name });
      await refresh();
    } catch (e) {
      toast(`Not renamed: ${(e as Error).message}`);
    }
  };
  const remove = async (item: LibraryItem) => {
    try {
      // The files go with it unless something else uses them: the dashboard's profiles are checked first.
      const { removeItem } = await import("@/components/library/remove-item");
      await removeItem(item, () => JSON.stringify(config));
      await refresh();
    } catch (e) {
      toast(`Not removed: ${(e as Error).message}`);
    }
  };
  return { saved: unplacedProfiles(items, config), duplicate, rename, remove };
}

export type SavedProfiles = ReturnType<typeof useSavedProfiles>;
