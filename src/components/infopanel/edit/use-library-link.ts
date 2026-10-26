/**
 * The editor's "Save to Library": a new item the first time, "Update in Library" once the profile
 * has one (it was saved from here, or opened from the Library). The link is the one in
 * `my-library/canvas-link.ts`: the profile's source against the items' meta.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { createLibraryItem, listLibrary, updateLibraryItem, type LibraryItem } from "@/lib/library";
import { canvasItem, canvasUpdate, linkedItem } from "@/lib/my-library/canvas-link";

export interface LibraryLink {
  /** The toolbar button's label. */
  label: "Save to Library" | "Update in Library";
  busy: boolean;
  run: () => void;
}

/** Save a placed profile: its linked item updated, else a new one. Resolves to the toast's words. */
export function saveToLibrary(linked: LibraryItem | undefined, canvas: StoredCanvas, name: string): Promise<string> {
  return linked
    ? updateLibraryItem(linked.id, canvasUpdate(linked, canvas)).then(() => `Updated ${linked.name} in the Library`)
    : createLibraryItem(canvasItem(canvas, name)).then(() => `Saved ${name} to the Library`);
}

export function useLibraryLink(zoneId: string, canvas: StoredCanvas, name: string): LibraryLink {
  const toast = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => listLibrary().then(setItems, () => {}), []);
  useEffect(() => void load(), [load]);
  const linked = linkedItem(items, canvas, zoneId);
  const run = () => {
    setBusy(true);
    saveToLibrary(linked, canvas, name).then(
      (message) => {
        toast(message);
        return load();
      },
      (e: Error) => toast(`Not saved to the Library: ${e.message}`),
    ).finally(() => setBusy(false));
  };
  return { label: linked ? "Update in Library" : "Save to Library", busy, run };
}
