/**
 * What a library item does in the studio (spec §3 detail pane, §8 drops): the primary action by
 * kind and the secondary ones. Placing copies the item into the profile in one `setConfig` (one
 * undo step) and counts the copy on the library item.
 */
import type { HistorySetter } from "@/hooks/use-config-history";
import { withBackground, type PageBackground } from "@/lib/appearance";
import type { DashboardConfig, Placement, ProfileView, StylePreset } from "@/lib/layout";
import type { LibraryCopy, LibraryItem } from "@/lib/library";
import { getLibraryItem } from "@/lib/library";
import type { PanelDef, UserPanelPreset } from "@/lib/panel-model";
import { userPanelPreset, type PanelPreset } from "@/lib/panelPresets";
import { fileUrl, metaOf } from "@/lib/my-library/model";
import type { ModuleSettings } from "@/modules/types";
import * as studio from "@/components/studio/studio-actions";
import type { ZoneRect } from "@/components/studio/zone-geometry";

/** A fresh id with a prefix. */
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** An image as a panel zone of one image widget filling it (the dashboard has no bare image zone). */
export function imagePanel(name: string, src: string, size: { width?: number; height?: number }, grid: { cols: number; rows: number; width: number; height: number }): PanelPreset {
  // The zone's footprint keeps the picture's shape, at most half the grid.
  const cell = { w: grid.width / Math.max(1, grid.cols), h: grid.height / Math.max(1, grid.rows) };
  const aspect = size.width && size.height ? size.width / size.height : 16 / 10;
  const rows = Math.max(1, Math.min(Math.ceil(grid.rows / 2), 2));
  const cols = Math.max(1, Math.min(grid.cols, Math.round((rows * cell.h * aspect) / cell.w) || 1));
  const panel: PanelDef = {
    id: uid("panel"),
    title: name,
    titleVisible: false,
    visible: true,
    background: "none",
    layout: "stack",
    direction: "column",
    align: "stretch",
    padding: 0,
    widgets: [{ id: uid("w"), kind: "image", visible: true, text: src, box: { w: "fill", h: "fill" } }],
  };
  return { id: uid("image"), title: name, colSpan: cols, rowSpan: rows, make: () => structuredClone(panel) };
}

export interface StudioBridge {
  config: DashboardConfig;
  /** The profile on the canvas (its page) and the stored profile behind it. */
  profile: ProfileView;
  profileId: string;
  setConfig: HistorySetter;
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  /** The zones selected on the canvas (a style applies to them). */
  selection: Placement[];
  select: (id: string) => void;
  toast: (message: string) => void;
  addCopy: (item: LibraryItem, copy: LibraryCopy) => void;
}

const copyHere = (b: StudioBridge, label: string, zoneId?: string): LibraryCopy => ({
  profileId: b.profileId,
  ...(b.profile.pageId ? { pageId: b.profile.pageId } : {}),
  ...(zoneId ? { zoneId } : {}),
  label,
});

/** An item's full data (a large one is left out of the list). */
export async function dataOf<D>(item: LibraryItem): Promise<D | undefined> {
  if (item.data !== undefined) return item.data as D;
  return item.dataSize ? (await getLibraryItem<D>(item.id)).data : undefined;
}

/** Set an image or video as the page background of the profile on the canvas. */
export function setAsBackground(b: StudioBridge, item: LibraryItem): void {
  const src = fileUrl(item);
  if (!src || (item.kind !== "image" && item.kind !== "video")) return;
  const current = b.config.profiles.find((p) => p.id === b.profileId)?.background;
  const bg: PageBackground = {
    ...(current && (current.type === "image" || current.type === "video") ? current : { fit: "cover" }),
    type: item.kind,
    src,
  };
  b.setConfig((c) => withBackground(c, { kind: "profile", profileId: b.profileId }, bg));
  // The background is the profile's, on every page.
  b.addCopy(item, { profileId: b.profileId, label: "Background" });
  b.toast(`${item.name} is the background`);
}

/** Place a panel preset in the first free spot of the page, select it. */
function placePreset(b: StudioBridge, item: LibraryItem, preset: PanelPreset, rect?: ZoneRect): string | null {
  const id = uid("panel");
  let placed = false;
  b.updateProfile((p) => {
    const next = rect ? studio.addPresetAt(p, id, preset, rect) : studio.addPresetPlacement(p, id, preset);
    placed = next.placements.some((z) => z.id === id);
    return next;
  });
  if (!placed) {
    b.toast("No free space: resize or remove a widget first");
    return null;
  }
  b.select(id);
  b.addCopy(item, copyHere(b, preset.title, id));
  b.toast(`Added ${preset.title}`);
  return id;
}

/** A library item as a panel preset: a saved panel, or an image widget; null for other kinds. */
export async function presetOf(item: LibraryItem, grid: { cols: number; rows: number; width: number; height: number }): Promise<PanelPreset | null> {
  if (item.kind === "panel") {
    const data = await dataOf<UserPanelPreset>(item);
    return data?.panel ? userPanelPreset({ ...data, name: item.name }) : null;
  }
  if (item.kind === "image" || item.kind === "svg") {
    const src = fileUrl(item);
    return src ? imagePanel(item.name, src, metaOf(item), grid) : null;
  }
  return null;
}

/** "Add to canvas" / "Add to profile": a panel or an image becomes a zone in the first free spot. */
export async function addToProfile(b: StudioBridge, item: LibraryItem, rect?: ZoneRect): Promise<void> {
  const preset = await presetOf(item, { cols: b.profile.cols, rows: b.profile.rows, width: b.profile.width, height: b.profile.height });
  if (!preset) return b.toast("This item can’t be placed on the page");
  placePreset(b, item, preset, rect);
}

/** A style preset onto the selected zones (or `zoneIds`), one undo step. */
export async function applyStyle(b: StudioBridge, item: LibraryItem, zoneIds?: string[]): Promise<void> {
  const ids = zoneIds ?? b.selection.map((z) => z.id);
  if (ids.length === 0) return b.toast("Select a widget first");
  const data = await dataOf<StylePreset | { settings: ModuleSettings }>(item);
  if (!data?.settings) return b.toast("This style has no settings");
  b.updateProfile((p) => studio.pasteStyleToZones(p, ids, data.settings));
  ids.forEach((id) => b.addCopy(item, copyHere(b, `${item.name} style`, id)));
  b.toast(`Applied ${item.name} to ${ids.length === 1 ? "the widget" : `${ids.length} widgets`}`);
}
