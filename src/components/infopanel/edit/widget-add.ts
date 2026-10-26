/**
 * Studio widgets on a Free page (one-editor SPEC §3.3, §5.3): the widget record an Add panel row makes, the zone the
 * studio's widget inspector edits and the record it writes back, and the toast an add shows on a screen made for
 * InfoPanel. Pure, so the add and the inspector's round trip are tested without a canvas.
 */
import { PANEL_ID, type Placement, type UserPanelPreset } from "@/lib/layout";
import { findPanelPreset } from "@/lib/panelPresets";
import type { WidgetItem } from "@/lib/infopanel/import/stored";
import { widgetItemRow } from "@/lib/infopanel/export-check";
import { newWidgetItem, widgetRule } from "@/lib/infopanel/native/widget-item";
import { withPreset } from "@/components/studio/studio-actions";
import { widgetPlacement } from "@/components/studio/placement-content";
import type { AddItem } from "@/components/studio/add-catalog";

/** A zone's widget, as a widget item stores it: module, settings, look, follow flags and panel (no cells). */
export function widgetFromZone(p: Placement, onInfoPanel?: WidgetItem["onInfoPanel"]): WidgetItem {
  return {
    module: p.module,
    ...(p.settings && Object.keys(p.settings).length ? { settings: { ...p.settings } } : {}),
    ...(p.design && Object.keys(p.design).length ? { design: { ...p.design } } : {}),
    ...(p.follow && Object.keys(p.follow).length ? { follow: { ...p.follow } as Record<string, boolean> } : {}),
    ...(p.panel ? { panel: p.panel as unknown as Record<string, unknown> } : {}),
    ...(onInfoPanel ? { onInfoPanel } : {}),
  };
}

/** The zone a widget item's widget is edited as (the inspector's), its id the item's path. */
export const zoneOfWidget = (widget: WidgetItem, path: string): Placement => widgetPlacement(widget, `widget:${path}`);

/** A row of the Add panel as a widget record: a widget (with the settings its view adds), or a panel preset. Null for a layout or a missing preset. */
export function widgetRecordFor(item: AddItem, saved?: UserPanelPreset[]): WidgetItem | null {
  if (item.kind === "layout") return null;
  if (item.drop.kind === "panel") {
    const preset = findPanelPreset(item.drop.id, saved);
    return preset ? widgetFromZone(withPreset(widgetPlacement({ module: PANEL_ID }), preset)) : null;
  }
  return { module: item.drop.id, ...(item.drop.settings ? { settings: { ...item.drop.settings } } : {}) };
}

/** The toast after adding a widget to a screen made for InfoPanel (§5.3): what an export makes of it. */
export function addedMessage(name: string, widget: WidgetItem): string {
  const row = widgetItemRow(newWidgetItem(widget, { x: 0, y: 0, w: 1, h: 1 }, name), "0");
  const rule = widgetRule(widget);
  const fate =
    row?.status === "out"
      ? "is left out"
      : row?.status === "ok"
        ? widget.module === PANEL_ID
          ? "exports as InfoPanel items"
          : "exports as an InfoPanel item"
        : rule === "snapshot"
          ? "becomes a still picture"
          : "becomes a picture with its live values on top";
  return `${name} added. On InfoPanel export it ${fate}.`;
}
