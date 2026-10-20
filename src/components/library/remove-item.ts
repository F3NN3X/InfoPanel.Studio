/**
 * Removing a library item also deletes its files (a gauge's frames included) from the asset
 * store, unless something still uses them: another item, the saved config or a canvas (the
 * server's `?unused=1` scan), or the studio's unsaved config (`inUse`, scanned for hashes).
 */
import { deleteAsset, unusedAssets, type Asset } from "@/lib/assets";
import { deleteLibraryItem, type LibraryItem } from "@/lib/library";
import { dataOf } from "./library-actions";
import { heldIds } from "./loose-uploads";

/** Files deleted, and files that should have gone but whose delete failed. */
export interface RemoveResult {
  deleted: number;
  kept: number;
}

/** The ids of `held` that are unused and not named in `inUse`. */
export function filesToDrop(held: readonly string[], unused: readonly Pick<Asset, "id">[], inUse: string): string[] {
  const free = new Set(unused.map((a) => a.id));
  return [...new Set(held)].filter((id) => free.has(id) && !inUse.includes(id.slice(0, 64)));
}

/**
 * Delete the item, then its files nothing else uses. Rejects only when the item itself isn't
 * deleted; a file that fails to go is counted in `kept`. `inUse` is read just before the deletes.
 */
export async function removeItem(item: LibraryItem, inUse: () => string): Promise<RemoveResult> {
  const held = heldIds({ files: item.files, data: await dataOf(item) });
  await deleteLibraryItem(item.id);
  if (held.length === 0) return { deleted: 0, kept: 0 };
  let unused: Asset[];
  try {
    unused = await unusedAssets();
  } catch {
    return { deleted: 0, kept: new Set(held).size };
  }
  const drop = filesToDrop(held, unused, inUse());
  const results = await Promise.allSettled(drop.map((id) => deleteAsset(id)));
  const deleted = results.filter((r) => r.status === "fulfilled").length;
  return { deleted, kept: drop.length - deleted };
}
