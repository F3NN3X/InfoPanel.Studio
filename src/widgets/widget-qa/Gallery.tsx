import { useState } from "react";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { SKIN_NAMES, SURFACE_NAMES } from "@/widgets/core/theme";
import { withDemo } from "./demo-settings";
import { Frame } from "./Frame";
import { gallerySpan, placement, spanSize } from "./plan";

export interface GalleryDef {
  title: string;
  module: string;
  span: [number, number];
  /** One frame per entry: its label and the setting it overrides. */
  variants: { label: string; settings: ModuleSettings }[];
}

/**
 * The Skins and Surfaces galleries: CpuMonitor at 3x2 and SystemStatus at 2x2, or both for the `gallery=` widget at its
 * default size, so any widget can be compared across every skin and surface.
 */
export function galleriesFor(mod: DashboardModule | undefined): GalleryDef[] {
  return [
    { title: "Skins", module: mod?.id ?? "CpuMonitor", span: mod ? gallerySpan(mod, [3, 2]) : [3, 2], variants: SKIN_NAMES.map((skin) => ({ label: skin, settings: { skin } })) },
    { title: "Surfaces", module: mod?.id ?? "SystemStatus", span: mod ? gallerySpan(mod, [2, 2]) : [2, 2], variants: SURFACE_NAMES.map((surface) => ({ label: surface, settings: { surface } })) },
  ];
}

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

/** Collapsed unless `opened` (a `gallery=` widget); the frames mount only once open. */
export function Gallery({ opened = false, ...props }: GalleryProps & { opened?: boolean }) {
  const [open, setOpen] = useState(opened);
  const { def } = props;
  return (
    <details className="mb-3" open={opened || undefined} onToggle={(e) => setOpen(e.currentTarget.open)}>
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
