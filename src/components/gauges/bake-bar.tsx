/**
 * The bake bar (spec §6), under the editor of a canvas gauge with a vector spec: whether the frames InfoPanel
 * would draw match the spec, and Bake frames. The dashboard always draws the spec live; baking is only for the
 * `.infopanel` export.
 */
import { useState } from "react";
import type { StudioBridge } from "@/components/library/library-actions";
import { cn } from "@/lib/utils";
import type { GaugeEntry, GaugeSource } from "@/lib/gauge-studio/model";
import { bakeSignature, safeStem, setFrameFiles } from "@/lib/infopanel/gauges/frames";
import { bake } from "@/lib/infopanel/gauges/raster";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { useCanvasCommit } from "./use-canvas-commit";

/** Frames a gauge with none gets. */
export const DEFAULT_BAKE_COUNT = 100;

export interface BakeBarProps {
  bridge: StudioBridge;
  source: Extract<GaugeSource, { kind: "canvas" }>;
  entry: GaugeEntry;
  gauge: VectorGauge;
}

export function BakeBar(props: BakeBarProps) {
  const stored = props.bridge.profile.placements.find((z) => z.id === props.source.zoneId)?.canvas;
  return stored ? <Bar {...props} stored={stored} /> : null;
}

function Bar({ bridge, source, entry, gauge, stored }: BakeBarProps & { stored: StoredCanvas }) {
  const { busy, note, commit } = useCanvasCommit(source.zoneId, stored, bridge.setConfig);
  const [done, setDone] = useState(0);
  const have = entry.frames?.length ?? 0;
  const count = have || DEFAULT_BAKE_COUNT;
  const stale = entry.stale === true;
  const run = () =>
    void commit(
      "Baking",
      async (doc) => {
        setDone(0);
        const files = await bake(gauge, count, safeStem(entry.name), setDone);
        return setFrameFiles(doc, source.path, files, bakeSignature(gauge, count));
      },
      `Baked ${count} frames`,
    );
  return (
    <footer aria-label="Bake bar" className="flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-t border-ui-subtle bg-ui-chrome px-4 py-2 font-ui">
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", stale ? "bg-ui-warning" : "bg-ui-success")} />
      <span className="text-[12.5px] text-ui-1">
        InfoPanel export · {stale ? (have ? "Frames out of date" : "No frames baked yet") : "Frames baked"}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ui-4">
        {busy ? `Baking ${done} of ${count}…` : (note ?? "The dashboard always draws this gauge live: baking only makes the frames the .infopanel export carries.")}
      </span>
      <button
        type="button"
        disabled={busy !== null}
        onClick={run}
        title={`Draws the spec into ${count} PNG frames, replacing the gauge's frames`}
        className="h-8 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
      >
        Bake frames
      </button>
    </footer>
  );
}
