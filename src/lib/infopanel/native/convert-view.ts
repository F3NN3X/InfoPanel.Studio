/**
 * Browser-only: a screen's native zones, as drawn on the studio canvas, converted to InfoPanel items. Each zone
 * is read where it is on the page (its box and its values' boxes, once the fonts are ready) and goes by the
 * choice for it:
 *  - recreate: a module with a hand-written converter uses that; any other module is decomposed from its tagged
 *    values over a picture of the rest (the values hidden); a panel is rebuilt widget by widget;
 *  - snapshot: a picture of the zone as it is now;
 *  - leave out: nothing.
 * A widget that isn't InfoPanel data is always left out. The result is the items, the picture files, and a
 * report of what each widget became.
 */
import { domToPng } from "modern-screenshot";
import { fetchForShot, keep } from "../../profile-shot.ts";
import { PANEL_ID, type Placement } from "../../layout.ts";
import { assetFile, type AssetFile } from "../assets/assets.ts";
import { safeStem } from "../gauges/frames.ts";
import { defaultPalette } from "../elements/palette.ts";
import { choiceFor, readChoices, rowsOf, type ExportRow } from "../export/native-choices.ts";
import { defaultItem, type DisplayItem } from "../schema.ts";
import type { DataApiValue } from "../sensors.ts";
import { decompose, hideTagged } from "./decompose.ts";
import { make, type ConvertContext, type Look, type Note, type Rect } from "./items.ts";
import { CONVERTERS } from "./modules/index.ts";
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
}

const bytesOf = async (dataUrl: string): Promise<Uint8Array> => new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());

/** A picture of `el` at its design size (the studio zoom taken out); `hide` is told about each cloned node. */
async function picture(el: HTMLElement, size: { w: number; h: number }, hide?: (n: Node) => void): Promise<Uint8Array> {
  const url = await domToPng(el, {
    width: Math.round(size.w),
    height: Math.round(size.h),
    scale: 1,
    style: { zoom: "1", margin: "0", outline: "none" },
    filter: keep,
    fetchFn: fetchForShot,
    ...(hide ? { onCloneEachNode: hide } : {}),
  });
  return bytesOf(url);
}

const stem = (s: string, n: number) => `${safeStem(s) || "zone"}_${n}`;

/** The zone's element on the page, its box on the grid it sits in, and the zoom the page is drawn at. */
function locate(scope: ParentNode, zoneId: string): { el: HTMLElement; box: Rect; zoom: number } | null {
  const el = scope.querySelector<HTMLElement>(`[data-zone-id="${CSS.escape(zoneId)}"]`);
  const grid = el?.parentElement;
  if (!el || !grid) return null;
  const g = grid.getBoundingClientRect();
  const zoom = grid.offsetWidth > 0 && g.width > 0 ? g.width / grid.offsetWidth : 1;
  const r = el.getBoundingClientRect();
  return { el, zoom, box: { x: (r.left - g.left) / zoom, y: (r.top - g.top) / zoom, w: r.width / zoom, h: r.height / zoom } };
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

  const ctxFor = (notes: Note[]): ConvertContext => ({ look: req.look, palette, sensors: req.sensors, notes });
  const image = async (bytes: Uint8Array, name: string, box: Rect): Promise<DisplayItem> => {
    const file = await assetFile(`${stem(name, ++n)}.png`, bytes, "added");
    assets.push(file);
    return make("Image", ctxFor([]), box, name, { Type: "FILE", FilePath: file.name, RelativePath: true });
  };

  for (const p of req.placements) {
    if (req.only && p.id !== req.only) continue;
    const rows = rowsOf(p, req.titleOf);
    if (rows.length === 0) continue;
    const stored = readChoices(p.settings);
    const spot = locate(req.scope, p.id);
    const row0 = rows[0];

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
    const converter = CONVERTERS[p.module];
    if (converter) {
      const made = converter(spot.box, ctx, p.settings ?? {});
      if (made.length === 0) await snapshot("its plugin isn't running, so a picture of it now");
      else {
        items.push(...made);
        done("rebuilt from InfoPanel items", notes.map((x) => x.text));
      }
      continue;
    }
    const tagged = decompose(spot.el, spot.box, ctx, spot.zoom);
    if (tagged.length === 0) {
      await snapshot("its values aren't readable yet, so a picture of it now");
      continue;
    }
    const chrome = await image(await picture(spot.el, spot.box, hideTagged), `${row0.name} background`, spot.box);
    items.push({ ...defaultItem("Group"), Name: row0.name, X: Math.round(spot.box.x), Y: Math.round(spot.box.y), DisplayItems: [chrome, ...tagged] } as DisplayItem);
    done("values rebuilt over a picture of the rest", [...new Set(notes.map((x) => x.text))]);
  }
  return { items, assets, report };
}

export type { ExportRow };
