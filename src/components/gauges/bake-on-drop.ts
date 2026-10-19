/**
 * Baking a vector gauge as it is dropped into a canvas zone (#47 G21): the frames InfoPanel draws are
 * made and stored first, so the drop that follows is whole or doesn't happen. The same bake as the
 * bake bar's Bake frames.
 */
import { uploadBytes } from "@/lib/assets";
import { MIME } from "@/lib/infopanel/assets/assets";
import type { DroppedFile } from "@/lib/infopanel/canvas-edit";
import { bakeSignature, safeStem } from "@/lib/infopanel/gauges/frames";
import { bake } from "@/lib/infopanel/gauges/raster";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { DEFAULT_BAKE_COUNT } from "./bake-bar";

/** The gauge's baked frames as stored files, and what they were baked from. Rejects when baking or storing fails. */
export async function bakeForDrop(gauge: VectorGauge, name: string): Promise<{ frames: DroppedFile[]; baked: string }> {
  const files = await bake(gauge, DEFAULT_BAKE_COUNT, safeStem(name));
  const frames = await Promise.all(
    files.map(async (f): Promise<DroppedFile> => {
      const id = (await uploadBytes(f.bytes, MIME[f.type])).id;
      return { name: f.name, hash: f.hash, type: f.type, size: f.bytes.length, ext: id.split(".").slice(1).join("."), width: f.width, height: f.height };
    }),
  );
  return { frames, baked: bakeSignature(gauge, frames.length) };
}
