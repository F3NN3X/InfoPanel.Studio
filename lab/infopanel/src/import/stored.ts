/**
 * The stored form of an imported profile (L8): what the app's canvas zone will
 * save (`Placement.canvas`, PLAN.md decisions 1–2). The profile and items keep
 * InfoPanel's field names and values, unknown fields included, so an export
 * back to `.infopanel` stays exact; what the import decided per item lives
 * under `$` (mode, the Data API key, a vector gauge spec). Assets and supplied
 * fonts are referenced by SHA-256; their bytes travel next to it.
 *
 * Reading checks everything against the schema tables, the same source of
 * truth as the XML parser: a wrong value keeps the C# default and is reported.
 */
import { assetKey, HASH_HEX, type AssetTable, type AssetType } from "../assets/assets.ts";
import type { FontRequest } from "../font-loader.ts";
import type { Use } from "../font-supply.ts";
import { normalizeGauge, type VectorGauge } from "../gauges/vector.ts";
import type { Issue } from "../parse.ts";
import { groupId, type Overrides, type Status } from "../remap/remap.ts";
import { ALIASES, PROFILE, SCHEMAS, type DisplayItem, type ItemKind, type Profile } from "../schema.ts";
import { isBound, type Match } from "../sensors.ts";

export const STORED_FORMAT = "infopanel-canvas";
export const STORED_VERSION = 1;

export type Mode = "infopanel" | "native";
/** The import's default: all faithful, native where possible, or one canvas of each to compare. */
export type DefaultMode = Mode | "both";

/** What the import decided for one item. */
export interface ItemImport {
  mode?: "native";
  /** The Data API key a bound item reads. */
  key?: string;
  /** How the key was found; "chosen" and "unbound" are the user's. */
  via?: Status;
  vector?: VectorGauge;
  vectorBaked?: string;
}

export type StoredItem = Record<string, unknown> & { kind: string; unknown: Record<string, string>; $?: ItemImport };

export interface StoredAsset {
  name: string;
  hash: string;
  type: AssetType;
  size: number;
}

export interface StoredFont {
  request: FontRequest;
  /** What the canvas draws: InfoPanel's face, or a supplied one for a missing font. */
  use: Use;
  supplied?: { hash: string; file: string; index: number; family: string; face: string; license?: string };
}

export interface DataApiInfo {
  url: string;
  /** `/api/sensors` values carry `ref` (PR #173): Libre and HWiNFO map exactly. */
  ref: boolean;
  /** Structured tables (the fork's follow-up). */
  tables: boolean;
  /** Font resolve and file endpoints. */
  fonts: boolean;
}

export interface StoredCanvas {
  format: typeof STORED_FORMAT;
  version: typeof STORED_VERSION;
  source: { name: string; origin: "file" | "corpus" | "installed"; importedAt: string };
  dataApi: DataApiInfo | null;
  defaultMode: DefaultMode;
  profile: Record<string, unknown>;
  items: StoredItem[];
  assets: StoredAsset[];
  fonts: StoredFont[];
}

type Spec = { kind: string; default: unknown; values?: readonly string[]; accept?(v: unknown): unknown };
type Schema = Record<string, Spec>;

/* ---- encoding ---- */

/** JSON has no infinities or NaN; doubles carry them as XmlConvert's words. */
const jsonNumber = (n: number) => (Number.isNaN(n) ? "NaN" : n === Infinity ? "INF" : n === -Infinity ? "-INF" : n);

function encodeFields(schema: Schema, obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, spec] of Object.entries(schema)) {
    const v = obj[k];
    out[k] = (spec.kind === "double" || spec.kind === "float") && typeof v === "number" ? jsonNumber(v) : v;
  }
  out.unknown = { ...((obj.unknown as Record<string, string> | undefined) ?? {}) };
  return out;
}

/** The lab's fields on an item (native, vector, vectorBaked), as `$`. */
function labImport(item: DisplayItem): ItemImport {
  const lab = item as { native?: boolean; vector?: unknown; vectorBaked?: string };
  return {
    ...(lab.native ? { mode: "native" as const } : {}),
    ...(lab.vector !== undefined ? { vector: normalizeGauge(lab.vector) } : {}),
    ...(typeof lab.vectorBaked === "string" ? { vectorBaked: lab.vectorBaked } : {}),
  };
}

export interface KeyOf {
  (item: DisplayItem): { key?: string; via?: Status } | null;
}

export function encodeItem(item: DisplayItem, keyOf: KeyOf): StoredItem {
  const fields = encodeFields(SCHEMAS[item.kind as ItemKind] as Schema, item as unknown as Record<string, unknown>);
  const $ = { ...labImport(item), ...(keyOf(item) ?? {}) };
  const stored: StoredItem = { kind: item.kind, ...fields, unknown: fields.unknown as Record<string, string> };
  if (item.kind === "Group") stored.DisplayItems = item.DisplayItems.map((c) => encodeItem(c, keyOf));
  if (item.kind === "Gauge") stored.Images = item.Images.map((f) => encodeItem(f, () => null));
  if (Object.keys($).length) stored.$ = $;
  return stored;
}

/** Each bound item's key: the remap's answer for its group, and how it was found. */
export function remapKeys(resolved: ReadonlyMap<string, Match | null>, overrides: Overrides): KeyOf {
  return (item) => {
    if (!isBound(item)) return null;
    const id = groupId(item);
    const chosen = overrides.get(id);
    if (chosen === "") return { via: "unbound" };
    const m = resolved.get(id);
    if (!m) return { via: "unresolved" };
    const via: Status = chosen !== undefined ? "chosen" : m.via === "ref" || m.via === "plugin-key" ? "exact" : m.via;
    return { key: m.key, via };
  };
}

export interface StoreInput {
  name: string;
  origin: StoredCanvas["source"]["origin"];
  dataApi: DataApiInfo | null;
  defaultMode: DefaultMode;
  profile: Profile;
  items: readonly DisplayItem[];
  assets: AssetTable;
  keyOf: KeyOf;
  fonts: StoredFont[];
  now?: Date;
}

export function toStored(input: StoreInput): StoredCanvas {
  return {
    format: STORED_FORMAT,
    version: STORED_VERSION,
    source: { name: input.name, origin: input.origin, importedAt: (input.now ?? new Date()).toISOString() },
    dataApi: input.dataApi,
    defaultMode: input.defaultMode,
    profile: encodeFields(PROFILE as Schema, input.profile as unknown as Record<string, unknown>),
    items: input.items.map((i) => encodeItem(i, input.keyOf)),
    assets: [...input.assets.values()].map((f) => ({ name: f.name, hash: f.hash, type: f.type, size: f.bytes.length })),
    fonts: input.fonts,
  };
}

/* ---- reading ---- */

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function decodeValue(spec: Spec, v: unknown): unknown {
  switch (spec.kind) {
    case "int":
      return Number.isInteger(v) && Math.abs(v as number) <= 2 ** 31 ? v : undefined;
    case "uint":
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 2 ** 32 ? v : undefined;
    case "double":
    case "float": {
      const n = typeof v === "number" ? v : v === "INF" ? Infinity : v === "-INF" ? -Infinity : v === "NaN" ? NaN : undefined;
      return n === undefined || spec.kind === "double" ? n : Math.fround(n);
    }
    case "bool":
      return typeof v === "boolean" ? v : undefined;
    case "enum":
      return typeof v === "string" && spec.values?.includes(v) ? v : undefined;
    default:
      return typeof v === "string" || (v === null && spec.default === null) ? v : undefined;
  }
}

interface Ctx {
  path: string;
  kind: string;
  issues: Issue[];
}

function decodeFields(schema: Schema, raw: Record<string, unknown>, ctx: Ctx, containers: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const report = (code: Issue["code"], field: string, value: unknown) =>
    ctx.issues.push({ code, path: ctx.path, kind: ctx.kind, field, value: JSON.stringify(value)?.slice(0, 80) });
  for (const [k, spec] of Object.entries(schema)) {
    if (!(k in raw)) {
      out[k] = spec.default;
      continue;
    }
    const v = decodeValue(spec, raw[k]);
    const accepted = v === undefined ? undefined : spec.accept ? spec.accept(v) : v;
    if (accepted === undefined) report(v === undefined ? "invalid-value" : "rejected-value", k, raw[k]);
    out[k] = accepted === undefined ? spec.default : accepted;
  }
  const unknown: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(raw.unknown) ?? {})) {
    // An unknown field must stay an XML element name; anything else would not export.
    if (typeof v === "string" && /^[A-Za-z_][\w.-]*$/.test(k) && !(k in schema) && !(k in ALIASES)) unknown[k] = v;
    else report("invalid-value", `unknown.${k}`, v);
  }
  for (const k of Object.keys(raw)) {
    if (!(k in schema) && !containers.includes(k) && !["kind", "unknown", "$"].includes(k)) report("unknown-field", k, raw[k]);
  }
  return { ...out, unknown };
}

function decodeImport(raw: unknown): ItemImport {
  const o = obj(raw) ?? {};
  const via = typeof o.via === "string" && ["exact", "name", "suggested", "chosen", "unbound", "unresolved"].includes(o.via) ? (o.via as Status) : undefined;
  return {
    ...(o.mode === "native" ? { mode: "native" as const } : {}),
    ...(typeof o.key === "string" && o.key.length <= 512 ? { key: o.key } : {}),
    ...(via ? { via } : {}),
    ...(o.vector !== undefined ? { vector: normalizeGauge(o.vector) } : {}),
    ...(typeof o.vectorBaked === "string" ? { vectorBaked: o.vectorBaked.slice(0, 100_000) } : {}),
  };
}

const MAX_DEPTH = 32;

/** A stored item back in the lab's form: InfoPanel fields, and the lab fields from `$`. */
function decodeItem(raw: unknown, path: string, issues: Issue[], depth: number, frame = false): (DisplayItem & { $import?: ItemImport }) | null {
  const o = obj(raw);
  const kind = o && typeof o.kind === "string" && Object.hasOwn(SCHEMAS, o.kind) ? (o.kind as ItemKind) : null;
  if (!o || !kind || (frame && kind !== "Image") || depth > MAX_DEPTH) {
    issues.push({ code: "unknown-type", path, kind: String(o?.kind ?? typeof raw), value: String(o?.kind ?? "") });
    return null;
  }
  const containers = kind === "Group" ? ["DisplayItems"] : kind === "Gauge" ? ["Images"] : [];
  const fields = decodeFields(SCHEMAS[kind] as Schema, o, { path, kind, issues }, containers);
  const item: Record<string, unknown> = { kind, ...fields };
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  if (kind === "Group") item.DisplayItems = list(o.DisplayItems).flatMap((c, i) => decodeItem(c, `${path}/${i}`, issues, depth + 1) ?? []);
  if (kind === "Gauge") item.Images = list(o.Images).flatMap((f, i) => decodeItem(f, `${path}/${i}`, issues, depth + 1, true) ?? []);
  const $ = decodeImport(o.$);
  if ($.mode === "native") item.native = true;
  if ($.vector) item.vector = $.vector;
  if ($.vectorBaked) item.vectorBaked = $.vectorBaked;
  return { ...(item as unknown as DisplayItem), ...(($.key !== undefined || $.via) ? { $import: { key: $.key, via: $.via } } : {}) };
}

/** Strips the per-item key records (kept for the overrides), returning plain lab items. */
function splitKeys(items: (DisplayItem & { $import?: ItemImport })[], keys: Map<string, ItemImport>, prefix = ""): DisplayItem[] {
  return items.map((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const { $import, ...rest } = item;
    if ($import) keys.set(path, $import);
    const plain = rest as DisplayItem;
    return plain.kind === "Group" ? { ...plain, DisplayItems: splitKeys(plain.DisplayItems as never, keys, path) } : plain;
  });
}

export interface ReadStored {
  stored: StoredCanvas;
  profile: Profile;
  items: DisplayItem[];
  /** Per item path, the key and how it was found. */
  keys: Map<string, ItemImport>;
  issues: Issue[];
}

const ASSET_TYPES = new Set(["png", "jpeg", "gif", "webp", "bmp", "ico", "svg", "video", "other"]);
const fileName = (v: unknown) => (typeof v === "string" ? v.replace(/^.*[\\/]/, "").replace(/^\.+/, "").slice(0, 200) : "");

/** The stored form from untrusted JSON. Throws only when it is not one at all. */
export function readStored(raw: unknown): ReadStored {
  const o = obj(raw);
  if (!o || o.format !== STORED_FORMAT) throw new Error("Not an imported InfoPanel canvas");
  if (o.version !== STORED_VERSION) throw new Error(`Stored form version ${String(o.version)} is not supported (expected ${STORED_VERSION})`);
  const issues: Issue[] = [];
  const profile = decodeFields(PROFILE as Schema, obj(o.profile) ?? {}, { path: "profile", kind: "Profile", issues }) as unknown as Profile;
  const decoded = (Array.isArray(o.items) ? o.items : []).flatMap((it, i) => decodeItem(it, String(i), issues, 0) ?? []);
  const keys = new Map<string, ItemImport>();
  const items = splitKeys(decoded, keys);

  const src = obj(o.source) ?? {};
  const api = obj(o.dataApi);
  const assets: StoredAsset[] = (Array.isArray(o.assets) ? o.assets : []).flatMap((a) => {
    const ao = obj(a);
    const name = fileName(ao?.name);
    if (!ao || !name || typeof ao.hash !== "string" || !HASH_HEX.test(ao.hash) || typeof ao.type !== "string" || !ASSET_TYPES.has(ao.type)) return [];
    return [{ name, hash: ao.hash, type: ao.type as AssetType, size: typeof ao.size === "number" ? ao.size : 0 }];
  });
  const fonts: StoredFont[] = (Array.isArray(o.fonts) ? o.fonts : []).flatMap((f) => {
    const fo = obj(f);
    const r = obj(fo?.request);
    if (!fo || !r || typeof r.font !== "string" || typeof r.style !== "string" || typeof r.bold !== "boolean" || typeof r.italic !== "boolean") return [];
    const s = obj(fo.supplied);
    const supplied =
      s && typeof s.hash === "string" && HASH_HEX.test(s.hash) && typeof s.index === "number"
        ? { hash: s.hash, file: fileName(s.file), index: s.index, family: String(s.family ?? ""), face: String(s.face ?? ""), ...(typeof s.license === "string" ? { license: s.license } : {}) }
        : undefined;
    return [{ request: { font: r.font, style: r.style, bold: r.bold, italic: r.italic }, use: fo.use === "supplied" ? "supplied" : "infopanel", ...(supplied ? { supplied } : {}) }];
  });
  const mode = o.defaultMode === "native" || o.defaultMode === "both" ? o.defaultMode : "infopanel";
  const stored: StoredCanvas = {
    format: STORED_FORMAT,
    version: STORED_VERSION,
    source: {
      name: typeof src.name === "string" ? src.name.slice(0, 200) : profile.Name,
      origin: src.origin === "corpus" || src.origin === "installed" ? src.origin : "file",
      importedAt: typeof src.importedAt === "string" ? src.importedAt.slice(0, 40) : "",
    },
    dataApi: api ? { url: String(api.url ?? ""), ref: api.ref === true, tables: api.tables === true, fonts: api.fonts === true } : null,
    defaultMode: mode,
    profile: o.profile as Record<string, unknown>,
    items: o.items as StoredItem[],
    assets,
    fonts,
  };
  return { stored, profile, items, keys, issues };
}

/** The user's own remap decisions back as overrides (the rest resolves again). */
export function overridesFrom(items: readonly DisplayItem[], keys: ReadonlyMap<string, ItemImport>): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: readonly DisplayItem[], prefix: string) =>
    list.forEach((item, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      const k = keys.get(path);
      if (isBound(item) && k && !out.has(groupId(item))) {
        if (k.via === "unbound") out.set(groupId(item), "");
        else if (k.via === "chosen" && k.key) out.set(groupId(item), k.key);
      }
      if (item.kind === "Group") walk(item.DisplayItems, path);
    });
  walk(items, "");
  return out;
}

/** The asset table the stored form names, from files by hash; missing ones are listed. */
export function assetsFrom(stored: readonly StoredAsset[], byHash: ReadonlyMap<string, Uint8Array>): { names: { name: string; bytes: Uint8Array }[]; missing: string[] } {
  const names: { name: string; bytes: Uint8Array }[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const a of stored) {
    if (seen.has(assetKey(a.name))) continue;
    seen.add(assetKey(a.name));
    const bytes = byHash.get(a.hash);
    if (bytes) names.push({ name: a.name, bytes });
    else missing.push(a.name);
  }
  return { names, missing };
}
