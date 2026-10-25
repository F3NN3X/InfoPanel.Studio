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
import { CANVAS_ID, PANEL_ID, type Placement } from "../../layout.ts";
import { fitScale, openCanvas, readStoreFile } from "../canvas.ts";
import { editItems } from "../canvas-edit.ts";
import { assetFile, type AssetFile } from "../assets/assets.ts";
import { moveBy } from "../editor/ops.ts";
import { safeStem } from "../gauges/frames.ts";
import { defaultPalette } from "../elements/palette.ts";
import { choiceFor, readChoices, rowsOf, type ExportRow } from "../export/native-choices.ts";
import { defaultItem, type DisplayItem } from "../schema.ts";
import type { DataApiValue } from "../sensors.ts";
import { decompose, hideTagged } from "./decompose.ts";
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

/** The page's own drawing: the zones and the Dynamic Island (a dashboard overlay InfoPanel has no item for) are left out. */
const notPage = (n: Node): boolean => n instanceof Element && n.matches("[data-zone-id], [data-island]");

/** The page a zone is drawn on (the studio's design-size page, else the grid it sits in). */
const pageOf = (el: HTMLElement): HTMLElement | null => el.closest<HTMLElement>("[data-studio-page]") ?? el.parentElement;

/** The zone's element on the page, its box on the page, the zoom the page is drawn at, and the page. */
function locate(scope: ParentNode, zoneId: string): { el: HTMLElement; box: Rect; zoom: number; page: HTMLElement; grid: { width: number; height: number } } | null {
  const el = scope.querySelector<HTMLElement>(`[data-zone-id="${CSS.escape(zoneId)}"]`);
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
    const first = req.placements.map((p) => locate(req.scope, p.id)).find((s) => s !== null);
    if (first) {
      const size = { w: first.grid.width, h: first.grid.height };
      items.push(await image(await picture(first.page, size, undefined, notPage), "Page background", { x: 0, y: 0, ...size }));
    }
  }

  for (const p of req.placements) {
    if (req.only && p.id !== req.only) continue;
    // A canvas zone is InfoPanel items already: kept, scaled into the zone and centred as the zone draws them.
    if (p.module === CANVAS_ID && p.canvas && p.visible) {
      const spot = locate(req.scope, p.id);
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
    const spot = locate(req.scope, p.id);
    const row0 = rows[0];
    if (spot) {
      grid = spot.grid;
      if (req.only) only = spot.box;
    }

    // A module that isn't InfoPanel data, or a zone that isn't on the page to read.
    if (row0.entry.tier === "native-only") {
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
      const chrome = await image(await picture(spot.el, spot.box, hideTagged), `${row0.name} background`, spot.box);
      items.push({ ...defaultItem("Group"), Name: row0.name, X: Math.round(spot.box.x), Y: Math.round(spot.box.y), DisplayItems: [chrome, ...tagged] } as DisplayItem);
      done("values rebuilt over a picture of the rest", [...new Set(notes.map((x) => x.text))]);
      continue;
    }
    const converter: Converter | undefined = CONVERTERS[p.module];
    const made = converter ? converter(spot.box, ctx, p.settings ?? {}) : [];
    if (made.length === 0) {
      await snapshot(p.module in CONVERTERS ? "its readings aren't on this PC, so a picture of it now" : "its values aren't readable yet, so a picture of it now");
      continue;
    }
    // The widget's card, behind its items (the dashboard's own surface isn't an InfoPanel item).
    items.push(make("Shape", ctx, spot.box, `${row0.name} card`, { FillColor: palette.card, CornerRadius: 12, ShowFrame: false, ShowGradient: false }), ...made);
    done("rebuilt from InfoPanel items", notes.map((x) => x.text));
  }
  // One zone alone becomes a canvas of its own size, its items moved to the corner.
  if (only) {
    const moved = moveBy(items, items.map((_, i) => String(i)), -only.x, -only.y);
    return { items: moved, assets, report, size: { width: Math.max(1, Math.round(only.w)), height: Math.max(1, Math.round(only.h)) } };
  }
  return { items, assets, report, size: { width: Math.max(1, grid.width), height: Math.max(1, grid.height) } };
}

export type { ExportRow };
