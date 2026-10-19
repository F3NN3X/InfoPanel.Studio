/** The right pane of the editor: the selected part's fields, with Add / Remove part in its header. */
import type { ReactNode } from "react";
import { InspectorChromeProvider } from "@/components/studio/inspector-layout";
import { ALWAYS_ON, addPart, hasPart, partLabel, removePart, type PartId } from "@/lib/gauge-studio/parts";
import { BackgroundInspector, CentreIconInspector, IconsInspector, PatternInspector, RingsInspector } from "./decor";
import { BubblesInspector, GlowInspector, ShadowInspector, ShineInspector, WaveInspector } from "./effects";
import { FillInspector } from "./fill";
import { NeedleInspector, TrackInspector } from "./indicator";
import type { InspectorProps } from "./rows";
import { LabelsInspector, TicksInspector } from "./scale";
import { ShapeInspector } from "./shape";
import { ScaleRows, TextInspector, TitleInspector } from "./text";

const BODY: Record<PartId, (p: InspectorProps) => ReactNode> = {
  shape: ShapeInspector,
  fill: FillInspector,
  track: TrackInspector,
  needle: NeedleInspector,
  marker: NeedleInspector,
  ticks: TicksInspector,
  labels: LabelsInspector,
  text: TextInspector,
  title: TitleInspector,
  background: BackgroundInspector,
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
  needle: "A needle from the centre to the value.",
  marker: "A mark across the bar at the value.",
  ticks: "Marks along the range.",
  labels: "The scale values at the major ticks. Adds ticks if there are none.",
  text: "The value as text, in the middle.",
  title: "A caption.",
  background: "Behind the gauge.",
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

export function PartInspector({ part, g, set }: InspectorProps & { part: PartId }) {
  const on = hasPart(g, part);
  const Body = BODY[part];
  return (
    <InspectorChromeProvider value={{ mode: "docked" }}>
      <aside aria-label={`${partLabel(part)} settings`} className="flex w-[300px] shrink-0 flex-col border-l border-ui-subtle bg-ui-panel font-ui max-[899px]:w-full max-[899px]:border-l-0 max-[899px]:border-t">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ui-subtle px-4">
          <h2 className="flex-1 truncate text-[13px] font-semibold text-ui-1">{partLabel(part)}</h2>
          {!ALWAYS_ON.includes(part) && (
            <button
              type="button"
              onClick={() => set(on ? removePart(g, part) : addPart(g, part))}
              className="h-[26px] rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover"
            >
              {on ? "Remove part" : "Add part"}
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!on && <p className="text-[12px] leading-snug text-ui-4">Not added. {BLURB[part]}</p>}
          {on && <Body g={g} set={set} />}
          {!on && part === "text" && <ScaleRows g={g} set={set} />}
        </div>
      </aside>
    </InspectorChromeProvider>
  );
}
