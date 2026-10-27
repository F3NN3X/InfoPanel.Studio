/**
 * Removing a library item also deletes its files (a gauge's frames included) from the asset
 * store, unless something still uses them: another item, the saved config or a canvas (the
 * server's `?unused=1` scan), or the studio's unsaved config (`inUse`, scanned for hashes). An item
 * that is one file (an image, a video, an SVG) is not removed at all while its file is in use: the file
 * is part of My library for as long as a screen shows it.
 */
import { deleteAsset, unusedAssets, type Asset } from "@/lib/assets";
import { deleteLibraryItem, type LibraryItem, type LibraryKind } from "@/lib/library";
import { heldIds } from "./adopt-uploads";
import { dataOf } from "./library-actions";

/** Files deleted, and files that should have gone but whose delete failed; `refused`: the item stayed. */
export interface RemoveResult {
  deleted: number;
  kept: number;
  refused?: RemoveBlock;
}

/** Why an item stays: a screen, a canvas or another item uses its file, or that couldn't be checked. */
export type RemoveBlock = "used" | "unchecked";

/** The kinds that are one file: while that file is in use the item stays (else it would come back as an upload). */
export const FILE_KINDS: ReadonlySet<LibraryKind> = new Set<LibraryKind>(["image", "video", "svg"]);

/** Why a file item can't be removed now, or null when it can (other kinds always can: their files are kept as needed). */
export async function removeBlocked(item: Pick<LibraryItem, "kind" | "files">, inUse: () => string): Promise<RemoveBlock | null> {
  if (!FILE_KINDS.has(item.kind) || item.files.length === 0) return null;
  let unused: Asset[];
  try {
    unused = await unusedAssets();
  } catch {
    return "unchecked";
  }
  return filesToDrop(item.files, unused, inUse()).length < new Set(item.files).size ? "used" : null;
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
