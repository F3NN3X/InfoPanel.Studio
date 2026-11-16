// The recipe validator (Phase 5a), modelled on the pack validator (src/looks/pack-validate.ts): a widget package as files in, a
// list of issues out, each naming the rule it breaks. An `error` refuses the package. It runs where a recipe is imported (the
// studio, before the server is asked to store it) and again every time one is loaded to be drawn (the kiosk's lazy recipe chunk),
// so a file changed on disk is refused there too. The server does what it does for packs: path safety, the caps and the file
// hashes of the manifest (src-tauri/crates/ips-server/src/widgets.rs); this is the only reader of a recipe's meaning.
import { rasterMatches, INJECTION, jsonShapeIssues } from "@/looks/pack-safety";
import { schemaErrors } from "@/looks/schema-check";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import manifestSchema from "./manifest.schema.json";
import { isFollow } from "./follow";
import { cellBasePx, TEXT_FLOOR } from "./metrics";
import recipeSchema from "./recipe.schema.json";
import { BLOCK_TYPES, type Binding, type Block, type Cells, type Condition, DEVICE_ID, DEVICE_KINDS, type Manifest, OPTION_TYPES, type PackageFile, RECIPE_FORMAT, type Recipe, type RecipeOption, type Thresholds, WEATHER_PLACE_FIELDS } from "./types";

export interface RecipeIssue {
  rule: string;
  severity: "error" | "warn";
  /** `manifest.json`, `recipe.json`, an image, or "" for the package as a whole. */
  file: string;
  message: string;
}

/** A package as files: `manifest.json`, `recipe.json` and its images. */
export interface RecipeSource {
  files: readonly PackageFile[];
}

/** A package holds at most this many files, no file over `FILE_MAX_BYTES`, all of them at most `PACKAGE_MAX_BYTES` (widgets.rs holds the same). */
export const FILE_COUNT_MAX = 32;
export const FILE_MAX_BYTES = 256_000;
export const PACKAGE_MAX_BYTES = 512_000;
/** `recipe.json` itself. */
export const RECIPE_MAX_BYTES = 64_000;
/** Blocks nest at most this deep (the root card is 1), and a recipe has at most this many. */
export const DEPTH_MAX = 6;
export const BLOCKS_MAX = 64;
export const OPTIONS_MAX = 24;
export const PRESETS_MAX = 16;
/** A Repeat shows at most this many items, and a place list holds at most this many places. */
export const ITEMS_MAX = 12;
/** A label's line holds at most this many parts (format 2). */
export const PARTS_MAX = 8;

/** The package's files by path; anything else is refused. */
export const PACKAGE_PATH = /^(manifest\.json|recipe\.json|images\/[a-z0-9][a-z0-9-]{0,63}\.(png|jpg|webp))$/;
/** A sensor key: a dotted name of plain characters. */
export const SENSOR_KEY = /^[A-Za-z0-9][\w.:#-]{0,199}$/;
/** A device option named in a sensor key (`libre.{cpu}_cpu_total`). */
export const DEVICE_SLOT = /\{([a-z][A-Za-z0-9]{0,31})\}/g;
/** Keys a placement stores beside the options (the recipe's version) and so no option may take. */
const RESERVED_KEYS = new Set(["recipeVersion", "view"]);
/** What reads as an address or code wherever it stands. */
const URLISH = /:\/\/|^\/\/|^(javascript|vbscript|data|https?|file|ftp|blob|wss?):/i;
const HEX = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;
/** Words of the weather provider's credit, which only the renderer writes. */
const CREDIT = /open-?meteo|weather data by/i;

const issue = (rule: string, file: string, message: string, severity: RecipeIssue["severity"] = "error"): RecipeIssue => ({ rule, severity, file, message });

/** The text of a file as JSON, or undefined (not there, not UTF-8, not JSON). */
export function jsonOf(files: readonly PackageFile[], path: string): unknown {
  const f = files.find((x) => x.path === path);
  try {
    return f && JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(f.bytes));
  } catch {
    return undefined;
  }
}

/** The lowercase hex SHA-256 of `bytes` (Web Crypto: the studio, the kiosk and Node alike). */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What is wrong with a package, errors first (empty: it may be drawn). Pure and synchronous; the hashes are `hashIssues`. A crash inside a rule is an issue. */
export function validateRecipe(src: RecipeSource): RecipeIssue[] {
  try {
    return finish(validate(src.files));
  } catch (e) {
    return [issue("internal", "", `the package could not be read to the end (${(e as Error).name}: ${(e as Error).message.slice(0, 80)}): refused`)];
  }
}

/** Each listed file whose bytes do not hash to what the manifest says. */
export async function hashIssues(src: RecipeSource): Promise<RecipeIssue[]> {
  const manifest = jsonOf(src.files, "manifest.json") as Partial<Manifest> | undefined;
  const out: RecipeIssue[] = [];
  for (const listed of Array.isArray(manifest?.files) ? manifest.files : []) {
    const f = src.files.find((x) => x.path === listed?.path);
    if (f && (await sha256(f.bytes)) !== listed.sha256) out.push(issue("hash", f.path, `${f.path}'s bytes are not the ones the manifest lists (SHA-256 differs)`));
  }
  return out;
}

/** The whole check: the rules, then the hashes. The recipe when nothing refuses it. */
export async function checkPackage(src: RecipeSource): Promise<{ issues: RecipeIssue[]; recipe?: Recipe; manifest?: Manifest }> {
  const issues = finish([...validateRecipe(src), ...(await hashIssues(src))]);
  const ok = !issues.some((i) => i.severity === "error");
  return { issues, ...(ok ? { recipe: jsonOf(src.files, "recipe.json") as Recipe, manifest: jsonOf(src.files, "manifest.json") as Manifest } : {}) };
}

function validate(files: readonly PackageFile[]): RecipeIssue[] {
  const out: RecipeIssue[] = [];
  const add = (rule: string, file: string, message: string, severity: RecipeIssue["severity"] = "error") => void out.push(issue(rule, file, message, severity));

  // the files: paths, caps, both JSON files there
  let total = 0;
  const seen = new Set<string>();
  if (files.length > FILE_COUNT_MAX) add("size", "", `${files.length} files, at most ${FILE_COUNT_MAX}`);
  for (const f of files) {
    total += f.bytes.length;
    if (!PACKAGE_PATH.test(f.path)) add("path", f.path, `${f.path.slice(0, 60)} is not a file a recipe package has (manifest.json, recipe.json, images/<name>.png|jpg|webp)`);
    if (seen.has(f.path)) add("path", f.path, `${f.path} is given twice`);
    seen.add(f.path);
    if (f.bytes.length > FILE_MAX_BYTES) add("size", f.path, `is ${f.bytes.length} bytes, over the ${FILE_MAX_BYTES} cap for a file`);
  }
  if (total > PACKAGE_MAX_BYTES) add("size", "", `the package is ${total} bytes, over the ${PACKAGE_MAX_BYTES} cap`);
  const recipeBytes = files.find((f) => f.path === "recipe.json")?.bytes.length ?? 0;
  if (recipeBytes > RECIPE_MAX_BYTES) add("size", "recipe.json", `is ${recipeBytes} bytes, over the ${RECIPE_MAX_BYTES} cap for a recipe`);
  const manifest = jsonOf(files, "manifest.json");
  const recipe = jsonOf(files, "recipe.json");
  if (manifest === undefined) add("schema", "manifest.json", "manifest.json is missing or is not JSON");
  if (recipe === undefined) add("schema", "recipe.json", "recipe.json is missing or is not JSON");
  if (manifest === undefined || recipe === undefined) return out;

  // a recipe of a format this build does not know yet is a newer build's to read: said as such, before its new keys read as errors
  const format = (recipe as { format?: unknown } | null)?.format;
  if (typeof format === "number" && format > RECIPE_FORMAT) {
    add("format", "recipe.json", `made with a newer InfoPanel Studio (recipe format ${format}); update to show it`);
    return out;
  }
  // too deep a tree is the depth rule's to say, in blocks, before the JSON guard says it in values
  const deep = tooDeep((recipe as { root?: unknown } | null)?.root);
  if (deep) add("depth", "recipe.json", `${deep}: blocks nest ${DEPTH_MAX + 1} deep, at most ${DEPTH_MAX}`);
  for (const [file, value] of [["manifest.json", manifest], ["recipe.json", recipe]] as const) for (const m of jsonShapeIssues(value)) if (!deep || !/nested deeper/.test(m)) add("json-shape", file, m);
  if (out.some((i) => i.rule === "json-shape" || i.rule === "depth")) return out;

  // the schemas
  const manifestErrors = schemaErrors(manifest, manifestSchema as Record<string, unknown>, manifestSchema as Record<string, unknown>);
  const recipeErrors = schemaErrors(recipe, recipeSchema as Record<string, unknown>, recipeSchema as Record<string, unknown>);
  for (const m of manifestErrors) add("schema", "manifest.json", m);
  for (const m of recipeErrors) add("schema", "recipe.json", m);
  // a block this build does not know, named as such wherever it stands (the schema says only that a value is not in its list)
  for (const [at, type] of blockTypes((recipe as { root?: unknown }).root)) if (!(BLOCK_TYPES as readonly string[]).includes(type)) add("block-type", "recipe.json", `${at}: ${type.slice(0, 30)} is not a block (${BLOCK_TYPES.join(", ")})`);
  // no addresses, scripts or markup in any string of either file (the id's `recipe:` is its namespace, not a scheme)
  for (const [file, value] of [["manifest.json", manifest], ["recipe.json", recipe]] as const) {
    for (const [at, s] of strings(value)) if (at !== "$.id" && (URLISH.test(s) || INJECTION.test(s))) add("url", file, `${at}: ${s.slice(0, 40)} reads as an address, markup or code; a recipe holds plain values and its own files only`);
  }
  // the weather provider's credit is the renderer's to draw (outside the blocks, where nothing can hide it): a recipe may not write
  // its own, so it can neither imitate nor contradict it
  for (const [at, s] of strings(recipe)) if (CREDIT.test(s)) add("attribution", "recipe.json", `${at}: ${s.slice(0, 40)} speaks for the weather provider; the app draws its credit under weather by place itself`);
  if (manifestErrors.length || recipeErrors.length) return out;

  const m = manifest as Manifest;
  const r = recipe as Recipe;
  manifestRules(m, r, files, add);
  recipeRules(r, files, add);
  return out;
}

/** Where a tree as written first nests deeper than `DEPTH_MAX` blocks (the root card is 1), or undefined. Reads no deeper than that. */
function tooDeep(block: unknown, at = "$.root", depth = 1): string | undefined {
  if (!block || typeof block !== "object") return undefined;
  if (depth > DEPTH_MAX) return at;
  const children = (block as { children?: unknown }).children;
  if (!Array.isArray(children)) return undefined;
  for (let k = 0; k < children.length; k++) {
    const found = tooDeep(children[k], `${at}.children[${k}]`, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Every string of parsed JSON with its path. */
function strings(value: unknown, at = "$", out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((v, k) => strings(v, `${at}[${k}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, `${at}.${k}`, out);
  return out;
}

/** The `type` of every block of a tree as written, with its path (whatever else the tree holds). */
function blockTypes(block: unknown, at = "$.root", out: [string, string][] = []): [string, string][] {
  if (!block || typeof block !== "object") return out;
  const b = block as { type?: unknown; children?: unknown };
  out.push([at, String(b.type)]);
  if (Array.isArray(b.children)) b.children.forEach((c, k) => blockTypes(c, `${at}.children[${k}]`, out));
  return out;
}

type Add = (rule: string, file: string, message: string, severity?: RecipeIssue["severity"]) => void;

// A recipe may carry a publisher signature (`{ minisign }`, FORMAT.md §17). Its shape is the schema's; whether it verifies is the
// server's word (ips-server widget_sign.rs, on import and on every read): a package it does not verify is never served.
function manifestRules(m: Manifest, r: Recipe, files: readonly PackageFile[], add: Add): void {
  if (m.kind !== "recipe") add("kind", "manifest.json", `kind ${m.kind}: a code widget is not a recipe (code widgets load from Phase 6b)`);
  if (m.id !== r.id) add("id", "manifest.json", `the manifest's id ${m.id} is not the recipe's ${r.id}`);
  if (m.version !== r.version) add("version", "manifest.json", `the manifest's version ${m.version} is not the recipe's ${r.version}`);
  const listed = new Set<string>();
  for (const f of m.files) {
    if (listed.has(f.path)) add("files", "manifest.json", `${f.path} is listed twice`);
    listed.add(f.path);
    const real = files.find((x) => x.path === f.path);
    if (!real) add("files", "manifest.json", `${f.path} is listed and not in the package`);
    else if (real.bytes.length !== f.bytes) add("files", f.path, `is listed as ${f.bytes} bytes and holds ${real.bytes.length}`);
  }
  if (!listed.has("recipe.json")) add("files", "manifest.json", "recipe.json is not listed");
  for (const f of files) if (f.path !== "manifest.json" && !listed.has(f.path)) add("files", f.path, "not in the manifest's file list: anything not listed is refused");
}

/** A block's children (none for a block that holds none). */
const childrenOf = (b: Block): Block[] => ("children" in b && Array.isArray(b.children) ? b.children : []);
const CONTAINERS = new Set(["card", "row", "repeat"]);
const BOUND = new Set(["ring", "gauge", "bar", "sparkline", "value", "weather-icon"]);
/** A block's text size by default, times the card's base (`metrics.ts`): the floor is checked against these when a block names none. */
export const DEFAULT_SCALE: Partial<Record<Block["type"], number>> = { value: 1, label: 0.85, ring: 1.6, gauge: 1.6 };
const DIRECTIONS: Record<string, readonly string[]> = { row: ["row", "column"], repeat: ["rows", "columns", "grid"] };
const STYLES: Record<string, readonly string[]> = { bar: ["bar", "segments"], sparkline: ["line", "area", "bars"] };

function recipeRules(r: Recipe, files: readonly PackageFile[], add: Add): void {
  const R = "recipe.json";
  const options = new Map<string, RecipeOption>();
  // size: min <= default <= max, every number a whole cell
  const { min, max } = r.size;
  for (const [name, cells] of Object.entries(r.size)) if (!cells.every(Number.isInteger) || cells.length !== 2) add("size-range", R, `size.${name} is two whole numbers of cells`);
  const within = (c: readonly number[]) => c[0] >= min[0] && c[1] >= min[1] && c[0] <= max[0] && c[1] <= max[1];
  if (min[0] > max[0] || min[1] > max[1]) add("size-range", R, `size.min ${min.join("x")} is larger than size.max ${max.join("x")}`);
  else if (!within(r.size.default)) add("size-range", R, `size.default ${r.size.default.join("x")} is outside ${min.join("x")} to ${max.join("x")}`);

  // options: plain unique keys, none the standard block's, a default of their type
  if (r.options.length > OPTIONS_MAX) add("size", R, `${r.options.length} options, at most ${OPTIONS_MAX}`);
  for (const o of r.options) {
    if (options.has(o.key)) add("option", R, `option ${o.key} is defined twice`);
    if (STANDARD_KEYS.has(o.key) || RESERVED_KEYS.has(o.key)) add("option", R, `option ${o.key} takes a key every widget already has`);
    options.set(o.key, o);
    const why = optionDefaultIssue(o);
    if (why) add("option", R, `option ${o.key}: ${why}`);
  }

  // presets: one default, sizes inside the recipe's, settings that are option values
  if (r.presets.length > PRESETS_MAX) add("size", R, `${r.presets.length} presets, at most ${PRESETS_MAX}`);
  const defaults = r.presets.filter((p) => p.default).length;
  if (defaults !== 1) add("preset", R, `${defaults} presets are the default; exactly one is`);
  const ids = new Set<string>();
  for (const p of r.presets) {
    if (ids.has(p.id)) add("preset", R, `preset ${p.id} is defined twice`);
    ids.add(p.id);
    if (!within(p.size)) add("preset", R, `preset ${p.id}: size ${p.size.join("x")} is outside ${min.join("x")} to ${max.join("x")}`);
    if (p.minSize && !within(p.minSize)) add("preset", R, `preset ${p.id}: minSize ${p.minSize.join("x")} is outside ${min.join("x")} to ${max.join("x")}`);
    for (const [key, value] of Object.entries(p.settings)) {
      const o = options.get(key);
      if (!o) add("preset", R, `preset ${p.id} sets ${key}, which is not an option`);
      else {
        const why = optionValueIssue(o, o.type === "place-list" ? placesOf(value) : value);
        if (why) add("preset", R, `preset ${p.id}: ${key} ${why}`);
      }
    }
  }

  // the block tree
  if (r.root.type !== "card") add("block", R, "the root block is a card");
  let count = 0;
  const walk = (b: Block, at: string, depth: number, repeat: string | undefined) => {
    count++;
    if (depth > DEPTH_MAX) return void add("depth", R, `${at}: blocks nest ${depth} deep, at most ${DEPTH_MAX}`);
    blockRules(b, at, repeat, options, files, add);
    if (b.type === "repeat" && repeat) add("repeat", R, `${at}: a Repeat inside a Repeat`);
    childrenOf(b).forEach((c, k) => walk(c, `${at}.children[${k}]`, depth + 1, b.type === "repeat" ? b.over : repeat));
  };
  walk(r.root, "$.root", 1, undefined);
  if (count > BLOCKS_MAX) add("size", R, `${count} blocks, at most ${BLOCKS_MAX}`);
  // format 1 is what an older build reads: a recipe using a key it has not got says format 2, so that build can say why it won't draw it
  if (r.format === 1) for (const at of format2Keys(r.root)) add("format", R, `${at}: ${FORMAT2_WHAT[at.split(".").pop()!]} recipe format 2`);

  // the text floor at every size the recipe allows
  floorRules(r, add);

  // sample data: sensor keys, and items for the list options with the source's fields
  for (const key of Object.keys(r.sample.sensors)) if (!SENSOR_KEY.test(key) || !key.includes(".")) add("sample", R, `sample sensor ${key.slice(0, 40)} is not a sensor key`);
  for (const [key, items] of Object.entries(r.sample.items ?? {})) {
    if (options.get(key)?.type !== "place-list") add("sample", R, `sample items ${key}: not a place-list option`);
    if (items.length > ITEMS_MAX) add("sample", R, `sample items ${key}: ${items.length} items, at most ${ITEMS_MAX}`);
    for (const item of items) for (const field of Object.keys(item)) if (!(WEATHER_PLACE_FIELDS as readonly string[]).includes(field)) add("sample", R, `sample items ${key}: ${field} is not a field of Weather by place (${WEATHER_PLACE_FIELDS.join(", ")})`);
  }
}

/** A stored place list (JSON text, or the recipe's own array) as places, or undefined when it is not one. */
export function placesOf(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const isPlace = (p: unknown): boolean => {
  const x = p as { name?: unknown; lat?: unknown; lon?: unknown; here?: unknown } | null;
  // `here`: the place "Use this PC's location first" put at the top, the one other key a place may have
  const keys = x ? Object.keys(x).length - (x.here === true ? 1 : 0) : 0;
  return !!x && typeof x.name === "string" && x.name.length > 0 && x.name.length <= 60 && typeof x.lat === "number" && Math.abs(x.lat) <= 90 && typeof x.lon === "number" && Math.abs(x.lon) <= 180 && keys === 3;
};

/** Why a value does not suit an option, or undefined. */
function optionValueIssue(o: RecipeOption, v: unknown): string | undefined {
  switch (o.type) {
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return "is a number";
      return (o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max) ? `${v} is outside ${o.min ?? "-"} to ${o.max ?? "-"}` : undefined;
    case "boolean":
      return typeof v === "boolean" ? undefined : "is true or false";
    case "place-list":
      return Array.isArray(v) && v.length <= ITEMS_MAX && v.every(isPlace) && v.filter((p) => p.here === true).length <= 1 ? undefined : `is a list of at most ${ITEMS_MAX} places ({ name, lat, lon }, one of them here at most)`;
    case "select":
      return typeof v === "string" && (o.options ?? []).some((x) => x.value === v) ? undefined : `${String(v)} is not one of its choices`;
    case "sensor":
      return v === "" || (typeof v === "string" && SENSOR_KEY.test(v) && v.includes(".")) ? undefined : "is a sensor key";
    case "device":
      return typeof v === "string" && DEVICE_ID.test(v) ? undefined : "is auto or a device id";
    case "color":
      return v === "" || (typeof v === "string" && HEX.test(v)) ? undefined : "is a #rgb or #rrggbb colour";
    case "date":
      return v === "" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? undefined : "is YYYY-MM-DD";
    case "time":
      return v === "" || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? undefined : "is HH:MM";
    default:
      return typeof v === "string" && v.length <= 200 ? undefined : "is text of at most 200 characters";
  }
}

function optionDefaultIssue(o: RecipeOption): string | undefined {
  if (!(OPTION_TYPES as readonly string[]).includes(o.type)) return `${o.type} is not an option type`;
  if (o.options && o.type !== "select") return "only a select has choices";
  if (o.type === "select" && !o.options?.length) return "a select needs its choices";
  if (o.type === "device" && !(DEVICE_KINDS as readonly string[]).includes(String(o.kind))) return `a device option names its kind (${DEVICE_KINDS.join(", ")})`;
  if (o.kind !== undefined && o.type !== "device") return "only a device option has a kind";
  const why = optionValueIssue(o, o.default);
  return why && `default ${why}`;
}

/** Why a binding names nothing there, or undefined. */
function bindingIssue(b: Binding, repeat: string | undefined, options: Map<string, RecipeOption>): string | undefined {
  if ("sensor" in b) {
    for (const [, key] of b.sensor.matchAll(DEVICE_SLOT)) if (options.get(key)?.type !== "device") return `sensor ${b.sensor.slice(0, 40)} names {${key}}, which is not a device option`;
    const plain = b.sensor.replace(DEVICE_SLOT, "x");
    return SENSOR_KEY.test(plain) && plain.includes(".") ? undefined : `sensor ${b.sensor.slice(0, 40)} is not a sensor key`;
  }
  if ("option" in b) {
    const o = options.get(b.option);
    if (!o) return `option ${b.option} is not one of the recipe's options`;
    if (o.type === "device") return `option ${b.option} is a device, which a sensor key names in braces`;
    return o.type === "place-list" ? `option ${b.option} is a place list, which a Repeat runs over` : undefined;
  }
  if (!repeat) return `field ${b.field} is read only inside a Repeat`;
  return (WEATHER_PLACE_FIELDS as readonly string[]).includes(b.field) ? undefined : `field ${b.field} is not a field of Weather by place (${WEATHER_PLACE_FIELDS.join(", ")})`;
}

function blockRules(b: Block, at: string, repeat: string | undefined, options: Map<string, RecipeOption>, files: readonly PackageFile[], add: Add): void {
  const R = "recipe.json";
  const raw = b as unknown as Record<string, unknown>;
  const bind = (binding: Binding | undefined, where: string) => {
    const why = binding && bindingIssue(binding, repeat, options);
    if (why) add("binding", R, `${where}: ${why}`);
  };
  const container = CONTAINERS.has(b.type);
  if (container && !Array.isArray(raw.children)) add("block", R, `${at}: a ${b.type} holds its blocks in children`);
  if (!container && raw.children !== undefined) add("block", R, `${at}: a ${b.type} holds no blocks`);
  if (BOUND.has(b.type) && raw.bind === undefined) add("binding", R, `${at}: a ${b.type} needs its data (bind)`);
  if (raw.direction !== undefined && !isFollow(raw.direction) && !DIRECTIONS[b.type]?.includes(String(raw.direction))) add("block", R, `${at}: direction ${String(raw.direction)} is not a ${b.type}'s`);
  followRules(b, at, options, add);
  if (raw.style !== undefined && !STYLES[b.type]?.includes(String(raw.style))) add("block", R, `${at}: style ${String(raw.style)} is not a ${b.type}'s`);
  if (typeof raw.min === "number" && typeof raw.max === "number" && raw.min >= raw.max) add("block", R, `${at}: min ${raw.min} is not under max ${raw.max}`);
  if (raw.color === "thresholds" && raw.thresholds === undefined) add("block", R, `${at}: colour by thresholds needs its thresholds`);
  styleRules(b, at, add);
  phaseERules(b, at, at === "$.root", add);
  if (b.when) {
    const { option, is, not, size } = b.when;
    if (option !== undefined && !options.has(option)) add("binding", R, `${at}.when: option ${option} is not one of the recipe's options`);
    if (option !== undefined && is === undefined && not === undefined) add("block", R, `${at}.when: says neither is nor not`);
    if (option === undefined && (is !== undefined || not !== undefined)) add("block", R, `${at}.when: says is or not of no option`);
    if (option === undefined && !size) add("block", R, `${at}.when: names neither an option nor a size`);
    const cells = [size?.min, size?.max].filter((c): c is Cells => !!c);
    if (cells.some((c) => c.length !== 2 || !c.every(Number.isInteger))) add("block", R, `${at}.when.size: a size is two whole numbers of cells`);
    else if (size?.min && size.max && (size.min[0] > size.max[0] || size.min[1] > size.max[1])) add("block", R, `${at}.when.size: min ${size.min.join("x")} is larger than max ${size.max.join("x")}`);
  }
  if ("bind" in b && b.bind) bind(b.bind, `${at}.bind`);
  if (b.type === "card" && b.subtitle) bind(b.subtitle, `${at}.subtitle`);
  if (b.type === "label" && b.text === undefined && b.bind === undefined && b.parts === undefined) add("binding", R, `${at}: a label needs its text or its data`);
  if (b.type === "label" && b.parts) {
    if (b.text !== undefined || b.bind !== undefined) add("block", R, `${at}: a label of parts has no text or data beside them`);
    if (b.parts.length > PARTS_MAX) add("size", R, `${at}: ${b.parts.length} parts, at most ${PARTS_MAX}`);
    b.parts.forEach((part, k) => {
      if ("text" in part === "bind" in part) add("block", R, `${at}.parts[${k}]: a part is text or data, one of them`);
      else if ("text" in part && Object.keys(part).length > 1) add("block", R, `${at}.parts[${k}]: decimals and a unit belong to a part of data`);
      if ("bind" in part) bind(part.bind, `${at}.parts[${k}].bind`);
    });
  }
  if (b.type === "heatmap") {
    if (!b.cells && !b.bind) add("binding", R, `${at}: a heatmap needs its cells or a field of numbers`);
    b.cells?.forEach((c, k) => bind(c, `${at}.cells[${k}]`));
  }
  if (b.type === "repeat") {
    if (options.get(b.over)?.type !== "place-list") add("repeat", R, `${at}: runs over option ${b.over}, which is not a place list`);
    if (b.max !== undefined && !isFollow(b.max) && !(Number.isInteger(b.max) && b.max >= 1 && b.max <= ITEMS_MAX)) add("repeat", R, `${at}: most shown ${b.max}, a whole number from 1 to ${ITEMS_MAX}`);
    if (b.hours !== undefined && !isFollow(b.hours) && !(Number.isInteger(b.hours) && b.hours >= 1 && b.hours <= HOURS_MAX)) add("repeat", R, `${at}: hours ${b.hours}, a whole number from 1 to ${HOURS_MAX}`);
  }
  if (b.type === "image") {
    const f = files.find((x) => x.path === b.file);
    if (!f) add("image", R, `${at}: ${b.file} is not in the package`);
    else if (!rasterMatches(b.file.split(".").pop()!, f.bytes)) add("image", f.path, `the bytes are not a ${b.file.split(".").pop()} image`);
  }
}

/** The forecast hours a Weather-by-place item can carry (the server sends 24). */
const HOURS_MAX = 24;
/** The block settings that may follow an option, by block type, each with what its values may be. */
const FOLLOWERS: Record<string, Record<string, { values?: readonly string[]; range?: [number, number] }>> = {
  repeat: { direction: { values: ["rows", "columns", "grid"] }, max: { range: [1, ITEMS_MAX] }, hours: { range: [1, HOURS_MAX] }, units: { values: ["metric", "imperial"] } },
  sparkline: { window: { range: [10, 600] } },
};
const FOLLOWABLE = ["direction", "max", "hours", "units", "window"];

/**
 * A setting that follows an option (Phase 5c): only a Repeat's direction, most shown, hours and units and a sparkline's window may;
 * the option is there and of a kind that gives such a value (a select for a word; a number with its range inside the setting's, or
 * a select mapped to numbers); a map names the select's own choices and maps each to a value the setting takes. A fixed sparkline
 * window is checked here too. Hours and units belong to a Repeat, a window to a sparkline.
 */
function followRules(b: Block, at: string, options: Map<string, RecipeOption>, add: Add): void {
  const R = "recipe.json";
  const raw = b as unknown as Record<string, unknown>;
  const own = FOLLOWERS[b.type] ?? {};
  for (const key of FOLLOWABLE) {
    const v = raw[key];
    if (v === undefined) continue;
    const spec = own[key];
    if (!spec) {
      if (isFollow(v)) add("follow", R, `${at}.${key}: only a Repeat's direction, most shown, hours and units and a sparkline's window follow an option`);
      else if (key === "hours" || key === "units" || key === "window") add("block", R, `${at}: ${key} is not a ${b.type}'s`);
      continue;
    }
    const fits = (x: unknown): boolean => (spec.values ? typeof x === "string" && spec.values.includes(x) : typeof x === "number" && Number.isInteger(x) && x >= spec.range![0] && x <= spec.range![1]);
    const what = spec.values ? spec.values.join(", ") : `a whole number from ${spec.range![0]} to ${spec.range![1]}`;
    if (!isFollow(v)) {
      if (key === "window" && !fits(v)) add("block", R, `${at}.window: ${String(v)} s, ${what}`);
      continue;
    }
    const o = options.get(v.option);
    if (!o) {
      add("follow", R, `${at}.${key}: option ${v.option} is not one of the recipe's options`);
      continue;
    }
    if (v.map) {
      if (o.type !== "select") add("follow", R, `${at}.${key}: a map reads a select's choices; option ${v.option} is a ${o.type}`);
      for (const [choice, x] of Object.entries(v.map)) {
        if (o.type === "select" && !(o.options ?? []).some((c) => c.value === choice)) add("follow", R, `${at}.${key}: ${choice.slice(0, 20)} is not a choice of option ${v.option}`);
        if (!fits(x)) add("follow", R, `${at}.${key}: ${choice.slice(0, 20)} maps to ${String(x).slice(0, 20)}, not ${what}`);
      }
    } else if (spec.values) {
      if (o.type !== "select") add("follow", R, `${at}.${key}: follows option ${v.option}, a ${o.type}; a select's choices (or a map) give ${what}`);
      else for (const c of o.options ?? []) if (!fits(c.value)) add("follow", R, `${at}.${key}: option ${v.option} has the choice ${c.value.slice(0, 20)}, not ${what} (map it)`);
    } else if (o.type !== "number") add("follow", R, `${at}.${key}: follows option ${v.option}, a ${o.type}; a number option (or a select with a map) gives ${what}`);
    else if (o.min === undefined || o.max === undefined || !fits(o.min) || !fits(o.max) || (o.step !== undefined && !Number.isInteger(o.step))) add("follow", R, `${at}.${key}: option ${v.option} goes from ${o.min ?? "-"} to ${o.max ?? "-"}; it needs whole steps inside ${what}`);
  }
}

/** The text, colour, unit and threshold keys of Phase C, by the blocks that have them (the schema's block allows each on any block). */
const TEXT_ALIGNS = ["start", "center", "end"];
const CONVERTS = new Set(["value", "ring", "gauge"]);

/**
 * Phase C's keys on the blocks they belong to: a value's and a label's `align` (start, centre or end; stretch is a row's), the text
 * colours `fg` and `muted` as a value's colour only, a ring's centre `tone` (the text colour or muted), `convert` on a value or a ring
 * and never beside a typed unit, and thresholds whose warning level does not come after the critical one for their direction.
 * That order refuses only low is bad (`low`, a format 2 key, so no recipe from before it can break); with high is bad a warning past
 * critical loads and draws as it always has (critical wins), and the issue is a `warn` the builder shows without stopping a save.
 */
function styleRules(b: Block, at: string, add: Add): void {
  const R = "recipe.json";
  const raw = b as unknown as Record<string, unknown>;
  if ((b.type === "value" || b.type === "label") && b.align !== undefined && !TEXT_ALIGNS.includes(b.align)) add("block", R, `${at}: align ${b.align} is a row's; a ${b.type} aligns start, center or end`);
  if ((raw.color === "fg" || raw.color === "muted") && b.type !== "value") add("block", R, `${at}: colour ${raw.color} is a text colour, a value's (a ring's centre value takes tone)`);
  if ((b.type === "ring" || b.type === "gauge") && b.tone !== undefined && b.tone !== "fg" && b.tone !== "muted") add("block", R, `${at}: tone ${String(b.tone)}: a ring's centre value takes the text colour or muted (fg, muted)`);
  if (raw.convert !== undefined && !CONVERTS.has(b.type)) add("block", R, `${at}: convert is a value's or a ring's`);
  if (raw.convert !== undefined && raw.unit !== undefined) add("block", R, `${at}: a unit typed and a unit to show in; one of them`);
  const t = raw.thresholds as Thresholds | undefined;
  if (t && (t.low ? t.warn < t.crit : t.warn > t.crit))
    add("thresholds", R, `${at}.thresholds: warning at ${t.warn} comes after critical at ${t.crit}; ${t.low ? "when low is bad, warning is the higher level" : "when high is bad, warning is the lower level"}`, t.low ? "error" : "warn");
}

/** The blocks each Phase E key belongs to (the schema's block allows each on any block); `"nested"` is a card inside the root, `"root"` the root card. */
const PHASE_E: Readonly<Record<string, { on: readonly string[]; what: string }>> = {
  weight: { on: ["value", "label"], what: "a value's or a label's" },
  case: { on: ["value", "label"], what: "a value's or a label's" },
  opacity: { on: ["value", "label", "ring", "gauge", "bar", "sparkline", "heatmap"], what: "a text's or a mark's" },
  surface: { on: ["nested"], what: "a card's inside the root (the root card is the theme's shell)" },
  padding: { on: ["nested"], what: "a card's inside the root (the root card is the theme's shell)" },
  spacing: { on: ["root"], what: "the root card's" },
  sweep: { on: ["gauge"], what: "a gauge's" },
  height: { on: ["bar"], what: "a bar's" },
};

/** Phase E's keys on the blocks they belong to: the values are the schema's enums, so what is left is where each may stand. */
function phaseERules(b: Block, at: string, root: boolean, add: Add): void {
  const raw = b as unknown as Record<string, unknown>;
  const kind = b.type === "card" ? (root ? "root" : "nested") : b.type;
  for (const [key, rule] of Object.entries(PHASE_E)) if (raw[key] !== undefined && !rule.on.includes(kind)) add("block", "recipe.json", `${at}: ${key} is ${rule.what}`);
}

/** What each format 2 key is, for the `format` rule's message (by the last part of its path). */
const FORMAT2_WHAT: Readonly<Record<string, string>> = {
  parts: "parts need",
  align: "text alignment needs",
  color: "a text colour needs",
  tone: "a centre value's colour needs",
  convert: "Show in needs",
  low: "low is bad needs",
  weight: "text weight needs",
  case: "upper case needs",
  opacity: "opacity needs",
  surface: "a card's surface needs",
  padding: "a card's padding needs",
  spacing: "the card's spacing needs",
  sweep: "a gauge's sweep needs",
  height: "a bar's height needs",
};

/**
 * Where a tree uses a key format 1 has not got: a label's parts (Phase A), Phase C's text alignment on a value or a label, the text
 * colours on a value, a ring's centre tone, `convert` and thresholds' `low`, and every Phase E key (weight, case, opacity, surface,
 * padding, spacing, sweep, height) on any block, none of which format 1 has.
 */
export function format2Keys(block: Block, at = "$.root", out: string[] = []): string[] {
  const raw = block as unknown as Record<string, unknown>;
  if (block.type === "label" && block.parts) out.push(`${at}.parts`);
  if ((block.type === "value" || block.type === "label") && block.align !== undefined) out.push(`${at}.align`);
  if (block.type === "value" && (block.color === "fg" || block.color === "muted")) out.push(`${at}.color`);
  if ((block.type === "ring" || block.type === "gauge") && block.tone !== undefined) out.push(`${at}.tone`);
  if (raw.convert !== undefined) out.push(`${at}.convert`);
  if ((raw.thresholds as Thresholds | undefined)?.low !== undefined) out.push(`${at}.thresholds.low`);
  for (const key of Object.keys(PHASE_E)) if (raw[key] !== undefined) out.push(`${at}.${key}`);
  childrenOf(block).forEach((c, k) => format2Keys(c, `${at}.children[${k}]`, out));
  return out;
}

/** Whether a condition's size part lets a block show in a zone of `cells` (its option part is a person's choice, so it does not count). */
export const sizeHolds = (when: Condition | undefined, cells: Cells): boolean => {
  const { min, max } = when?.size ?? {};
  return (!min || (cells[0] >= min[0] && cells[1] >= min[1])) && (!max || (cells[0] <= max[0] && cells[1] <= max[1]));
};

/** The text blocks with their size (the default where they name none) and the size conditions on their way down: what the floor applies to. */
function textBlocks(root: Block, out: { at: string; scale: number; when: Condition[] }[] = [], at = "$.root", when: Condition[] = []): { at: string; scale: number; when: Condition[] }[] {
  const own = (root as { scale?: number }).scale ?? DEFAULT_SCALE[root.type];
  const text = root.type === "value" || root.type === "label" || ((root.type === "ring" || root.type === "gauge") && root.center !== false);
  const path = root.when?.size ? [...when, root.when] : when;
  if (text && own !== undefined) out.push({ at, scale: own, when: path });
  childrenOf(root).forEach((c, k) => textBlocks(c, out, `${at}.children[${k}]`, path));
  return out;
}

function floorRules(r: Recipe, add: Add): void {
  const { min, max } = r.size;
  const sizes: [number, number][] = [];
  for (let c = min[0]; c <= max[0]; c++) for (let h = min[1]; h <= max[1]; h++) sizes.push([c, h]);
  for (const t of textBlocks(r.root)) {
    // a text a size condition hides at a size is not drawn there
    const under = sizes.find(([c, h]) => t.when.every((w) => sizeHolds(w, [c, h])) && cellBasePx(c, h) * t.scale < TEXT_FLOOR);
    if (under) add("text-floor", "recipe.json", `${t.at}: text is ${(cellBasePx(...under) * t.scale).toFixed(1)} px at ${under.join("x")}, under ${TEXT_FLOOR} px (raise its scale or the recipe's smallest size)`);
  }
}

/** Errors first; the same rule on the same file and message once. */
function finish(issues: RecipeIssue[]): RecipeIssue[] {
  const seen = new Set<string>();
  const unique = issues.filter((i) => !seen.has(`${i.rule}|${i.file}|${i.message}`) && seen.add(`${i.rule}|${i.file}|${i.message}`));
  return [...unique.filter((i) => i.severity === "error"), ...unique.filter((i) => i.severity === "warn")];
}
