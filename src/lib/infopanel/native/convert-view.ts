/**
 * Browser-only: a screen's native zones, as drawn on the studio canvas, converted to InfoPanel items. The page's
 * background is one picture under everything. Each zone is read where it is on the page (its box and its values'
 * boxes, once the fonts are ready) and goes by the choice for it:
 *  - recreate: a module is decomposed, its tagged values as native items over a picture of the rest (the values
 *    hidden, so the widget's look is kept and only its numbers move); a module with no tagged values falls back to
 *    its hand-written converter; a panel is rebuilt widget by widget;
 *  - snapshot: a picture of the zone as it is now;
 *  - leave out: nothing.
 * A canvas zone is already InfoPanel items: they are kept, scaled into the zone as it draws them. A widget that isn't
 * InfoPanel data is always left out. The result is the items, the picture files, and a report of what each widget
 * became.
 */
import { domToPng } from "modern-screenshot";
import { fetchForShot, keep } from "../../profile-shot.ts";
import { CANVAS_ID, PANEL_ID, type MonitorProfile, type Placement, type ProfilePage } from "../../layout.ts";
import { exportParts, type ExportPart } from "../../page-model/export-parts.ts";
import { fitScale, openCanvas, readStoreFile } from "../canvas.ts";
import { editItems } from "../canvas-edit.ts";
import { assetFile, type AssetFile } from "../assets/assets.ts";
import { moveBy } from "../editor/ops.ts";
import { safeStem } from "../gauges/frames.ts";
import { defaultPalette } from "../elements/palette.ts";
import { choiceFor, readChoices, rowsOf, type ExportRow } from "../export/native-choices.ts";
import { defaultItem, type DisplayItem } from "../schema.ts";
import type { DataApiValue } from "../sensors.ts";
import { cssToArgb, decompose, hideTagged } from "./decompose.ts";
import { make, type ConvertContext, type Look, type Note, type Rect } from "./items.ts";
import { CONVERTERS, type Converter } from "./modules/index.ts";
import { notCompatible, type NativeChoice } from "./tiers.ts";
import { panelToItems, type Measured } from "./to-infopanel.ts";

export interface ConvertRequest {
  placements: readonly Placement[];
  /** Where the zones are drawn (the studio canvas). */
  scope: ParentNode;
  sensors: Readonly<Record<string, DataApiValue>>;
  look: Look;
  titleOf: (moduleId: string) => string;
  /** Convert this zone only. */
  only?: string;
  /**
   * The stored page the zones are on (a whole screen's conversion): its item placements export as the items they are,
   * at their box, between the zones in the page's z-order (SPEC §11.4).
   */
  page?: { screen: Pick<MonitorProfile, "width" | "height" | "cols" | "rows" | "fit" | "gap" | "padding">; page: ProfilePage };
  /** Where a zone is drawn; default: its `data-zone-id` element in `scope` (a Free page's widget items have their own). */
  find?: (zoneId: string) => HTMLElement | null;
}

/** What one widget became. */
export interface ReportRow {
  name: string;
  /** What it was asked to be, or "not compatible" for a widget that isn't InfoPanel data. */
  choice: NativeChoice | "not-compatible";
  /** What was made, in words. */
  outcome: string;
  notes: string[];
}

export interface Converted {
  items: DisplayItem[];
  assets: AssetFile[];
  report: ReportRow[];
  /** The canvas the items fill, in design px: the grid the zones sit in, or the one zone when only that is converted. */
  size: { width: number; height: number };
}

/** A data URL's bytes. (Not `fetch`: the page's connect-src doesn't allow data: URLs.) */
const bytesOf = (dataUrl: string): Uint8Array => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0));

/** A picture of `el` at its design size (the studio zoom taken out); `hide` is told about each cloned node, `drop` leaves nodes out. */
async function picture(el: HTMLElement, size: { w: number; h: number }, hide?: (n: Node) => void, drop?: (n: Node) => boolean): Promise<Uint8Array> {
  const url = await domToPng(el, {
    width: Math.round(size.w),
    height: Math.round(size.h),
    scale: 1,
    style: { zoom: "1", margin: "0", outline: "none" },
    filter: drop ? (n) => keep(n) && !drop(n) : keep,
    fetchFn: fetchForShot,
    ...(hide ? { onCloneEachNode: hide } : {}),
  });
  return bytesOf(url);
}

const stem = (s: string, n: number) => `${safeStem(s) || "zone"}_${n}`;

/**
 * The page background's blurred layers (an image or gradient under a CSS blur) blurred for a picture, which leaves CSS
 * filters out: each layer is pictured on its own, blurred on a canvas and shown in its place, unfiltered, until the
 * returned `restore` puts the layer back as it was.
 */
export async function preBlur(page: HTMLElement): Promise<() => void> {
  const undo: (() => void)[] = [];
  for (const el of page.querySelectorAll<HTMLElement>("[data-page-background] > *")) {
    const px = Number(/blur\(([\d.]+)px\)/.exec(getComputedStyle(el).filter)?.[1] ?? 0);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // A video's frame is drawn over its own background, so it stays as the picture takes it (unblurred).
    if (!(px > 0) || w <= 0 || h <= 0 || el instanceof HTMLVideoElement) continue;
    const sharp = await createImageBitmap(new Blob([bytesOf(await domToPng(el, { width: w, height: h, scale: 1, style: { filter: "none", inset: "0", zoom: "1" }, fetchFn: fetchForShot })) as BlobPart], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) continue;
    g.filter = `blur(${px}px)`;
    g.drawImage(sharp, 0, 0);
    const before = el.getAttribute("style");
    // The layer's box is kept (its bleed past the page included); what it draws is the blurred picture.
    el.style.filter = "none";
    el.style.background = `url("${canvas.toDataURL("image/png")}") 0 0 / 100% 100% no-repeat`;
    undo.push(() => (before === null ? el.removeAttribute("style") : el.setAttribute("style", before)));
  }
  return () => {
    for (const u of undo) u();
  };
}

/**
 * Which items are the widget's backdrop: a live image over most of it (art under a scrim) where the picture of the
 * rest is see-through, so it goes under the picture and the scrim and text stay on top. Everything else goes over it.
 */
export async function backdrops(png: Uint8Array, items: readonly DisplayItem[], zone: Rect): Promise<boolean[]> {
  const art = items.map((it) => it.kind === "HttpImage" && it.Width * it.Height >= 0.8 * zone.w * zone.h);
  if (!art.some(Boolean) || typeof createImageBitmap !== "function") return art.map(() => false);
  const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return art.map(() => false);
  g.drawImage(bmp, 0, 0);
  return items.map((it, i) => {
    if (!art[i] || it.kind !== "HttpImage") return false;
    const x = Math.min(bmp.width - 1, Math.max(0, Math.round(it.X - zone.x + it.Width / 2)));
    const y = Math.min(bmp.height - 1, Math.max(0, Math.round(it.Y - zone.y + it.Height / 2)));
    return g.getImageData(x, y, 1, 1).data[3] < 230;
  });
}

/** A widget's surface as InfoPanel draws a card: its colour (`#AARRGGBB`) and corner radius; null when it is see-through. */
export function surfaceOf(zone: HTMLElement, zoom = 1): { color: string; radius: number } | null {
  const root = zone.querySelector<HTMLElement>("[data-wp-tier]");
  if (!root) return null;
  const style = getComputedStyle(root);
  const color = cssToArgb(style.backgroundColor);
  if (!/^#[0-9A-F]{8}$/.test(color) || color.startsWith("#00")) return null;
  return { color, radius: Math.round((parseFloat(style.borderTopLeftRadius) || 0) / zoom) };
}

/**
 * The page's own drawing: the zones, the item placements (they export as items) and the Dynamic Island (a dashboard
 * overlay InfoPanel has no item for) are left out.
 */
const notPage = (n: Node): boolean => n instanceof Element && n.matches("[data-zone-id], [data-items-layer], [data-island]");

/** The page a zone is drawn on (the studio's design-size page, else the grid it sits in). */
const pageOf = (el: HTMLElement): HTMLElement | null => el.closest<HTMLElement>("[data-studio-page]") ?? el.parentElement;

/** The zone's element on the page, its box on the page, the zoom the page is drawn at, and the page. */
function locate(
  scope: ParentNode,
  zoneId: string,
  find?: ConvertRequest["find"],
): { el: HTMLElement; box: Rect; zoom: number; page: HTMLElement; grid: { width: number; height: number } } | null {
  const el = find ? find(zoneId) : scope.querySelector<HTMLElement>(`[data-zone-id="${CSS.escape(zoneId)}"]`);
  const page = el ? pageOf(el) : null;
  if (!el || !page) return null;
  const g = page.getBoundingClientRect();
  const zoom = page.offsetWidth > 0 && g.width > 0 ? g.width / page.offsetWidth : 1;
  const r = el.getBoundingClientRect();
  return { el, zoom, page, grid: { width: page.offsetWidth, height: Math.max(page.scrollHeight, page.offsetHeight) }, box: { x: (r.left - g.left) / zoom, y: (r.top - g.top) / zoom, w: r.width / zoom, h: r.height / zoom } };
}

/** Items scaled by `s` about their canvas's corner and moved to `at`: positions, sizes and fonts; pictures and gauges by their Scale. */
export function scaleItems(items: readonly DisplayItem[], s: number, at: { x: number; y: number }): DisplayItem[] {
  return items.map((it) => {
    const o = it as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = { ...o, X: Math.round(at.x + Number(o.X ?? 0) * s), Y: Math.round(at.y + Number(o.Y ?? 0) * s) };
    if (it.kind === "Group") return { ...out, DisplayItems: scaleItems(it.DisplayItems, s, at) } as unknown as DisplayItem;
    if ("Scale" in o && typeof o.Scale === "number") out.Scale = Math.max(1, Math.round(o.Scale * s));
    else {
      for (const f of ["Width", "Height"] as const) if (typeof o[f] === "number" && (o[f] as number) > 0) out[f] = Math.max(1, Math.round((o[f] as number) * s));
    }
    if (typeof o.FontSize === "number") out.FontSize = Math.max(1, Math.round(o.FontSize * s));
    return out as unknown as DisplayItem;
  });
}

/** The widgets of a panel zone with the box each is drawn at, from the page (`.wp-widget[data-widget-id]`). */
function measureWidgets(el: HTMLElement, zone: Rect, zoom: number): Map<string, Measured & { el: HTMLElement }> {
  const origin = el.getBoundingClientRect();
  return new Map(
    [...el.querySelectorAll<HTMLElement>("[data-widget-id]")].map((w) => {
      const r = w.getBoundingClientRect();
      const style = getComputedStyle(w);
      const m = { x: zone.x + (r.left - origin.left) / zoom, y: zone.y + (r.top - origin.top) / zoom, w: r.width / zoom, h: r.height / zoom, fontSize: parseFloat(style.fontSize) || undefined, color: style.color, el: w };
      return [w.dataset.widgetId ?? "", m];
    }),
  );
}

/** An InfoPanel Group holding `kids` (bottom first), at their top-left corner, open in InfoPanel's tree. */
function groupItem(name: string, kids: DisplayItem[]): DisplayItem {
  const xs = kids.map((k) => Number((k as { X?: number }).X ?? 0));
  const ys = kids.map((k) => Number((k as { Y?: number }).Y ?? 0));
  return { ...defaultItem("Group"), Name: name, X: Math.min(...xs), Y: Math.min(...ys), IsExpanded: true, DisplayItems: kids } as DisplayItem;
}

export async function convertView(req: ConvertRequest): Promise<Converted> {
  await document.fonts?.ready;
  const palette = defaultPalette(req.look);
  const items: DisplayItem[] = [];
  const assets: AssetFile[] = [];
  const report: ReportRow[] = [];
  let n = 0;
  let grid = { width: 0, height: 0 };
  let only: Rect | undefined;

  const ctxFor = (notes: Note[]): ConvertContext => ({ look: req.look, palette, sensors: req.sensors, notes });
  const image = async (bytes: Uint8Array, name: string, box: Rect): Promise<DisplayItem> => {
    const file = await assetFile(`${stem(name, ++n)}.png`, bytes, "added");
    assets.push(file);
    return make("Image", ctxFor([]), box, name, { Type: "FILE", FilePath: file.name, RelativePath: true });
  };

  // The page's background, once, under every zone (a screen only: a zone alone keeps its own card).
  if (!req.only) {
    const first = req.placements.map((p) => locate(req.scope, p.id, req.find)).find((s) => s !== null);
    if (first) {
      const size = { w: first.grid.width, h: first.grid.height };
      const restore = await preBlur(first.page);
      try {
        items.push(await image(await picture(first.page, size, undefined, notPage), "Page background", { x: 0, y: 0, ...size }));
      } finally {
        restore();
      }
    }
  }

  // The page's item placements' files, read once for every run of them.
  const itemFiles = new Set<string>();
  const parts: ExportPart[] = req.page && !req.only ? exportParts(req.page.screen, req.page.page, req.placements) : req.placements.map((zone) => ({ zone }));
  // Each part bottom first into `items`; a page group's into an InfoPanel Group named after it, in its place.
  const convertParts = async (list: readonly ExportPart[], items: DisplayItem[]): Promise<void> => {
    for (const part of list) {
      if ("group" in part) {
        const kids: DisplayItem[] = [];
        await convertParts(part.group.parts, kids);
        if (kids.length > 0) items.push(groupItem(part.group.name, kids));
        continue;
      }
      // A run of item placements: InfoPanel items already, at their screen px, kept as they are.
      if ("items" in part) {
        const open = openCanvas(part.items);
        for (const a of open.stored.assets) {
          if (itemFiles.has(a.name.toLowerCase())) continue;
          itemFiles.add(a.name.toLowerCase());
          const bytes = await readStoreFile(a.hash, a.ext, a.type);
          if (bytes) assets.push(await assetFile(a.name, bytes, "added"));
        }
        const made = editItems(open);
        items.push(...made);
        report.push({ name: `${made.length} InfoPanel item${made.length === 1 ? "" : "s"}`, choice: "recreate", outcome: "kept: they are InfoPanel items", notes: [] });
        continue;
      }
      const p = part.zone;
      if (req.only && p.id !== req.only) continue;
      // A canvas zone is InfoPanel items already: kept, scaled into the zone and centred as the zone draws them.
      if (p.module === CANVAS_ID && p.canvas && p.visible) {
        const spot = locate(req.scope, p.id, req.find);
        if (!spot) continue;
        grid = spot.grid;
        if (req.only) only = spot.box;
        const open = openCanvas(p.canvas);
        const s = fitScale(open.profile, spot.box.w, spot.box.h);
        const at = { x: spot.box.x + (spot.box.w - open.profile.Width * s) / 2, y: spot.box.y + (spot.box.h - open.profile.Height * s) / 2 };
        for (const a of open.stored.assets) {
          const bytes = await readStoreFile(a.hash, a.ext, a.type);
          if (bytes) assets.push(await assetFile(a.name, bytes, "added"));
        }
        items.push(...scaleItems(editItems(open), s, at));
        report.push({ name: open.stored.source.name || "InfoPanel canvas", choice: "recreate", outcome: "kept: it is InfoPanel items", notes: s === 1 ? [] : [`scaled ${Math.round(s * 100)}% to fill its zone`] });
        continue;
      }
      const rows = rowsOf(p, req.titleOf);
      if (rows.length === 0) continue;
      const stored = readChoices(p.settings);
      const spot = locate(req.scope, p.id, req.find);
      const row0 = rows[0];
      if (spot) {
        grid = spot.grid;
        if (req.only) only = spot.box;
      }

      // A module that isn't InfoPanel data (pictured only when a snapshot of it is picked), or a zone that isn't on the page to read.
      if (row0.entry.tier === "native-only" && (choiceFor(row0, stored) !== "snapshot" || !spot)) {
        report.push({ name: row0.name, choice: "not-compatible", outcome: notCompatible(row0.name), notes: [] });
        continue;
      }
      if (!spot) {
        for (const r of rows) report.push({ name: r.name, choice: "leave", outcome: "left out: it isn't on this page", notes: [] });
        continue;
      }

      if (p.module === PANEL_ID || p.panel) {
        const notes: Note[] = [];
        const widgets = measureWidgets(spot.el, spot.box, spot.zoom);
        const kept: DisplayItem[] = [];
        const recreate = rows.filter((r) => choiceFor(r, stored) === "recreate");
        for (const r of rows) {
          const choice = choiceFor(r, stored);
          const m = widgets.get(r.key);
          if (choice === "snapshot" && m) kept.push(await image(await picture(m.el, m, undefined), r.name, m));
          report.push({ name: r.name, choice, outcome: choice === "recreate" ? "rebuilt from InfoPanel items" : choice === "snapshot" ? (m ? "a picture of it now" : "left out: it isn't drawn") : "left out", notes: [] });
        }
        if (recreate.length > 0 && p.panel) {
          const only = { ...p.panel, widgets: p.panel.widgets.filter((w) => recreate.some((r) => r.key === w.id)) };
          kept.push(panelToItems(only, spot.box, widgets, ctxFor(notes)));
        }
        for (const note of notes) report.find((r) => r.name === note.name || note.name.startsWith(r.name))?.notes.push(note.text);
        items.push(...kept);
        continue;
      }

      const choice = choiceFor(row0, stored);
      const done = (outcome: string, notes: string[] = []) => report.push({ name: row0.name, choice, outcome, notes });
      if (choice === "leave") {
        done("left out");
        continue;
      }
      const snapshot = async (why?: string) => {
        items.push(await image(await picture(spot.el, spot.box), row0.name, spot.box));
        done("a picture of it now", why ? [why] : []);
      };
      if (choice === "snapshot") {
        await snapshot();
        continue;
      }
      const notes: Note[] = [];
      const ctx = ctxFor(notes);
      // The widget as drawn, its values hidden, with each value a native item at its place.
      const tagged = decompose(spot.el, spot.box, ctx, spot.zoom);
      if (tagged.length > 0) {
        const bytes = await picture(spot.el, spot.box, hideTagged);
        const chrome = await image(bytes, `${row0.name} background`, spot.box);
        const under = await backdrops(bytes, tagged, spot.box);
        const kids = [...tagged.filter((_, i) => under[i]), chrome, ...tagged.filter((_, i) => !under[i])];
        items.push({ ...defaultItem("Group"), Name: row0.name, X: Math.round(spot.box.x), Y: Math.round(spot.box.y), DisplayItems: kids } as DisplayItem);
        done("values rebuilt over a picture of the rest", [...new Set(notes.map((x) => x.text))]);
        continue;
      }
      const converter: Converter | undefined = CONVERTERS[p.module];
      const made = converter ? converter(spot.box, ctx, p.settings ?? {}) : [];
      if (made.length === 0) {
        await snapshot(p.module in CONVERTERS ? "its readings aren't on this PC, so a picture of it now" : "its values aren't readable yet, so a picture of it now");
        continue;
      }
      // The widget's own surface behind its items, as drawn (none where it is see-through).
      const card = surfaceOf(spot.el, spot.zoom);
      items.push(...(card ? [make("Shape", ctx, spot.box, `${row0.name} card`, { FillColor: card.color, CornerRadius: card.radius, ShowFrame: false, ShowGradient: false })] : []), ...made);
      done("rebuilt from InfoPanel items", notes.map((x) => x.text));
    }
  };
  await convertParts(parts, items);
  // One zone alone becomes a canvas of its own size, its items moved to the corner.
  if (only) {
    const moved = moveBy(items, items.map((_, i) => String(i)), -only.x, -only.y);
    return { items: moved, assets, report, size: { width: Math.max(1, Math.round(only.w)), height: Math.max(1, Math.round(only.h)) } };
  }
  // A page of only items has no zone to measure the page by: it is the screen's size.
  if (grid.width <= 0 && req.page) grid = { width: req.page.screen.width, height: req.page.screen.height };
  return { items, assets, report, size: { width: Math.max(1, grid.width), height: Math.max(1, grid.height) } };
}

export type { ExportRow };
