/**
 * Browser-only: a static element baked to one PNG through a canvas (the same SVG the editor and
 * the kiosk draw), transparency kept.
 */
import { assetFile, type AssetFile } from "../assets/assets.ts";
import { safeStem } from "../gauges/frames.ts";
import { rasterSvg } from "../gauges/raster.ts";
import { loadIcons } from "./icons.ts";
import { elementSvg, type StaticSpec } from "./svg.ts";

export async function bakeElement(spec: StaticSpec, width: number, height: number, name: string): Promise<AssetFile> {
  if (spec.type === "icon") await loadIcons();
  const svg = elementSvg(spec, width, height, "bake-");
  return assetFile(`${safeStem(name || spec.type)}_${spec.type}.png`, await rasterSvg(svg, width, height), "added");
}
