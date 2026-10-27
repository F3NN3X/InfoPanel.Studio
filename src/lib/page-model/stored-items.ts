/**
 * Stored InfoPanel items (`StoredItem`, the canvas's JSON form) moved, measured and joined with their files and fonts:
 * what the layout switch (`lib/page-layout.ts`) and the v15 migration (`migrate.ts`) share. Light on purpose: the
 * migration runs in `mergeConfig`, which the kiosk's first bundle loads, so nothing here pulls in the renderer.
 */
import type { StoredAsset, StoredCanvas, StoredFont, StoredItem } from "../infopanel/import/stored.ts";

export type Rect = { x: number; y: number; w: number; h: number };

export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** A file name as the asset table keys it (`assets.ts` `assetKey`). */
const fileKey = (name: string) => name.toLowerCase();

/** The fit a `width`×`height` canvas is drawn with in a `w`×`h` box, aspect kept (`infopanel/canvas.ts` `fitScale`). */
export function fitScale(width: number, height: number, w: number, h: number): number {
  if (width <= 0 || height <= 0 || w <= 0 || h <= 0) return 1;
  return Math.min(w / width, h / height);
}

/**
 * A stored item moved to `dx + X * k`, and when `k` isn't 1 its size and font scaled with it (pictures and gauges by
 * their Scale); a group's children too. Everything else, `$` included, is kept as it is.
 */
export function moved(item: StoredItem, k: number, dx: number, dy: number): StoredItem {
  const out: StoredItem = { ...item, X: Math.round(dx + num(item.X) * k), Y: Math.round(dy + num(item.Y) * k) };
  if (k !== 1) {
    if (typeof item.Scale === "number") out.Scale = Math.max(1, Math.round(item.Scale * k));
    else for (const f of ["Width", "Height"] as const) if (typeof item[f] === "number" && (item[f] as number) > 0) out[f] = Math.max(1, Math.round((item[f] as number) * k));
    if (typeof item.FontSize === "number") out.FontSize = Math.max(1, Math.round(item.FontSize * k));
  }
  if (Array.isArray(item.DisplayItems)) out.DisplayItems = (item.DisplayItems as StoredItem[]).map((c) => moved(c, k, dx, dy));
  return out;
}

/**
 * A stored item at a box: moved to its corner (a group with its children, which InfoPanel keeps on the canvas), and
 * sized to it where the item has a size (pictures and gauges by their Scale). The same item when it is there already.
 */
export function atBox(item: StoredItem, box: Rect): StoredItem {
  const dx = Math.round(box.x) - num(item.X);
  const dy = Math.round(box.y) - num(item.Y);
  const out = dx || dy ? moved(item, 1, dx, dy) : item;
  if (item.kind === "Group" || !(num(item.Width) > 0 && num(item.Height) > 0)) return out;
  const scale = typeof item.Scale === "number" && item.Scale > 0 ? item.Scale / 100 : 1;
  // A size already that box (to the pixel) is kept as it is, so a Scale never rounds it a pixel off.
  const fit = (size: number, want: number) => (Math.round(size * scale) === Math.round(want) ? size : Math.max(1, Math.round(want / scale)));
  const Width = fit(num(item.Width), box.w);
  const Height = fit(num(item.Height), box.h);
  return Width === item.Width && Height === item.Height ? out : { ...out, Width, Height };
}

/** The items with each file name `names` maps renamed (FilePath and an element's `file`). */
export function renameFiles(items: readonly StoredItem[], names: ReadonlyMap<string, string>): StoredItem[] {
  if (names.size === 0) return [...items];
  const swap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(swap);
    const o = obj(v);
    if (!o) return v;
    return Object.fromEntries(
      Object.entries(o).map(([k, x]) => {
        if (k === "FilePath" && typeof x === "string") return [k, names.get(fileKey(x)) ?? x];
        if (k === "file" && typeof x === "string" && typeof o.asset === "string") return [k, names.get(fileKey(x)) ?? x];
        return [k, swap(x)];
      }),
    );
  };
  return items.map((it) => swap(it) as StoredItem);
}

/**
 * Files joined to a list: the same bytes keep the name already there, a name another file has gets a free one
 * (`_2` …). Returns the list and the renames the joined items need.
 */
export function joinAssets(into: readonly StoredAsset[], add: readonly StoredAsset[]): { assets: StoredAsset[]; names: Map<string, string> } {
  const assets = [...into];
  const names = new Map<string, string>();
  for (const a of add) {
    const same = assets.find((b) => b.hash === a.hash);
    if (same) {
      if (fileKey(same.name) !== fileKey(a.name)) names.set(fileKey(a.name), same.name);
      continue;
    }
    let name = a.name;
    const dot = a.name.lastIndexOf(".");
    const stem = dot > 0 ? a.name.slice(0, dot) : a.name;
    const ext = dot > 0 ? a.name.slice(dot) : "";
    for (let n = 2; assets.some((b) => fileKey(b.name) === fileKey(name)); n++) name = `${stem}_${n}${ext}`;
    assets.push({ ...a, name });
    if (name !== a.name) names.set(fileKey(a.name), name);
  }
  return { assets, names };
}

const fontKey = (f: StoredFont) => JSON.stringify([f.request.font, f.request.style, f.request.bold, f.request.italic]);
/** Fonts joined to a list, each request once. */
export const joinFonts = (into: readonly StoredFont[], add: readonly StoredFont[]): StoredFont[] => {
  const seen = new Set(into.map(fontKey));
  return [...into, ...add.filter((f) => !seen.has(fontKey(f)) && seen.add(fontKey(f)))];
};

/** A canvas's own settings without its items (`ProfilePage.freeCanvas`, an area's record). */
export function withoutItems(canvas: StoredCanvas): Omit<StoredCanvas, "items"> {
  const { items: _items, ...rest } = canvas;
  return rest;
}

export function union(boxes: readonly Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** About where an item draws on its canvas, before anything measured it (a text's line, a picture at its Scale, a group around its children). */
export function roughBox(item: StoredItem, fontScale: number): Rect {
  const x = num(item.X);
  const y = num(item.Y);
  if (item.kind === "Group") {
    const kids = (Array.isArray(item.DisplayItems) ? (item.DisplayItems as StoredItem[]) : []).map((c) => roughBox(c, fontScale));
    const area = obj(obj(item.$)?.area);
    if (area) kids.push({ x, y, w: num(area.w), h: num(area.h) });
    return kids.length ? union(kids) : { x, y, w: 1, h: 1 };
  }
  const scale = typeof item.Scale === "number" && item.Scale > 0 ? item.Scale / 100 : 1;
  const w = num(item.Width) * scale;
  const h = num(item.Height) * scale;
  if (w > 0 && h > 0) return { x, y, w, h };
  const size = (typeof item.FontSize === "number" ? item.FontSize : 20) * (fontScale || 1);
  const name = typeof item.Name === "string" ? item.Name : "";
  const chars = item.kind === "Clock" ? 11 : item.kind === "Calendar" ? 10 : name.length || 8;
  return { x, y, w: w > 0 ? w : chars * size * 0.55, h: h > 0 ? h : size * 1.25 };
}
