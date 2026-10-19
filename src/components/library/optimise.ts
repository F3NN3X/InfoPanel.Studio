/**
 * Optimise a library image (spec §3 detail pane): re-encode it as WebP and keep the result only
 * when it is at least 5 % smaller (`worthKeeping`). Animated files are left alone. The new bytes
 * go to the asset store; the item then points at them (it is the user's own copy).
 */
import { uploadBytes } from "@/lib/assets";
import { worthKeeping } from "@/lib/infopanel/assets/bulk";
import type { LibraryItem } from "@/lib/library";
import { fileUrl, metaOf, type MediaMeta } from "@/lib/my-library/model";

export const WEBP_QUALITY = 0.85;

export async function optimiseItem(item: LibraryItem): Promise<{ id: string; saved: number; meta: Partial<MediaMeta> } | null> {
  const m = metaOf(item);
  const url = fileUrl(item);
  if (!url || (m.frames ?? 1) > 1 || !m.width || !m.height) return null;
  const before = m.size ?? (await (await fetch(url)).blob()).size;
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = m.width;
  canvas.height = m.height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, m.width, m.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
  if (!blob || blob.type !== "image/webp" || !worthKeeping(before, blob.size)) return null;
  const stored = await uploadBytes(new Uint8Array(await blob.arrayBuffer()), "image/webp");
  return { id: stored.id, saved: before - blob.size, meta: { type: "webp", size: blob.size, hash: stored.id.slice(0, 64) } };
}
