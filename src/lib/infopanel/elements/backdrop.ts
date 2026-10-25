/**
 * What a blurred card has behind it, for the export's bake: the profile's background colour and
 * the items drawn before the card (in tree order) that are plain pictures (static elements, image
 * files, rectangles). Text, values and gauges are live, so they are not in the baked backdrop; the
 * card's badge says so. Pure; `raster.ts` draws the layers.
 */
import { assetKey, type AssetTable } from "../assets/assets.ts";
import type { Path } from "../editor/ops.ts";
import type { DisplayItem } from "../schema.ts";
import { cssOf } from "./palette.ts";
import { elementSvg, staticOf } from "./svg.ts";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BackdropLayer =
  | ({ kind: "fill"; color: string; radius: number } & Box)
  | ({ kind: "svg"; svg: string } & Box)
  | ({ kind: "file"; name: string; hash: string } & Box);

/** The layers under the item at `path`, bottom first; `background` is the profile's colour. */
export function backdropLayers(items: readonly DisplayItem[], path: Path, background: string, assets: AssetTable, canvas: { width: number; height: number }): BackdropLayer[] {
  const layers: BackdropLayer[] = [{ kind: "fill", color: cssOf(background), radius: 0, x: 0, y: 0, w: canvas.width, h: canvas.height }];
  let n = 0;
  // True once `path` is reached: everything after it is above the card.
  const walk = (list: readonly DisplayItem[], prefix: string): boolean => {
    for (let i = 0; i < list.length; i++) {
      const at = prefix ? `${prefix}.${i}` : String(i);
      if (at === path) return true;
      const item = list[i];
      if (item.Hidden) continue;
      if (item.kind === "Group") {
        if (walk(item.DisplayItems, at)) return true;
        continue;
      }
      const el = staticOf(item);
      if (el) {
        layers.push({ kind: "svg", svg: elementSvg(el.spec, el.width, el.height, `bd${n++}-`), x: item.X, y: item.Y, w: el.width, h: el.height });
      } else if (item.kind === "Image" && item.FilePath && item.Width > 0 && item.Height > 0) {
        const file = assets.get(assetKey(item.FilePath));
        if (file) layers.push({ kind: "file", name: file.name, hash: file.hash, x: item.X, y: item.Y, w: item.Width, h: item.Height });
      } else if (item.kind === "Shape" && item.Type === "Rectangle" && item.ShowFill) {
        layers.push({ kind: "fill", color: cssOf(item.FillColor), radius: item.CornerRadius, x: item.X, y: item.Y, w: item.Width, h: item.Height });
      }
    }
    return false;
  };
  walk(items, "");
  return layers;
}

/** What the backdrop is baked from: the blur and the layers (files by hash), recorded with the baked card. */
export const backdropSignature = (blur: number, layers: readonly BackdropLayer[]): string =>
  JSON.stringify([blur, layers.map((l) => (l.kind === "file" ? { ...l, name: undefined } : l))]);
