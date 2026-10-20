import type { MonitorProfile } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { sampleLayout } from "@/lib/sample-layout";

/** Test fixture: the sample layout as the 1920×550 profile earlier versions shipped it as. */
export function sampleProfile(): MonitorProfile {
  const t = sampleLayout();
  return { id: "sample-1920x1080", name: t.name, width: 1920, height: 550, cols: t.cols, rows: t.rows, fit: "fill", pages: [mainPage(t.placements)] };
}
