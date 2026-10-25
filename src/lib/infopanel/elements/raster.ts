/**
 * Browser-only: a static element baked to one PNG through a canvas (the same SVG the editor and
 * the kiosk draw), transparency kept. A blurred card gets its backdrop (the layers under it,
 * blurred) drawn under the card's own image.
 */
import { backdropFilter, backdropMargin } from "../../effects/blur.ts";
import { assetFile, assetKey, type AssetFile, type AssetTable } from "../assets/assets.ts";
import { safeStem } from "../gauges/frames.ts";
import { rasterSvg } from "../gauges/raster.ts";
import type { BackdropLayer } from "./backdrop.ts";
import { loadIcons } from "./icons.ts";
import { elementSvg, type StaticSpec } from "./svg.ts";

const decode = async (src: Blob | string): Promise<ImageBitmap> => {
  if (typeof src !== "string") return createImageBitmap(src);
  const url = URL.createObjectURL(new Blob([src], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** The layers drawn onto a canvas whose origin is the item's box shifted by `margin`. */
async function drawLayers(ctx: OffscreenCanvasRenderingContext2D, layers: readonly BackdropLayer[], assets: AssetTable, at: { x: number; y: number }) {
  for (const l of layers) {
    const [x, y] = [l.x - at.x, l.y - at.y];
    if (l.kind === "fill") {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.roundRect(x, y, l.w, l.h, l.radius);
      ctx.fill();
      continue;
    }
    const bits = l.kind === "svg" ? await decode(l.svg) : await decode(new Blob([assets.get(assetKey(l.name))!.bytes as BlobPart]));
    ctx.drawImage(bits, x, y, l.w, l.h);
  }
}

/**
 * The card's image over its blurred backdrop. The layers are drawn on a canvas wider than the card
 * by the blur's margin and blurred as a whole, so the blur doesn't fade at the card's own edge, then
 * the card's rounded box is cut out of it and the card drawn over.
 */
async function bakeFrosted(spec: Extract<StaticSpec, { type: "card" }>, width: number, height: number, layers: readonly BackdropLayer[], assets: AssetTable, at: { x: number; y: number }): Promise<Uint8Array> {
  const blur = spec.blur ?? 0;
  const m = backdropMargin(blur);
  await loadIcons();
  const flat = new OffscreenCanvas(width + 2 * m, height + 2 * m);
  await drawLayers(flat.getContext("2d")!, layers, assets, { x: at.x - m, y: at.y - m });
  const out = new OffscreenCanvas(width, height);
  const ctx = out.getContext("2d")!;
  const [x, y, w, h] = [spec.pad, spec.pad, Math.max(1, width - 2 * spec.pad), Math.max(1, height - 2 * spec.pad)];
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(spec.radius, w / 2, h / 2));
  ctx.clip();
  ctx.filter = backdropFilter(blur);
  ctx.drawImage(flat, -m, -m);
  ctx.restore();
  ctx.drawImage(await decode(elementSvg(spec, width, height, "bake-")), 0, 0, width, height);
  const blob = await out.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export interface Backdrop {
  layers: readonly BackdropLayer[];
  assets: AssetTable;
  /** The element's top left on the canvas. */
  at: { x: number; y: number };
}

export async function bakeElement(spec: StaticSpec, width: number, height: number, name: string, backdrop?: Backdrop): Promise<AssetFile> {
  if (spec.type === "icon") await loadIcons();
  const bytes =
    spec.type === "card" && (spec.blur ?? 0) > 0 && backdrop
      ? await bakeFrosted(spec, width, height, backdrop.layers, backdrop.assets, backdrop.at)
      : await rasterSvg(elementSvg(spec, width, height, "bake-"), width, height);
  return assetFile(`${safeStem(name || spec.type)}_${spec.type}.png`, bytes, "added");
}
