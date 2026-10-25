import { newProfile, type MonitorProfile } from "@/lib/layout";
import { sampleLayout } from "@/lib/sample-layout";

/** A new screen made from the sample layout (the reference kiosk strip: rings, clock, weather, readouts). */
export function sampleScreen(name: string): MonitorProfile {
  const template = sampleLayout();
  const base = newProfile(name, 1920, 550);
  return {
    ...base,
    cols: template.cols,
    rows: template.rows,
    fit: "fill",
    pages: base.pages.map((page) => ({ ...page, placements: template.placements })),
  };
}
