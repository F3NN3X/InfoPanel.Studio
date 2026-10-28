/**
 * The frame tools of a canvas image-sequence gauge (spec §6): each edits the zone's frame list or files
 * through `useCanvasCommit`, so it is one studio undo step. The frame rate is the item's AnimationSpeed.
 */
import { useMemo } from "react";
import type { StudioBridge } from "@/components/library/library-actions";
import { convertSpec } from "@/lib/gauge-studio/convert";
import { sourceKey, withGauge, withGaugeSpeed, type GaugeEntry, type GaugeSource } from "@/lib/gauge-studio/model";
import type { AssetFile } from "@/lib/infopanel/assets/assets";
import { frameNames, isGauge, reorderFrames, setFrameFile, setFrameFiles } from "@/lib/infopanel/gauges/frames";
import { recolourFrames } from "@/lib/infopanel/gauges/raster";
import { itemAt } from "@/lib/infopanel/editor/ops";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { imageSize, readFrameFiles } from "./frame-files";
import type { FramesTools } from "./frames-tools";
import { useCanvasCommit } from "./use-canvas-commit";

type CanvasSource = Extract<GaugeSource, { kind: "canvas" }>;

export function useCanvasFrames(bridge: StudioBridge, entry: GaugeEntry, source: CanvasSource, stored: StoredCanvas): FramesTools {
  const { busy, note, commit } = useCanvasCommit(source.zoneId, stored, bridge.setConfig);
  const frames = useMemo(() => entry.frames ?? [], [entry.frames]);
  const key = sourceKey(source);

  return {
    frames,
    animationSpeed: entry.animationSpeed,
    busy,
    note,
    ready: true,
    reorder: (what, order) => void commit(what, (d) => ({ ...d, items: reorderFrames(d.items, source.path, order) })),
    replace: async (indexes, picked) => {
      await commit("Replacing frames", async (d) => {
        const files = await readFrameFiles(picked.slice(0, indexes.length));
        return files.reduce((doc, file, k) => setFrameFile(doc, source.path, indexes[k], file), d);
      });
    },
    recolour: (r) =>
      commit(
        "Recoloring",
        async (d) => {
          const item = itemAt(d.items, source.path);
          const files = (isGauge(item) ? frameNames(item) : []).map((n) => (n ? d.assets.get(n) : undefined));
          if (files.length === 0 || files.some((f) => !f || f.bytes.length === 0)) throw new Error("some frames are not files of this screen");
          return setFrameFiles(d, source.path, await recolourFrames(files as AssetFile[], r));
        },
        "Recolored every frame",
      ),
    setSpeed: (fps) => bridge.setConfig((c) => withGaugeSpeed(c, source, fps), `gauge:${key}:fps`),
    convert: async () => {
      const spec = convertSpec(await imageSize(frames[0]));
      bridge.setConfig((c) => withGauge(c, source, spec) ?? c);
    },
  };
}
