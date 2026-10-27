/**
 * An InfoPanel item or element from Add on a screen's page (Edit v3 SPEC §7.4, DECISIONS after phase 3): a new item as
 * the palette makes it, stored in the page's form (`Placement.item`, the page's `freeCanvas` keeping files and fonts),
 * at its place: snapped to the cells nearest its box, or placed freely to the pixel. Loaded when the first one is
 * added, so the item model stays out of the studio's first bundle. The details card draws the same new item.
 */
import { bindItem, storeItems } from "@/lib/infopanel/canvas-edit";
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import { namedFor, newItem, PALETTE, roughSize } from "@/lib/infopanel/editor/create";
import { ELEMENTS } from "@/lib/infopanel/elements/entries";
import { isComposite, newComposite, newCores, newElement } from "@/lib/infopanel/elements/create";
import { defaultPalette } from "@/lib/infopanel/elements/palette";
import { newStored, readStored, type StoredCanvas, type StoredItem } from "@/lib/infopanel/import/stored";
import type { DisplayItem, Profile } from "@/lib/infopanel/schema";
import type { ProfilePage } from "@/lib/layout";
import { withoutItems } from "@/lib/page-model/stored-items";

/** What a palette drag id (`PALETTE_DRAG`) adds, and whether it asks for a sensor next. */
export interface NewPart {
  label: string;
  sensor: boolean;
  pluginOnly: boolean;
}

/** The entry behind a palette drag id: an item kind, or `element:{type}`. */
export function partOf(data: string): NewPart | null {
  const item = PALETTE.find((p) => p.kind === data);
  if (item) return { label: item.label, sensor: item.sensor, pluginOnly: item.pluginOnly === true };
  const element = ELEMENTS.find((e) => `element:${e.type}` === data);
  return element ? { label: element.label, sensor: element.sensor, pluginOnly: false } : null;
}

/** The new item for a palette drag id in a profile's look, at 0, 0 (a group element laid out from there); null for an unknown id. */
export function newPartItem(data: string, profile: Profile): DisplayItem | null {
  const palette = defaultPalette(profile);
  const item = PALETTE.find((p) => p.kind === data);
  if (item) return newItem(item.kind, profile, palette);
  const type = ELEMENTS.find((e) => `element:${e.type}` === data)?.type;
  if (!type) return null;
  if (type === "cores") return newCores(profile, palette, [], 0, 0);
  return isComposite(type) ? newComposite(type, profile, palette, [], 0, 0) : newElement(type, profile, palette);
}

/** The page's stored side (files, fonts, InfoPanel profile), or a new one the screen's size. */
function pageStore(page: ProfilePage, size: { width: number; height: number }): StoredCanvas {
  const base = page.freeCanvas ? { ...page.freeCanvas, items: [] } : newStored({ name: page.name, ...size });
  return base as StoredCanvas;
}

/** An item's rough box at 0, 0 (a group's: its parts' union), in px. */
export function partSize(item: DisplayItem, profile: Profile): { w: number; h: number } {
  if (item.kind === "Group") {
    const kids = item.DisplayItems.map((k) => ({ x: Number(k.X) || 0, y: Number(k.Y) || 0, ...partSize(k, profile) }));
    if (kids.length === 0) return { w: 1, h: 1 };
    return { w: Math.max(...kids.map((k) => k.x + k.w)), h: Math.max(...kids.map((k) => k.y + k.h)) };
  }
  const { width, height } = roughSize(item, profile.FontScale);
  return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
}

/**
 * A new item for the page: stored as the page keeps item placements (its fonts joined into the page's store), and its
 * rough size. Null for an unknown drag id.
 */
export function newPagePart(data: string, page: ProfilePage, size: { width: number; height: number }): { item: StoredItem; store: ProfilePage["freeCanvas"]; w: number; h: number } | null {
  const base = pageStore(page, size);
  const { profile } = readStored(base);
  const item = newPartItem(data, profile);
  if (!item) return null;
  const stored = storeItems(base, profile, [item]);
  // The page's fonts stay; the new item's join them.
  const known = new Set(base.fonts.map((f) => JSON.stringify(f.request)));
  const fonts = [...base.fonts, ...stored.fonts.filter((f) => !known.has(JSON.stringify(f.request)))];
  return { item: stored.items[0], store: { ...withoutItems(stored), fonts }, ...partSize(item, profile) };
}

/** A new page part's stored item bound to a sensor and named after it, as InfoPanel names a new sensor item. */
export function boundPagePart(page: ProfilePage, stored: StoredItem, sensor: ChosenSensor, size: { width: number; height: number }): StoredItem {
  const base = pageStore(page, size);
  const opened = readStored({ ...base, items: [stored] });
  return storeItems(base, opened.profile, [bindItem(namedFor(opened.items[0], sensor), sensor)]).items[0];
}
