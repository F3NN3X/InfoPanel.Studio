/** Browser-side pieces of the Profile assets tab: reading picked files and re-encoding still images. */
import { assetFile, MIME, type AssetFile } from "@/lib/infopanel/assets/assets";

export const IMAGE_ACCEPT = "image/*,video/mp4,video/webm,.ico";

export const readFiles = (files: readonly File[]): Promise<AssetFile[]> =>
  Promise.all(files.map(async (f) => assetFile(f.name, new Uint8Array(await f.arrayBuffer()), "added")));

/** Can the browser re-encode it: a still raster image of known size. */
export const reencodable = (f: AssetFile): boolean => !f.animated && !!f.width && !!f.height && ["png", "jpeg", "webp", "gif", "bmp"].includes(f.type);

/** "same": JPEG and WebP stay lossy at `quality`, everything else becomes lossless PNG; "webp": lossy WebP. */
export type EncodeFormat = "same" | "webp";

/** The image drawn at `size` and encoded again; it keeps the old name (`replace` gives it the new type's extension). */
export async function reencode(f: AssetFile, size: { width: number; height: number }, format: EncodeFormat, quality: number): Promise<AssetFile> {
  const bitmap = await createImageBitmap(new Blob([f.bytes.slice()], { type: MIME[f.type] }));
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const type = format === "webp" ? "image/webp" : f.type === "jpeg" || f.type === "webp" ? MIME[f.type] : "image/png";
  const blob = await canvas.convertToBlob({ type, quality: quality / 100 });
  return assetFile(f.name, new Uint8Array(await blob.arrayBuffer()), f.origin);
}
