/**
 * A Free page's Studio widgets in an `.infopanel` export (one-editor SPEC §7.4). Each widget item goes by its
 * `onInfoPanel` rule, through the same conversion a grid zone takes (`convertView`), read from where the editor draws
 * it (`[data-widget-item]`):
 *  - recreate: its values as InfoPanel items over a picture of the rest (or its converter's items, a panel widget by
 *    widget), spliced in at the item's place in the z-order as a Group named after the widget;
 *  - snapshot: a picture of it as it is now, one Image;
 *  - leave out (or a widget this build doesn't have, or one that isn't drawn): nothing.
 * The rest of the items and files are untouched, so a profile without widgets writes the same bytes as before.
 */
import type { Doc } from "../assets/assets.ts";
import { itemAt, moveBy } from "../editor/ops.ts";
import { IP_EXPORT_KEY } from "../export/native-choices.ts";
import type { DisplayItem } from "../schema.ts";
import type { DataApiValue } from "../sensors.ts";
import { convertView } from "./convert-view.ts";
import type { Look } from "./items.ts";
import type { NativeChoice } from "./tiers.ts";
import { joinFiles, placeConverted, replaceWidgets, widgetOf, widgetPaths, widgetRule, WIDGET_PANEL, type WidgetItem } from "./widget-item.ts";
import type { Placement } from "../../layout.ts";

export interface WidgetReport {
  name: string;
  rule: NativeChoice;
  /** What was made, in words. */
  outcome: string;
}

export interface WidgetExportRequest {
  /** Where the editor draws the canvas (its widget items carry `data-widget-item`); null when it isn't open. */
  root: ParentNode | null;
  sensors: Readonly<Record<string, DataApiValue>>;
  look: Look;
  /** A widget's zone as it renders (placement-content's `widgetPlacement`), and whether this build has it. */
  zoneOf: (widget: WidgetItem, id: string) => Placement;
  known: (module: string) => boolean;
}

/** The zone with the widget's rule as the conversion's stored choice (`ipExport`): the zone's, or every panel widget's. */
export function withRule(zone: Placement, rule: NativeChoice): Placement {
  const keys = zone.module === WIDGET_PANEL ? (zone.panel?.widgets ?? []).map((w) => w.id) : ["zone"];
  return { ...zone, settings: { ...zone.settings, [IP_EXPORT_KEY]: JSON.stringify(Object.fromEntries(keys.map((k) => [k, rule]))) } };
}

/** The document with its widget items converted by their rules (browser-only: it reads and pictures the DOM). */
export async function exportWidgets(doc: Doc, req: WidgetExportRequest): Promise<{ doc: Doc; report: WidgetReport[] }> {
  const paths = widgetPaths(doc.items);
  if (paths.length === 0) return { doc, report: [] };
  const made = new Map<string, DisplayItem[]>();
  const report: WidgetReport[] = [];
  let assets = doc.assets;
  for (const path of paths) {
    const host = itemAt(doc.items, path)!;
    const widget = widgetOf(host)!;
    const rule = widgetRule(widget);
    const name = host.Name || widget.module;
    if (!req.known(widget.module)) {
      report.push({ name, rule: "leave", outcome: "left out: not available in this version" });
      continue;
    }
    if (rule === "leave") {
      report.push({ name, rule, outcome: "left out" });
      continue;
    }
    const el = req.root?.querySelector<HTMLElement>(`[data-widget-item="${CSS.escape(path)}"]`) ?? null;
    if (!req.root || !el) {
      report.push({ name, rule, outcome: "left out: it isn't drawn" });
      continue;
    }
    const zone = withRule(req.zoneOf(widget, `widget:${path}`), rule);
    const out = await convertView({ placements: [zone], scope: req.root, sensors: req.sensors, look: req.look, titleOf: () => name, only: zone.id, find: () => el });
    const placed = moveBy(out.items, out.items.map((_, i) => String(i)), host.X, host.Y);
    const joined = joinFiles(assets, out.assets, placed);
    assets = joined.assets;
    made.set(path, placeConverted(joined.items, host, rule));
    for (const r of out.report) report.push({ name: r.name, rule, outcome: r.outcome });
  }
  return { doc: { items: replaceWidgets(doc.items, (_, p) => made.get(p) ?? []), assets }, report };
}
