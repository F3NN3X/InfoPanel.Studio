import { useState } from "react";
import type { ModuleSettings } from "@/modules/types";
import { SKIN_NAMES, SURFACE_NAMES } from "@/widgets/core/theme";
import { withDemo } from "./demo-settings";
import { Frame } from "./Frame";
import { placement, spanSize } from "./plan";

export interface GalleryDef {
  title: string;
  module: string;
  span: [number, number];
  /** One frame per entry: its label and the setting it overrides. */
  variants: { label: string; settings: ModuleSettings }[];
}

export const GALLERIES: GalleryDef[] = [
  { title: "Skins", module: "CpuMonitor", span: [3, 2], variants: SKIN_NAMES.map((skin) => ({ label: skin, settings: { skin } })) },
  { title: "Surfaces", module: "SystemStatus", span: [2, 2], variants: SURFACE_NAMES.map((surface) => ({ label: surface, settings: { surface } })) },
];

interface GalleryProps {
  def: GalleryDef;
  base: ModuleSettings;
  cell: number;
  gap: number;
  live: boolean;
}

/** The frames of one gallery. Figures carry `data-qa-gallery`, never `data-qa-module`, so the probe skips them. */
export function GalleryGrid({ def, base, cell, gap, live }: GalleryProps) {
  const [c, r] = def.span;
  return (
    <div className="flex flex-wrap items-start gap-6 pt-3">
      {def.variants.map((v) => (
        <figure key={v.label} data-qa-gallery={def.title} className="m-0 flex flex-col gap-1">
          <Frame
            p={{ ...placement(def.module, c, r, withDemo(def.module, { ...base, ...v.settings }, live)), id: `qa-gallery-${def.title}-${v.label}` }}
            w={spanSize(c, cell, gap)}
            h={spanSize(r, cell, gap)}
            live={live}
            eager
          />
          <figcaption className="font-mono text-[10px] opacity-60">{v.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Collapsed by default; the frames mount only once opened. */
export function Gallery(props: GalleryProps) {
  const [open, setOpen] = useState(false);
  const { def } = props;
  return (
    <details className="mb-3" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-semibold">
        {def.title} gallery{" "}
        <span className="font-normal opacity-60">
          · {def.module} {def.span[0]}x{def.span[1]} · {def.variants.length}
        </span>
      </summary>
      {open && <GalleryGrid {...props} />}
    </details>
  );
}
