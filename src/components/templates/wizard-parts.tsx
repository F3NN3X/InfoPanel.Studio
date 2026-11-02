/**
 * Smaller parts of the New wizard page: the shape warning (a template at a size of a shape it isn't made for), a
 * card's sensor badge, Blank's preview, and the expanded preview over the gallery (for strips and large sizes).
 */
import type { ReactNode } from "react";
import { Minimize2, Radar, RectangleHorizontal } from "lucide-react";
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import { cn } from "@/lib/utils";
import { CLASS_NAMES, CLASS_ORDER } from "./shape-chips";
import { hintOf, type Size } from "./size-presets";
import type { SensorFit } from "./wizard-kit";

/** "standard, wide and strip". */
export function classList(fits: readonly ShapeClass[]): string {
  const names = CLASS_ORDER.filter((c) => fits.includes(c)).map((c) => CLASS_NAMES[c].toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

interface ShapeWarningProps {
  name: string;
  fits: readonly ShapeClass[];
  size: Size;
  own: Size;
  onUseOwn: () => void;
}

export function ShapeWarning({ name, fits, size, own, onUseOwn }: ShapeWarningProps) {
  const cls = shapeClassOf(size.width, size.height);
  const squeeze = cls === "strip" ? " into one row" : cls === "tall" ? " into one column" : "";
  return (
    <div role="note" className="flex gap-2 rounded-ui-md border border-ui-warning/30 bg-ui-warning/10 px-2.5 py-2 text-[11.5px] leading-normal text-ui-2">
      <RectangleHorizontal aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ui-warning" />
      <div className="min-w-0">
        {name} is made for {classList(fits)} screens. At {size.width} × {size.height} its zones are squeezed{squeeze}.{" "}
        <button type="button" onClick={onUseOwn} className="text-ui-accent-text hover:underline">
          Use its own size, {own.width} × {own.height}
        </button>
      </div>
    </div>
  );
}

/** A card's sensors: how many it reads, and how many of them this PC has (? without the Data API). */
export function SensorBadge({ fit, noData }: { fit: SensorFit | undefined; noData: boolean }) {
  if (!noData && (!fit || fit.need === 0)) return null;
  const missing = fit ? fit.need - fit.found : 0;
  const title = noData
    ? "Sensors can’t be checked: the Data API is unreachable"
    : missing > 0
      ? `${fit!.found} of ${fit!.need} sensors found on this PC`
      : `Reads ${fit!.need} sensors, all found on this PC`;
  return (
    <span role="img" title={title} aria-label={title} className={cn("flex shrink-0 items-center gap-1 font-ui-mono text-[10px]", noData ? "text-ui-4" : missing > 0 ? "text-ui-warning" : "text-ui-3")}>
      <Radar aria-hidden className="h-[13px] w-[13px]" strokeWidth={1.75} />
      {noData ? "?" : missing > 0 ? `${fit!.found}/${fit!.need}` : fit!.need}
    </span>
  );
}

/** Blank's preview: an empty grid of dashed cells at the size's shape (a screen), or an empty canvas (a profile). */
export function BlankPreview({ size, grid }: { size: Size; grid: boolean }) {
  if (!grid) return <div className="grid h-full w-full place-items-center text-caption text-ui-4">An empty canvas</div>;
  const [cols, rows] = { standard: [4, 3], wide: [6, 2], strip: [8, 1], tall: [2, 6] }[shapeClassOf(size.width, size.height)];
  return (
    <div className="absolute inset-[3%] grid gap-[2%]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <span key={i} className="rounded-[3px] border border-dashed border-ui-strong" />
      ))}
    </div>
  );
}

/** The preview over the gallery, as large as the pane leaves; Collapse or Escape closes it. */
export function ExpandedPreview({ size, onCollapse, children }: { size: Size; onCollapse: () => void; children: ReactNode }) {
  const hint = hintOf(size);
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ui-app/95 [container-type:size]">
      <div
        className="relative overflow-hidden rounded-ui-md border border-ui-strong bg-ui-app"
        style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(calc(100cqw - 64px), calc((100cqh - 100px) * ${size.width / size.height}))` }}
      >
        {children}
      </div>
      <div className="flex items-center gap-3 text-micro">
        <span className="font-ui-mono text-ui-2">
          {size.width} × {size.height}
          {hint && <span className="font-ui text-ui-3"> · {hint}</span>}
        </span>
        <button type="button" onClick={onCollapse} className="flex h-6 items-center gap-1.5 rounded-ui-sm border border-ui-strong px-2 text-ui-2 hover:bg-ui-hover hover:text-ui-1">
          <Minimize2 aria-hidden className="h-3.5 w-3.5" />
          Collapse
        </button>
      </div>
    </div>
  );
}
