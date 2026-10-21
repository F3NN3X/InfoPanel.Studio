/** Gauge files downloaded from the Library: a spec as `.gauge.json`, an image sequence as its frames zip. Importing is the Import door's. */
import { download } from "@/components/infopanel/export-dialog";
import { framesFileName, framesZip } from "@/lib/gauge-studio/frames-zip";
import { exportFileName } from "@/lib/gauge-studio/import-file";
import type { GaugeEntry } from "@/lib/gauge-studio/model";
import { specFile } from "@/lib/infopanel/gauges/spec-file";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { fetchFrameBytes } from "./frame-files";

/** Download `gauge` as `<name>.gauge.json`. */
export function downloadSpec(name: string, gauge: VectorGauge): void {
  const url = URL.createObjectURL(new Blob([specFile(name, gauge)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download an image sequence as `<name>.gauge-frames.zip` (its frames as PNG plus a manifest). */
export async function downloadFrames(entry: GaugeEntry): Promise<void> {
  const urls = entry.frames ?? [];
  if (!urls.length || urls.some((u) => !u)) throw new Error("Some of its frames cannot be read");
  const frames = await Promise.all(urls.map((u) => fetchFrameBytes(u!)));
  const { name, min, max, animationSpeed } = entry;
  await download(framesFileName(name), framesZip({ name, min, max, animationSpeed, frames }), "application/zip");
}
