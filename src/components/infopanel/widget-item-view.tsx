/**
 * A Studio widget on a Free page (one-editor SPEC §3.3, §9), drawn at its item's box by the native layer: the registry
 * widget (lazy, as a grid zone loads it) in the zone frame and its error boundary, under the screen's theme. Its
 * values come from the canvas zone's sensor map, never a stream of its own, and it only re-renders when its widget,
 * its size or one of its own values changes.
 */
import { memo, useMemo, type CSSProperties } from "react";
import type { ModuleSettings, SensorMap } from "@/modules/types";
import { BLANK_MODULE, type ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import type { WidgetItem } from "@/lib/infopanel/import/stored";
import { knownWidget, placementContent, placementPrefixes, widgetPlacement } from "@/components/studio/placement-content";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { IpTagCtx } from "@/widgets/core/primitives";

/** The one-cell grid a widget item's frame fills. */
const ONE_CELL = { cols: 1, rows: 1, gap: 0 } as unknown as ProfileView;
const FILL: CSSProperties = { display: "grid", gridTemplateColumns: "100%", gridTemplateRows: "100%", width: "100%", height: "100%" };

export interface WidgetItemViewProps {
  widget: WidgetItem;
  /** The item's name, the frame's title. */
  name: string;
  width: number;
  height: number;
  sensors: SensorMap;
  /** The theme the widget follows (profile, then page), as a grid zone's does. */
  appearance?: Appearance;
  /**
   * Tag its live values (`data-ip-key`) as a studio zone does, so an export's Recreate puts them back as InfoPanel
   * items over a picture of the rest. The editor and the export's offscreen drawing tag; the kiosk doesn't.
   */
  tag?: boolean;
}

/** Whether two sensor maps hold the same values under `prefixes` (null: every key). */
export function sameValues(a: SensorMap, b: SensorMap, prefixes: readonly string[] | null): boolean {
  if (a === b) return true;
  if (prefixes === null) return false;
  const mine = (k: string) => prefixes.some((p) => k === p || k.startsWith(p));
  for (const k of Object.keys(a)) if (mine(k) && a[k] !== b[k]) return false;
  for (const k of Object.keys(b)) if (mine(k) && !(k in a)) return false;
  return true;
}

function Body({ widget, name, sensors, appearance, tag = false }: WidgetItemViewProps) {
  const zone = useMemo(() => widgetPlacement({ ...widget, settings: widget.settings as ModuleSettings | undefined }), [widget]);
  // A blank zone a switch to Free kept (lib/page-layout.ts): open space, as on the grid.
  if (widget.module === BLANK_MODULE) return null;
  if (!knownWidget(widget.module)) {
    return (
      <div className="grid h-full w-full place-items-center rounded-lg border border-dashed border-[#55555e] bg-[#2a2a30]/70 p-2 text-center text-[11px] text-[#a1a1aa]">
        Widget not available in this version
      </div>
    );
  }
  const r = placementContent(zone, sensors, [], appearance);
  return (
    <div style={FILL}>
      <PlacementFrame placement={zone} profile={ONE_CELL} studio={false} hasData={r.hasData} title={name || r.title} scope={r.scope}>
        <IpTagCtx.Provider value={tag}>{r.content}</IpTagCtx.Provider>
      </PlacementFrame>
    </div>
  );
}

/** Memoised per item on its widget, box, theme and the values of its own keys (the plan's perf risk). */
export const WidgetItemView = memo(Body, (a, b) => {
  if (a.widget !== b.widget || a.tag !== b.tag || a.name !== b.name || a.width !== b.width || a.height !== b.height || a.appearance !== b.appearance) return false;
  return sameValues(a.sensors, b.sensors, placementPrefixes(widgetPlacement(a.widget)));
});
