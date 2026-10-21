/** The Import door's Library kinds: gauges, frames zips, images, videos and fonts into My library. */
import { addFileToLibrary } from "@/components/library/add-file";
import { saveFramesGauge } from "@/components/gauges/import-frames";
import { saveGauge } from "@/components/gauges/save-gauge";
import { readFramesZip } from "@/lib/gauge-studio/frames-zip";
import { importGauge } from "@/lib/gauge-studio/import-file";
import { fontsInZip } from "@/lib/infopanel/font-requests";
import type { ImportKind } from "@/lib/import-sniff";
import { listLibrary, type LibraryItem } from "@/lib/library";

/** Where the door goes once the files are in: the gauge to open, or a Library collection. */
export type DoorGoto = { to: "gauge"; itemId: string } | { to: "library"; collection: "media" | "fonts" };

export interface LibraryOutcome {
  done: string[];
  failed: string[];
  goto: DoorGoto | null;
  /** The first image or video that went in (or was already there): "Also use it as the background". */
  media: LibraryItem | null;
  changed: boolean;
}

export const LIBRARY_KINDS: readonly ImportKind[] = ["gauge", "gauge-svg", "frames-zip", "image", "video", "font", "fonts-zip"];

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Put each file (a sniffed Library kind) into My library; a failing file is reported and the rest go on. */
export async function importToLibrary(files: readonly { file: File; kind: ImportKind }[]): Promise<LibraryOutcome> {
  const out: LibraryOutcome = { done: [], failed: [], goto: null, media: null, changed: false };
  let known = await listLibrary().catch(() => [] as LibraryItem[]);
  const goto = (g: DoorGoto) => (out.goto ??= g);

  const addFile = async (file: File, kind: ImportKind) => {
    const r = await addFileToLibrary(file, known);
    if (r.state === "error") return void out.failed.push(`${file.name}: ${r.message}`);
    if (r.state === "done") {
      known = [r.item, ...known];
      out.changed = true;
      out.done.push(`Added ${r.item.name} to the Library`);
    } else out.done.push(`${r.item.name} is already in your library`);
    if (kind === "image" || kind === "video") out.media ??= r.item;
    goto({ to: "library", collection: kind === "font" ? "fonts" : "media" });
  };

  for (const { file, kind } of files) {
    try {
      if (kind === "gauge" || kind === "gauge-svg") {
        const got = importGauge(file.name, await file.text());
        const item = await saveGauge({ name: got.name, gauge: got.gauge });
        out.changed = true;
        out.done.push(got.removed.length ? `Added ${got.name} · removed from the SVG: ${got.removed.slice(0, 4).join(", ")}` : `Added ${got.name} to Library › Gauges`);
        goto({ to: "gauge", itemId: item.id });
      } else if (kind === "frames-zip") {
        const got = await readFramesZip(new Uint8Array(await file.arrayBuffer()));
        const item = await saveFramesGauge(got);
        out.changed = true;
        out.done.push(`Added ${got.name} (${got.frames.length} frames) to Library › Gauges`);
        goto({ to: "gauge", itemId: item.id });
      } else if (kind === "fonts-zip") {
        const found = await fontsInZip(new Uint8Array(await file.arrayBuffer()));
        if (found.length === 0) out.failed.push(`${file.name}: no font files`);
        for (const f of found) await addFile(new File([f.data.slice()], f.name), "font");
      } else {
        await addFile(file, kind);
      }
    } catch (e) {
      out.failed.push(`${file.name}: ${reason(e)}`);
    }
  }
  return out;
}
