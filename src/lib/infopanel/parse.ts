/**
 * Parses `Profile.xml` and `DisplayItems.xml` the way XmlSerializer reads them
 * into InfoPanel's models: missing elements keep the C# default, values go
 * through the setter logic, and the first occurrence of an element wins.
 *
 * Where XmlSerializer would throw (a malformed number, an unknown enum name or
 * item type) we keep the default or skip the item and report it, so one bad
 * field does not hide the rest of the profile.
 */
import {
  ALIASES,
  IGNORED,
  PROFILE,
  SCHEMAS,
  type DisplayItem,
  type FieldSpec,
  type ImageItem,
  type ItemKind,
  type Profile,
} from "./schema.ts";
import { child, parseXml, type XmlElement } from "./xml.ts";

export type IssueCode =
  | "unknown-field"
  | "invalid-value"
  | "rejected-value"
  | "duplicate-field"
  | "unknown-type";

export interface Issue {
  code: IssueCode;
  /** Item position, e.g. `3/0` for the first child of the fourth item; `profile` for Profile.xml. */
  path: string;
  /** Item kind (`Sensor`, `Gauge.Images`...) or `Profile`. */
  kind: string;
  /** The item's Name, when it has one. */
  name?: string;
  field?: string;
  value?: string;
}

const XSI_TYPE = "xsi:type";
const INT32 = /^[+-]?\d+$/;
const UINT32 = /^\+?\d+$/;
const DOUBLE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Converts element text like XmlConvert; undefined when XmlSerializer would throw. */
function convert(spec: FieldSpec<unknown>, raw: string): unknown {
  const t = raw.trim();
  switch (spec.kind) {
    case "int": {
      const n = Number(t);
      return INT32.test(t) && n >= -2147483648 && n <= 2147483647 ? n : undefined;
    }
    case "uint": {
      const n = Number(t);
      return UINT32.test(t) && n <= 4294967295 ? n : undefined;
    }
    case "double":
    case "float": {
      const n = t === "INF" ? Infinity : t === "-INF" ? -Infinity : t === "NaN" ? NaN : DOUBLE.test(t) ? Number(t) : undefined;
      return n === undefined || spec.kind === "double" ? n : Math.fround(n);
    }
    case "bool":
      return t === "true" || t === "1" ? true : t === "false" || t === "0" ? false : undefined;
    case "string":
      return raw;
    case "color":
      return raw.startsWith("#") ? raw : "#" + raw;
    case "enum":
      return spec.values?.includes(t) ? t : undefined;
  }
}

interface Context {
  path: string;
  kind: string;
  issues: Issue[];
}

/**
 * Reads the schema's fields from an element's children. `containers` are
 * child elements the caller handles itself (group children, gauge frames).
 */
function readFields<S extends Record<string, FieldSpec<unknown>>>(
  el: XmlElement,
  schema: S,
  ctx: Context,
  ignored: readonly string[] = [],
  containers: readonly string[] = [],
): Record<string, unknown> & { unknown: Record<string, string> } {
  const out: Record<string, unknown> = {};
  for (const [k, spec] of Object.entries(schema)) out[k] = spec.default;
  const unknown: Record<string, string> = {};
  const seen = new Set<string>();
  const name = child(el, "Name")?.text;
  const report = (code: IssueCode, field: string, value?: string) =>
    ctx.issues.push({ code, path: ctx.path, kind: ctx.kind, ...(name !== undefined && { name }), field, value });

  for (const c of el.children) {
    if (containers.includes(c.name) || ignored.includes(c.name)) continue;
    if (seen.has(c.name)) {
      report("duplicate-field", c.name, c.text);
      continue;
    }
    seen.add(c.name);
    const target = ALIASES[c.name] ?? c.name;
    const spec = Object.hasOwn(schema, target) ? schema[target] : undefined;
    if (!spec) {
      unknown[c.name] = c.text;
      report("unknown-field", c.name, c.text);
      continue;
    }
    const value = convert(spec, c.text);
    if (value === undefined) {
      report("invalid-value", c.name, c.text);
      continue;
    }
    const accepted = spec.accept ? spec.accept(value) : value;
    if (accepted === undefined) {
      report("rejected-value", c.name, c.text);
      continue;
    }
    out[target] = accepted;
  }
  return { ...out, unknown };
}

function readItem(el: XmlElement, path: string, issues: Issue[]): DisplayItem | null {
  const type = el.attrs[XSI_TYPE] ?? "";
  const kind = type.endsWith("DisplayItem") ? type.slice(0, -"DisplayItem".length) : "";
  if (!Object.hasOwn(SCHEMAS, kind)) {
    issues.push({ code: "unknown-type", path, kind: type || el.name, value: type });
    return null;
  }
  const k = kind as ItemKind;
  const ctx = { path, kind: k, issues };

  if (k === "Group") {
    const fields = readFields(el, SCHEMAS.Group, ctx, IGNORED.Group, ["DisplayItems"]);
    const kids = child(el, "DisplayItems")?.children ?? [];
    return { kind: k, ...fields, DisplayItems: readItems(kids, path + "/", issues) } as DisplayItem;
  }
  if (k === "Gauge") {
    const fields = readFields(el, SCHEMAS.Gauge, ctx, IGNORED.Gauge, ["Images"]);
    const frames = (child(el, "Images")?.children ?? []).map((f, i): ImageItem => {
      const frameCtx = { path: `${path}/${i}`, kind: "Gauge.Images", issues };
      return { kind: "Image", ...readFields(f, SCHEMAS.Image, frameCtx, IGNORED.Image) } as ImageItem;
    });
    return { kind: k, ...fields, Images: frames } as DisplayItem;
  }
  return { kind: k, ...readFields(el, SCHEMAS[k], ctx, IGNORED[k]) } as DisplayItem;
}

function readItems(elements: XmlElement[], prefix: string, issues: Issue[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  elements.forEach((el, i) => {
    const item = readItem(el, prefix + i, issues);
    if (item) items.push(item);
  });
  return items;
}

export function parseProfileXml(text: string): { profile: Profile; issues: Issue[] } {
  const issues: Issue[] = [];
  const root = parseXml(text);
  const fields = readFields(root, PROFILE, { path: "profile", kind: "Profile", issues }, IGNORED.Profile);
  return { profile: fields as unknown as Profile, issues };
}

export function parseDisplayItemsXml(text: string): { items: DisplayItem[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const root = parseXml(text);
  return { items: readItems(root.children, "", issues), issues };
}

/** Depth-first walk over items and group children, in draw order. */
export function* walkItems(items: DisplayItem[], depth = 0): Generator<{ item: DisplayItem; depth: number }> {
  for (const item of items) {
    yield { item, depth };
    if (item.kind === "Group") yield* walkItems(item.DisplayItems, depth + 1);
  }
}
