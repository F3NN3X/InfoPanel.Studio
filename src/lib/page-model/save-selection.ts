/**
 * Save to Library on a screen's page (decision Q10): the selected parts and groups cut out as a component, the same
 * Library item an imported profile's page saves (`infopanel/component.ts`). The selection is first laid out as stored
 * items on a canvas the screen's size, at the pixels the page draws them, bottom first: an item placement is its item at
 * its box, a widget an Image hosting it (`$.widget`) at its cells' box with its module, settings and look, a group a
 * Group item of its members with its name. Hidden and locked parts stay so. `saveComponent` then re-bases them to their
 * bounds and keeps only the files they use, the palette and the roles of their sensors.
 *
 * Placing one back on a screen's page turns its widget items into widgets on the nearest free cells again
 * (`page-model/migrate.ts`); in an imported profile they stay widget items.
 */
import type { MonitorProfile, Placement, ProfilePage } from "../layout.ts";
import { saveComponent, type SavedComponent } from "../infopanel/component.ts";
import { openCanvas } from "../infopanel/canvas.ts";
import { editItems } from "../infopanel/canvas-edit.ts";
import type { Box } from "../infopanel/editor/ops.ts";
import { encodeItem, newStored, type StoredCanvas, type StoredItem, type WidgetItem } from "../infopanel/import/stored.ts";
import { newWidgetItem } from "../infopanel/native/widget-item.ts";
import { defaultItem, type DisplayItem } from "../infopanel/schema.ts";
import { widgetOfZone } from "../page-layout.ts";
import { unionBox } from "./layer-actions.ts";
import { boxOf, type GroupNode, type LayerNode, type PageModel, type PartNode } from "./model.ts";
import { atBox, obj } from "./stored-items.ts";

/** The selected nodes with none inside another, bottom first (the order a canvas draws them in). */
function picked(nodes: readonly LayerNode[], ids: ReadonlySet<string>): LayerNode[] {
  return [...nodes].reverse().flatMap((n) => (ids.has(n.id) ? [n] : n.type === "group" ? picked(n.children, ids) : []));
}

/** Hidden and locked as InfoPanel fields, set where they are on or the item had them. */
function flags(item: StoredItem, node: LayerNode): StoredItem {
  const hidden = node.hidden === true;
  const locked = node.locked === true;
  return { ...item, ...(hidden || item.Hidden !== undefined ? { Hidden: hidden } : {}), ...(locked || item.IsLocked !== undefined ? { IsLocked: locked } : {}) };
}

/** A widget's record for a component: no zone id, as every copy placed gets its own. */
function widgetRecord(p: Placement): WidgetItem {
  const { id: _id, ...widget } = widgetOfZone(p);
  return widget;
}

function partItem(model: PageModel, part: PartNode, nameOf: (p: Placement) => string): StoredItem | null {
  if (part.ref.backing !== "placement") return null;
  const p = part.ref.placement;
  const box = boxOf(model.grid, part.place);
  if (part.kind === "widget") {
    const host = newWidgetItem(widgetRecord(p), box, p.name || nameOf(p));
    return flags(encodeItem(host, () => null), part);
  }
  return p.item ? flags(atBox(p.item, box), part) : null;
}

function groupItem(model: PageModel, group: GroupNode, nameOf: (p: Placement) => string): StoredItem {
  // A group the v15 migration made from an InfoPanel Group keeps that item's own fields.
  const from = group.ref?.backing === "group" ? obj(group.ref.group.from?.item) : null;
  const base = from?.kind === "Group" ? (from as StoredItem) : encodeItem({ ...defaultItem("Group"), IsExpanded: false } as DisplayItem, () => null);
  const box = unionBox(model, group);
  const kids = picked(group.children, new Set(group.children.map((c) => c.id))).flatMap((n) => itemOf(model, n, nameOf) ?? []);
  return flags({ ...base, Name: group.name, ...(box ? { X: Math.round(box.x), Y: Math.round(box.y) } : {}), DisplayItems: kids }, group);
}

const itemOf = (model: PageModel, node: LayerNode, nameOf: (p: Placement) => string): StoredItem | null =>
  node.type === "group" ? groupItem(model, node, nameOf) : partItem(model, node, nameOf);

export interface SelectionInput {
  profile: Pick<MonitorProfile, "width" | "height">;
  page: ProfilePage;
  model: PageModel;
  /** The selected nodes' ids (parts and groups, any depth). */
  selection: readonly string[];
  name: string;
  /** A widget's name where it has none of its own (the studio's widget names). */
  nameOf?: (p: Placement) => string;
  now?: Date;
}

/** The selection on a canvas the screen's size, with the page's files, fonts and palette; the box of each top item by path. */
export function selectionCanvas(input: SelectionInput): { stored: StoredCanvas; boxes: Record<string, Box> } | null {
  const { model, page } = input;
  const nameOf = input.nameOf ?? ((p: Placement) => p.module);
  const nodes = picked(model.root, new Set(input.selection));
  const items = nodes.flatMap((n) => itemOf(model, n, nameOf) ?? []);
  if (items.length === 0) return null;
  const boxes: Record<string, Box> = {};
  nodes.forEach((n, i) => {
    const b = unionBox(model, n);
    if (b) boxes[String(i)] = { x: b.x, y: b.y, width: b.w, height: b.h };
  });
  const base = page.freeCanvas ?? newStored({ name: page.name, width: input.profile.width, height: input.profile.height, now: input.now });
  // See-through: a selection has no background of its own, so placing it on a screen's page draws none.
  const stored = { ...base, profile: { ...base.profile, Width: input.profile.width, Height: input.profile.height, BackgroundColor: "#00000000" }, items } as StoredCanvas;
  return { stored, boxes };
}

/** The selection saved as a component (the Library's canvas item with `component: true`); null when nothing is selected. */
export function saveSelection(input: SelectionInput): SavedComponent | null {
  const made = selectionCanvas(input);
  if (!made) return null;
  const open = openCanvas(made.stored);
  const items = editItems(open);
  return saveComponent({
    stored: open.stored,
    profile: open.profile,
    items,
    selection: items.map((_, i) => String(i)),
    boxes: made.boxes,
    name: input.name,
    palette: open.stored.palette,
    now: input.now,
  });
}
