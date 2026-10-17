/** Browser-side file work of the image-sequence editor: reading picked images, a frame's size, library frames' bytes. */
import { assetFile, MIME, type AssetFile } from "@/lib/infopanel/assets/assets";
import { ASSETS_URL, uploadBytes } from "@/lib/assets";
import type { LibraryFrame } from "@/lib/gauge-studio/model";

/** Still images a frame can be (a video or an animated file draws as nothing useful). */
export const FRAME_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

const STILL = new Set(["png", "jpeg", "webp", "gif", "bmp"]);

/** The picked files as asset files; a file that is not a still image is refused. */
export async function readFrameFiles(files: readonly File[]): Promise<AssetFile[]> {
  const read = await Promise.all(files.map(async (f) => assetFile(f.name, new Uint8Array(await f.arrayBuffer()), "added")));
  const bad = read.find((f) => !STILL.has(f.type) || f.animated);
  if (bad) throw new Error(`${bad.name} is not a still image (PNG, JPEG, WebP, GIF or BMP)`);
  return read;
}

const FALLBACK = { width: 256, height: 256 };

/** The natural size of the image at `url`; a square 256 when there is none to measure. */
export function imageSize(url: string | null | undefined): Promise<{ width: number; height: number }> {
  if (!url) return Promise.resolve(FALLBACK);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || FALLBACK.width, height: img.naturalHeight || FALLBACK.height });
    img.onerror = () => resolve(FALLBACK);
    img.src = url;
  });
}

/** A library frame's file, read back from the asset store. */
export async function fetchFrameFile(frame: LibraryFrame): Promise<AssetFile> {
  const res = await fetch(`${ASSETS_URL}/${frame.id}`);
  if (!res.ok) throw new Error(`${frame.name} could not be read from the asset store`);
  return assetFile(frame.name, new Uint8Array(await res.arrayBuffer()), "added");
}

/** The file stored in the asset store (identical bytes are stored once), as a library frame. */
export async function uploadFrame(file: AssetFile): Promise<LibraryFrame> {
  const { id } = await uploadBytes(file.bytes, MIME[file.type]);
  return { id, name: file.name };
}
