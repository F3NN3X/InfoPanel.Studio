/**
 * Editing a canvas zone (A5, spec §7): the stored form's items with the import's record of each
 * bound item (its Data API key and how it was found) carried on the item itself under `$import`,
 * so a reorder, group or duplicate keeps it, and the items written back as the stored form.
 * Pure: the studio keeps the stored form in its config, so every commit is one undo step there.
 */
import type { OpenCanvas } from "./canvas.ts";
import type { Path } from "./editor/ops.ts";
import { itemAt, setField, updateAt } from "./editor/ops.ts";
import { insertVectorGauge } from "./gauges/frames.ts";
import type { VectorGauge } from "./gauges/vector.ts";
import { fontRequests } from "./import/session.ts";
import { toStored, type ItemImport, type KeyOf, type StoredAsset, type StoredCanvas, type StoredFont } from "./import/stored.ts";
import type { AssetType } from "./assets/assets.ts";
import { convert, type Conversion, type ConvertContext } from "./native/convert.ts";
import { isNative, walkPaths } from "./native/modes.ts";
import { defaultItem, type DisplayItem, type Profile } from "./schema.ts";
import { groupId } from "./remap/remap.ts";
import { isBound, type BoundItem, type DataApiValue } from "./sensors.ts";

type WithImport = { $import?: Pick<ItemImport, "key" | "via"> };

/** The import's record of an item: its Data API key and how it was found. */
export const importOf = (item: DisplayItem): Pick<ItemImport, "key" | "via"> | undefined => (item as DisplayItem & WithImport).$import;

/** The Data API key an edited item reads, if any. */
export const editKeyOf = (item: DisplayItem): string | null => importOf(item)?.key ?? null;

function attach(items: readonly DisplayItem[], keyAt: (item: DisplayItem, path: Path) => Pick<ItemImport, "key" | "via"> | null, prefix = ""): DisplayItem[] {
  return items.map((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const { $import: _old, ...plain } = item as DisplayItem & WithImport;
    const rec = isBound(item) ? keyAt(item, path) : null;
    const next = (rec && (rec.key !== undefined || rec.via) ? { ...plain, $import: rec } : plain) as DisplayItem;
    return next.kind === "Group" ? { ...next, DisplayItems: attach(next.DisplayItems, keyAt, path) } : next;
  });
}

const pick = (k: ItemImport | undefined) =>
  k && (k.key !== undefined || k.via) ? { ...(k.key !== undefined ? { key: k.key } : {}), ...(k.via ? { via: k.via } : {}) } : null;

/** The opened canvas's items, each bound one carrying its import record. */
export function editItems(open: OpenCanvas): DisplayItem[] {
  return attach(open.items, (_, path) => pick(open.imports.get(path)));
}

/** Every bound item's record replaced from a remap (`remapKeys`): one choice fixes the whole group. */
export const withKeys = (items: readonly DisplayItem[], keyOf: KeyOf): DisplayItem[] => attach(items, (item) => keyOf(item));

const fontKey = (f: StoredFont["request"]) => JSON.stringify([f.font, f.style, f.bold, f.italic]);

/**
 * The stored form with edited items: the same source, Data API, default mode and assets; the
 * font list follows the items' requests, keeping what each one already drew with.
 */
export function storeItems(stored: StoredCanvas, profile: Profile, items: readonly DisplayItem[]): StoredCanvas {
  const known = new Map(stored.fonts.map((f) => [fontKey(f.request), f]));
  const fonts = [...fontRequests(items).values()].map(({ request }): StoredFont => known.get(fontKey(request)) ?? { request, use: "infopanel" });
  const next = toStored({
    name: stored.source.name,
    origin: stored.source.origin,
    dataApi: stored.dataApi,
    defaultMode: stored.defaultMode,
    profile,
    items,
    assets: new Map(),
    keyOf: (item) => pick(importOf(item) as ItemImport | undefined),
    fonts,
  });
  return { ...next, source: stored.source, assets: stored.assets };
}

/** The convert context of an edited canvas: keys from the items, asset URLs from the store. */
export function editContext(open: OpenCanvas): ConvertContext {
  return {
    fontScale: open.profile.FontScale,
    keyOf: (item) => editKeyOf(item),
    assetUrl: (name) => open.assets.get(name.toLowerCase())?.url ?? null,
  };
}

/* ---- modes ---- */

/** How an item draws: natively, as InfoPanel, or as InfoPanel because it cannot convert. */
export type ModeState = "native" | "infopanel" | "stuck";

export interface ItemMode {
  state: ModeState;
  /** What converting gives, or why it cannot. */
  conversion: Conversion;
}

export function itemMode(item: DisplayItem, path: Path, ctx: ConvertContext): ItemMode | null {
  if (item.kind === "Group") return null;
  const conversion = convert(item, path, ctx);
  return { state: !conversion.ok ? "stuck" : isNative(item) ? "native" : "infopanel", conversion };
}

/** Every item's mode by path (groups left out), for the tree dots, the tints and the counts. */
export function itemModes(items: readonly DisplayItem[], ctx: ConvertContext): Map<Path, ItemMode> {
  const out = new Map<Path, ItemMode>();
  walkPaths(items, (item, path) => {
    const m = itemMode(item, path, ctx);
    if (m) out.set(path, m);
  });
  return out;
}

export function modeTally(modes: ReadonlyMap<Path, ItemMode>): Record<ModeState, number> {
  const out: Record<ModeState, number> = { native: 0, infopanel: 0, stuck: 0 };
  for (const m of modes.values()) out[m.state]++;
  return out;
}

/** "Draw all as": every item that converts set to one mode; the same array back when nothing changes. */
export function drawAllAs(items: readonly DisplayItem[], modes: ReadonlyMap<Path, ItemMode>, native: boolean): DisplayItem[] {
  let out = items as DisplayItem[];
  for (const [path, m] of modes) {
    if (m.state === "stuck") continue;
    if (isNative(itemAt(out, path)!) !== native) out = setField(out, path, "native", native);
  }
  return out;
}

/** "Draw all as" shows which mode every convertible item has, or neither when they differ. */
export function allMode(modes: ReadonlyMap<Path, ItemMode>): "native" | "infopanel" | null {
  const states = new Set([...modes.values()].filter((m) => m.state !== "stuck").map((m) => m.state));
  return states.size === 1 ? ([...states][0] as "native" | "infopanel") : null;
}

/* ---- the tree ---- */

/** Every path in tree order (groups before their children). */
export function flatPaths(items: readonly DisplayItem[], prefix = ""): Path[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    return [path, ...(item.kind === "Group" ? flatPaths(item.DisplayItems, path) : [])];
  });
}

/** Shift-click in the tree: every path from the anchor to the clicked one, in tree order. */
export function rangeSelect(items: readonly DisplayItem[], anchor: Path, to: Path): Path[] {
  const all = flatPaths(items);
  const a = all.indexOf(anchor);
  const b = all.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return all.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** The paths still in the tree (a selection after an undo or a delete). */
export const livePaths = (items: readonly DisplayItem[], paths: readonly Path[]) => paths.filter((p) => itemAt(items, p) !== undefined);

/* ---- position ---- */

export type GeoField = "X" | "Y" | "Width" | "Height";

export const GEO_LABEL: Record<GeoField, string> = { X: "X", Y: "Y", Width: "W", Height: "H" };

/** Kinds whose width and height may be 0 (text sizes itself; 0 turns wrapping off). */
const AUTO_SIZE = new Set(["Text", "Clock", "Calendar", "Sensor", "TableSensor"]);

/**
 * A typed position value as InfoPanel would take it, or the message the inspector shows. A
 * rejected value is not stored; the last valid one stays in the model.
 */
export function checkGeometry(kind: DisplayItem["kind"], field: GeoField, raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const n = Number(raw.trim());
  const label = GEO_LABEL[field];
  if (raw.trim() === "" || !Number.isFinite(n)) return { ok: false, message: `InfoPanel needs ${label} as a number. The value isn’t stored.` };
  if (!Number.isInteger(n)) return { ok: false, message: `InfoPanel needs ${label} as a whole number. The value isn’t stored.` };
  if ((field === "Width" || field === "Height") && !AUTO_SIZE.has(kind) && n < 1) {
    return { ok: false, message: `InfoPanel needs ${label} ≥ 1. The value isn’t stored.` };
  }
  if ((field === "Width" || field === "Height") && n < 0) return { ok: false, message: `InfoPanel needs ${label} ≥ 0. The value isn’t stored.` };
  return { ok: true, value: n };
}


/* ---- drops ---- */

/** A file dropped from My library (spec §8): its store hash and what the Library read from it. */
export interface DroppedFile {
  name: string;
  hash: string;
  type: AssetType;
  size: number;
  /** The asset store's extension (a WebM video). */
  ext?: string;
  width?: number;
  height?: number;
}

/** A name not yet used by the canvas's files (ignoring case): "logo.png", "logo (2).png" … */
export function freeAssetName(assets: readonly StoredAsset[], name: string): string {
  const taken = new Set(assets.map((a) => a.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const next = `${stem} (${n})${ext}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/** The canvas's files with `file` among them: the same bytes already there are reused (and keep their name). */
function withAsset(assets: StoredAsset[], file: DroppedFile): { assets: StoredAsset[]; name: string } {
  const same = assets.find((a) => a.hash === file.hash);
  if (same) return { assets, name: same.name };
  const name = freeAssetName(assets, file.name);
  return { assets: [...assets, { name, hash: file.hash, type: file.type, size: file.size, ...(file.ext ? { ext: file.ext } : {}) }], name };
}

/**
 * A library image or video dropped into the canvas editor: a FILE Image item centred on `at`,
 * drawn at the file's size (at most half the profile, keeping its shape), on top of the rest; its
 * file joins the canvas's assets (the same bytes already there are reused). Returns the stored
 * form to commit and the new item's path.
 */
export function withDroppedImage(
  stored: StoredCanvas,
  profile: Profile,
  items: readonly DisplayItem[],
  file: DroppedFile,
  at: { x: number; y: number },
): { stored: StoredCanvas; path: Path } {
  const { assets, name } = withAsset(stored.assets, file);
  const w0 = file.width && file.width > 0 ? file.width : Math.round(profile.Width / 4);
  const h0 = file.height && file.height > 0 ? file.height : Math.round(profile.Height / 4);
  const k = Math.min(1, profile.Width / 2 / w0, profile.Height / 2 / h0);
  const width = Math.max(1, Math.round(w0 * k));
  const height = Math.max(1, Math.round(h0 * k));
  const item = {
    ...defaultItem("Image"),
    Name: name,
    FilePath: name,
    RelativePath: true,
    X: Math.round(at.x - width / 2),
    Y: Math.round(at.y - height / 2),
    Width: width,
    Height: height,
  } as DisplayItem;
  const next = [...items, item];
  return { stored: storeItems({ ...stored, assets }, profile, next), path: String(next.length - 1) };
}

/** A library gauge dropped into the canvas editor: its spec, its frames (files) or both, and its range. */
export interface DroppedGauge {
  name: string;
  vector?: VectorGauge;
  frames?: readonly DroppedFile[];
  min: number;
  max: number;
  animationSpeed: number;
}

/**
 * A library gauge dropped into the canvas editor: a Gauge item centred on `at`, drawn at the spec's
 * size (else the first frame's), at most half the profile keeping its shape, on top of the rest. A
 * vector spec is kept on the item; frames join the canvas's files and become its Images list.
 */
export function withDroppedGauge(
  stored: StoredCanvas,
  profile: Profile,
  items: readonly DisplayItem[],
  gauge: DroppedGauge,
  at: { x: number; y: number },
): { stored: StoredCanvas; path: Path } {
  const files = gauge.frames ?? [];
  const added = files.reduce<{ assets: StoredAsset[]; names: string[] }>(
    (acc, f) => {
      const r = withAsset(acc.assets, f);
      return { assets: r.assets, names: [...acc.names, r.name] };
    },
    { assets: stored.assets, names: [] },
  );
  const w0 = gauge.vector?.width ?? (files[0]?.width || Math.round(profile.Width / 4));
  const h0 = gauge.vector?.height ?? (files[0]?.height || Math.round(profile.Height / 4));
  const k = Math.min(1, profile.Width / 2 / w0, profile.Height / 2 / h0);
  const width = Math.max(1, Math.round(w0 * k));
  const height = Math.max(1, Math.round(h0 * k));
  const base = gauge.vector
    ? insertVectorGauge(items, gauge.vector, gauge.name)
    : { items: [...items, { ...defaultItem("Gauge"), Name: gauge.name } as DisplayItem], path: String(items.length) };
  const next = updateAt(base.items, base.path, (item) => ({
    ...item,
    X: Math.round(at.x - width / 2),
    Y: Math.round(at.y - height / 2),
    Width: width,
    Height: height,
    MinValue: gauge.min,
    MaxValue: gauge.max,
    AnimationSpeed: gauge.animationSpeed,
    Images: added.names.map((name) => ({ ...defaultItem("Image"), Name: name, Type: "FILE", FilePath: name, RelativePath: true })),
  }) as DisplayItem);
  return { stored: storeItems({ ...stored, assets: added.assets }, profile, next), path: base.path };
}

/* ---- sensors ---- */

/** Where the editor's values come from (spec §7 toolbar): none, the app's live values, or mock sliders. */
export type SensorMode = "unbound" | "live" | "mock";

/** The Data API keys the edited items read, sorted (the live subscription). */
export function editKeys(items: readonly DisplayItem[]): string[] {
  const keys = new Set<string>();
  walkPaths(items, (item) => {
    const key = editKeyOf(item);
    if (key) keys.add(key);
  });
  return [...keys].sort();
}

/** A mock slider's value before it is moved. */
export const MOCK_DEFAULT = 50;
const MOCK_KEY = "mock:";

/**
 * The key each item reads and the values it reads them from in a sensor mode: live keeps the
 * items' keys and the live values; unbound reads nothing (as InfoPanel draws with no sensor);
 * mock gives each binding group one value of its own.
 */
export function sensorView(
  mode: SensorMode,
  ctx: ConvertContext,
  groupIds: readonly string[],
  mock: ReadonlyMap<string, number>,
  live: Readonly<Record<string, DataApiValue>>,
): { ctx: ConvertContext; values: Record<string, DataApiValue> } {
  if (mode === "live") return { ctx, values: live as Record<string, DataApiValue> };
  if (mode === "unbound") return { ctx: { ...ctx, keyOf: () => null }, values: {} };
  return {
    ctx: { ...ctx, keyOf: (item) => (isBound(item) ? MOCK_KEY + groupId(item) : null) },
    values: Object.fromEntries(groupIds.map((id) => [MOCK_KEY + id, { value: mock.get(id) ?? MOCK_DEFAULT, unit: "" }])),
  };
}

/* ---- remap ---- */

/** The user's own remap decisions on the items, by group: a chosen key, or "" for left unbound. */
export function itemOverrides(items: readonly DisplayItem[]): Map<string, string> {
  const out = new Map<string, string>();
  walkPaths(items, (item) => {
    const rec = importOf(item);
    if (!isBound(item) || !rec || out.has(groupId(item))) return;
    if (rec.via === "unbound") out.set(groupId(item), "");
    else if (rec.via === "chosen" && rec.key) out.set(groupId(item), rec.key);
  });
  return out;
}

/**
 * The items after a remap change: only the groups in `changed` take their new record, so a
 * catalog that cannot resolve the others (the Data API offline) never clears their keys.
 */
export function withGroupKeys(items: readonly DisplayItem[], keyOf: KeyOf, changed: ReadonlySet<string>): DisplayItem[] {
  return attach(items, (item) => (changed.has(groupId(item as BoundItem)) ? keyOf(item) : pick(importOf(item) as ItemImport | undefined)));
}

/** The groups whose choice differs between two sets of overrides. */
export function changedGroups(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): Set<string> {
  const ids = new Set([...before.keys(), ...after.keys()]);
  return new Set([...ids].filter((id) => before.get(id) !== after.get(id)));
}
