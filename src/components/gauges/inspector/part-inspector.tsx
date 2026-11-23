/** The right pane of the editor: the selected part's fields, with Add / Remove part in its header, then Value range and Colour zones. */
import type { ReactNode } from "react";
import { InspectorChromeProvider } from "@/components/studio/inspector-layout";
import { ALWAYS_ON, addPart, hasPart, partLabel, removePart, type PartId } from "@/lib/gauge-studio/parts";
import { BackgroundInspector, CentreIconInspector, FaceInspector, IconsInspector, PatternInspector, RingsInspector } from "./decor";
import { BubblesInspector, GlowInspector, ShadowInspector, ShineInspector, WaveInspector } from "./effects";
import { FillInspector } from "./fill";
import { NeedleInspector, TrackInspector } from "./indicator";
import type { InspectorProps } from "./rows";
import { LabelsInspector, TicksInspector } from "./scale";
import { ShapeInspector } from "./shape";
import { TextInspector, TitleInspector } from "./text";
import { ColourZones, type ColourZonesProps } from "./colour-zones";
import { ValueRange, type ValueRangeProps } from "./value-range";

const BODY: Record<PartId, (p: InspectorProps) => ReactNode> = {
  shape: ShapeInspector,
  fill: FillInspector,
  track: TrackInspector,
  needle: NeedleInspector,
  marker: NeedleInspector,
  ticks: TicksInspector,
  labels: LabelsInspector,
  // The range is Value range's, under every part.
  scale: () => null,
  text: TextInspector,
  title: TitleInspector,
  background: BackgroundInspector,
  face: FaceInspector,
  rings: RingsInspector,
  pattern: PatternInspector,
  icons: IconsInspector,
  icon: CentreIconInspector,
  glow: GlowInspector,
  shadow: ShadowInspector,
  wave: WaveInspector,
  shine: ShineInspector,
  bubbles: BubblesInspector,
};

const BLURB: Partial<Record<PartId, string>> = {
  track: "The unfilled range behind the fill.",
  needle: "A needle from the center to the value.",
  marker: "A mark across the bar at the value.",
  ticks: "Marks along the range.",
  scale: "The range the gauge reads.",
  labels: "The scale values at the major ticks. Adds ticks if there are none.",
  text: "The value as text, in the middle.",
  title: "A caption.",
  background: "Behind the gauge.",
  face: "A textured disc inside the ring: hex, dots, grid or carbon.",
  rings: "Faint rings outside the arc.",
  pattern: "Stripes, dots or chevrons over the bar fill.",
  icons: "A row of icons in place of the bar.",
  icon: "An icon in the middle.",
  glow: "A soft light around the fill.",
  shadow: "A drop shadow under the gauge.",
  wave: "A moving surface on the liquid. Off is flat.",
  shine: "A highlight along the surface.",
  bubbles: "Bubbles rising to the surface.",
};

export function PartInspector({ part, g, set, view, onView, onOpenSources, zones, onOpenRule }: InspectorProps & { part: PartId; view: ValueRangeProps["view"]; onView: ValueRangeProps["onView"]; onOpenSources: () => void; zones: ColourZonesProps["read"]; onOpenRule: ColourZonesProps["onOpenRule"] }) {
  const on = hasPart(g, part);
  const Body = BODY[part];
  return (
    <InspectorChromeProvider value={{ mode: "docked" }}>
      <aside aria-label={`${partLabel(part)} settings`} className="flex w-75 shrink-0 flex-col border-l border-ui-subtle bg-ui-panel font-ui max-narrow:w-full max-narrow:border-l-0 max-narrow:border-t">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ui-subtle px-4">
          <h2 className="flex-1 truncate text-body font-medium text-ui-1">{partLabel(part)}</h2>
          {!ALWAYS_ON.includes(part) && (
            <button
              type="button"
              onClick={() => set(on ? removePart(g, part) : addPart(g, part))}
              className="h-6.5 rounded-8 border border-ui-default px-2.5 text-caption text-ui-1 hover:bg-ui-hover"
            >
              {on ? "Remove part" : "Add part"}
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!on && <p className="text-caption leading-snug text-ui-4">Not added. {BLURB[part]}</p>}
          {on && <Body g={g} set={set} />}
          <ValueRange g={g} set={set} view={view} onView={onView} onOpenSources={onOpenSources} />
          <ColourZones read={zones} view={view} onView={onView} unit={g.scale?.unit ?? ""} onOpenRule={onOpenRule} />
        </div>
      </aside>
    </InspectorChromeProvider>
  );
}
