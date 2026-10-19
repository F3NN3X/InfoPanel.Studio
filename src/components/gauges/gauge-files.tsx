/** Gauge files on the Gauges page: picking a `.gauge.json` or SVG to import, downloading a spec, and an image sequence's frames zip. */
import { useRef } from "react";
import { Download, FileArchive } from "lucide-react";
import { download } from "@/components/infopanel/export-dialog";
import { useToast } from "@/components/ui/toast";
import { framesFileName, framesZip, readFramesZip, type FramesFile } from "@/lib/gauge-studio/frames-zip";
import { exportFileName, importGauge, type ImportedGauge } from "@/lib/gauge-studio/import-file";
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

/** The Import button: a `.gauge.json` or an SVG; refusals and anything the sanitiser dropped are toasts. */
export function ImportGaugeButton({ onImported, className, label = "Import .gauge.json / SVG" }: { onImported: (got: ImportedGauge) => void; className: string; label?: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File) => {
    try {
      const got = importGauge(file.name, await file.text());
      if (got.removed.length) toast(`Removed from the SVG: ${got.removed.slice(0, 4).join(", ")}`);
      onImported(got);
    } catch (e) {
      toast(`Not imported: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className}>
        <Download className="h-4 w-4" /> {label}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.gauge.json,.svg,application/json,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
    </>
  );
}

/** Download an image sequence as `<name>.gauge-frames.zip` (its frames as PNG plus a manifest). */
export async function downloadFrames(entry: GaugeEntry): Promise<void> {
  const urls = entry.frames ?? [];
  if (!urls.length || urls.some((u) => !u)) throw new Error("Some of its frames cannot be read");
  const frames = await Promise.all(urls.map((u) => fetchFrameBytes(u!)));
  const { name, min, max, animationSpeed } = entry;
  await download(framesFileName(name), framesZip({ name, min, max, animationSpeed, frames }), "application/zip");
}

/** The Import button for a `.gauge-frames.zip`: refusals are toasts. */
export function ImportFramesButton({ onImported, className }: { onImported: (got: FramesFile) => void | Promise<void>; className: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File) => {
    try {
      await onImported(await readFramesZip(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      toast(`Not imported: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className}>
        <FileArchive className="h-4 w-4" /> Import frames (.zip)
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        aria-label="Import frames zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
    </>
  );
}
