/**
 * Browser-only image work for gauges (L7): baking a vector gauge into PNG
 * frames and recolouring frames, both through a canvas.
 */
import { assetFile, MIME, type AssetFile } from "../assets/assets.ts";
import { gaugeSvg, type VectorGauge } from "./vector.ts";

async function pngOf(canvas: OffscreenCanvas): Promise<Uint8Array> {
  return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
}

/** SVG markup → PNG bytes at its own size (an <img> decodes SVG; createImageBitmap does not everywhere). */
export async function rasterSvg(svg: string, width: number, height: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await pngOf(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const pad = (i: number, count: number) => String(i).padStart(Math.max(3, String(count - 1).length), "0");

/**
 * The gauge as `count` frames, frame i at i / (count − 1) of the range: the
 * frame InfoPanel picks for a value is the one drawn at that value.
 */
export async function bake(g: VectorGauge, count: number, stem: string, onProgress?: (done: number) => void): Promise<AssetFile[]> {
  const files: AssetFile[] = [];
  for (let i = 0; i < count; i++) {
    const p = count === 1 ? 1 : i / (count - 1);
    files.push(await assetFile(`${stem}_${pad(i, count)}.png`, await rasterSvg(gaugeSvg(g, p), g.width, g.height), "added"));
    onProgress?.(i + 1);
  }
  return files;
}

export interface Recolour {
  /** Degrees. */
  hue: number;
  /** Percent; 100 keeps it. */
  saturation: number;
  brightness: number;
}

export const NO_RECOLOUR: Recolour = { hue: 0, saturation: 100, brightness: 100 };

/** The same adjustment as a CSS filter, for previews. */
export const recolourFilter = (r: Recolour) => `hue-rotate(${r.hue}deg) saturate(${r.saturation}%) brightness(${r.brightness}%)`;

/**
 * Recoloured copies of frames, as PNG (`-recoloured` added to the name).
 * Animated files would lose their animation, so they are refused.
 */
export async function recolourFrames(frames: readonly AssetFile[], r: Recolour): Promise<AssetFile[]> {
  const animated = frames.find((f) => f.animated || f.type === "video" || f.type === "svg" || f.type === "other");
  if (animated) throw new Error(`${animated.name} is ${animated.animated ? "animated" : `a ${animated.type} file`}; only still images recolour`);
  const done = new Map<string, AssetFile>();
  const out: AssetFile[] = [];
  for (const f of frames) {
    // A frame used twice is recoloured once.
    const known = done.get(f.hash);
    if (known) {
      out.push(known);
      continue;
    }
    const bitmap = await createImageBitmap(new Blob([f.bytes.slice()], { type: MIME[f.type] }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.filter = recolourFilter(r);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const stem = f.name.replace(/\.[^.]*$/, "");
    const file = await assetFile(`${stem}-recoloured.png`, await pngOf(canvas), "added");
    done.set(f.hash, file);
    out.push(file);
  }
  return out;
}
