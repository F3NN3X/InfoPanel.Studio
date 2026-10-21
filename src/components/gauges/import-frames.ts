/** A frames zip into My library: its frames to the asset store, then the sequence as a gauge item. */
import type { FramesFile } from "@/lib/gauge-studio/frames-zip";
import { assetFile } from "@/lib/infopanel/assets/assets";
import { uploadFrame } from "./frame-files";
import { saveGauge, type SavedGauge } from "./save-gauge";

export async function saveFramesGauge(got: FramesFile): Promise<SavedGauge> {
  const files = await Promise.all(got.frames.map(async (bytes, i) => uploadFrame(await assetFile(`${i + 1}.png`, bytes, "added"))));
  return saveGauge({ name: got.name, gauge: null, frames: files, min: got.min, max: got.max, animationSpeed: got.animationSpeed });
}
