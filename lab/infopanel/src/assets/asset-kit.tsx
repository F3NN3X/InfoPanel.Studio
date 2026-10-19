/** Shared pieces of the asset panels: reading picked files, re-encoding images (browser only), a file picker button. */
import { useRef, type ReactNode } from "react";
import { assetFile, MIME, type AssetFile } from "@/lib/infopanel/assets/assets.ts";

export const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export const IMAGE_ACCEPT = "image/*,video/mp4,video/webm,.ico";

export const readFiles = (files: readonly File[]) =>
  Promise.all(files.map(async (f) => assetFile(f.name, new Uint8Array(await f.arrayBuffer()), "added")));

/** Can the browser re-encode it: a still raster image. */
export const reencodable = (f: AssetFile) => !f.animated && ["png", "jpeg", "webp", "gif", "bmp"].includes(f.type);

/** "same": JPEG and WebP stay lossy at `quality`, everything else becomes lossless PNG; "webp": lossy WebP. */
export type EncodeFormat = "same" | "webp";

/** The image drawn at `size` and encoded again. */
export async function reencode(f: AssetFile, size: { width: number; height: number }, format: EncodeFormat, quality: number): Promise<AssetFile> {
  const bitmap = await createImageBitmap(new Blob([f.bytes.slice()], { type: MIME[f.type] }));
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const type = format === "webp" ? "image/webp" : f.type === "jpeg" || f.type === "webp" ? MIME[f.type] : "image/png";
  const blob = await canvas.convertToBlob({ type, quality: quality / 100 });
  // The old name: replace() gives it the new type's extension and repoints the uses.
  return assetFile(f.name, new Uint8Array(await blob.arrayBuffer()), f.origin);
}

export function FileButton({ children, multiple, accept, onFiles }: { children: ReactNode; multiple?: boolean; accept: string; onFiles(files: File[]): void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => input.current?.click()}>{children}</button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          // Copied first: clearing the input empties its live FileList.
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
    </>
  );
}
