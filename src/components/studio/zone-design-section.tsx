import type { PlacementDesign } from "@/lib/layout";
import { ColorRow, SegmentedRow, ToggleRow } from "./setting-rows";

interface ZoneFrameFieldsProps {
  design: PlacementDesign | undefined;
  onChange: (fn: (design: PlacementDesign | undefined) => PlacementDesign) => void;
  /** Offer the frame background (hidden for panels, which have their own card). */
  showBackground?: boolean;
}

/** Search text for the zone frame rows. */
export const ZONE_FRAME_TERMS = [
  "Widget frame",
  "Frame accent",
  "Frame background",
  "Frame title header",
];

/** How many frame options are set (the changed count of the card they sit in). */
export function zoneFrameSet(design: PlacementDesign | undefined, showBackground = true): number {
  return [
    design?.accent,
    showBackground && design?.background && design.background !== "none",
    design?.header,
  ].filter(Boolean).length;
}

/**
 * The zone's own frame around the widget: accent override, background and
 * title header (`placement.design`). Rows for a section (Border & effects,
 * or a blank zone's Zone frame).
 */
export function ZoneFrameFields({ design, onChange, showBackground = true }: ZoneFrameFieldsProps) {
  return (
    <>
      <ColorRow
        label="Frame accent"
        value={design?.accent ?? ""}
        onChange={(accent) => onChange((d) => ({ ...d, accent: accent || undefined }))}
        onReset={() => onChange((d) => ({ ...d, accent: undefined }))}
      />
      {showBackground && (
        <SegmentedRow
          label="Frame background"
          options={[
            { value: "none", label: "None" },
            { value: "panel", label: "Panel" },
            { value: "bordered", label: "Bordered" },
          ]}
          value={design?.background ?? "none"}
          onChange={(v) => onChange((d) => ({ ...d, background: v as PlacementDesign["background"] }))}
        />
      )}
      <ToggleRow
        label="Frame title header"
        value={Boolean(design?.header)}
        onChange={() => onChange((d) => ({ ...d, header: !d?.header }))}
      />
    </>
  );
}
