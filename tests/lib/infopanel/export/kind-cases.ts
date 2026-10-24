/**
 * Items and profiles with every field set to a valid, non-default value: the input of the per-kind export test
 * (kinds.test.ts) and of the import-check script (lab/infopanel/scripts/import-check.mts), which hands the same files
 * to InfoPanel's own reader. Relative imports and no TypeScript-only syntax beyond types, because Node runs it directly.
 */
import { checkValue } from "../../../../src/lib/infopanel/editor/registry.ts";
import { defaultItem, PROFILE, SCHEMAS } from "../../../../src/lib/infopanel/schema.ts";
import type { DisplayItem, FieldSpec, GaugeItem, GroupItem, ImageItem, ItemKind, Profile } from "../../../../src/lib/infopanel/schema.ts";

export const KINDS = Object.keys(SCHEMAS) as ItemKind[];

/** Fields whose setter has no second value (HttpImage's Type is always URL). */
export const FIXED_FIELDS: readonly string[] = ["HttpImage.Type"];

/** Readable values where a bare marker would be nonsense to InfoPanel. */
const STRINGS: Record<string, string> = {
  Font: "Fira Sans",
  FontStyle: "Bold Italic",
  GlowBlendMode: "Screen",
  Format: "yyyy-MM-dd HH:mm",
  Unit: "°C",
  LibreSensorId: "/intelcpu/0/load/0",
  PluginSensorId: "/InfoPanel.Extras/procs/table",
  TableFormat: "0:12|1:8|2:20",
  FilePath: "pic & more.png",
  RtspUrl: "rtsp://cam.local/stream",
  HttpUrl: "https://example.com/a.png",
};

/** A valid value the field's default is not, or undefined when the setter leaves no other. */
export function otherValue(kind: string, name: string, spec: FieldSpec<unknown>): unknown {
  const d = spec.default;
  const candidates: unknown[] = (() => {
    switch (spec.kind) {
      case "int":
        return [(d as number) + 7, (d as number) - 7, 42];
      case "uint":
        return [4026535920];
      case "double":
        return [(d as number) + 2.5, (d as number) - 2.5];
      case "float":
        return [Math.fround((d as number) + 0.25)];
      case "bool":
        return [!d];
      case "color":
        return ["#FF2468AC", "#802468AC"];
      case "enum":
        return (spec.values ?? []).filter((v) => v !== d);
      default:
        return [STRINGS[name] ?? `${kind}.${name} & <é>`];
    }
  })();
  return candidates.find((v) => {
    // Only a setter check can refuse a value (the editor's own 2^31 limit would turn away a uint).
    const checked = spec.accept ? checkValue(spec, v) : { ok: true as const, value: v };
    return checked.ok && checked.value === v && v !== d;
  });
}

const specsOf = (schema: unknown) => Object.entries(schema as Record<string, FieldSpec<unknown>>);

/** The fields of a schema, every one non-default (bar `FIXED_FIELDS`). */
function allFields(kind: string, schema: unknown): Record<string, unknown> {
  return Object.fromEntries(
    specsOf(schema).map(([name, spec]) => {
      const v = otherValue(kind, name, spec);
      if (v === undefined && !FIXED_FIELDS.includes(`${kind}.${name}`)) throw new Error(`no non-default value for ${kind}.${name}`);
      return [name, v === undefined ? spec.default : v];
    }),
  );
}

const unknown = (tag: string) => ({ [`Future${tag}`]: `7 & ${tag}` });

/** An item of `kind` with every field set, no children. */
export function fullItem(kind: ItemKind): DisplayItem {
  return { ...defaultItem(kind), ...allFields(kind, SCHEMAS[kind]), unknown: unknown(kind) } as DisplayItem;
}

/** A frame of a gauge: an Image with every field set. */
export function fullFrame(n: number): ImageItem {
  return { ...(fullItem("Image") as ImageItem), Name: `frame ${n}`, FilePath: `frame-${String(n).padStart(3, "0")}.png`, unknown: unknown(`Frame${n}`) };
}

/** The kind with its children: a group holding a Text and a Bar, a gauge holding three frames. */
export function withChildren(kind: ItemKind): DisplayItem {
  const item = fullItem(kind);
  if (kind === "Group") return { ...(item as GroupItem), DisplayItems: [fullItem("Text"), fullItem("Bar")] };
  if (kind === "Gauge") return { ...(item as GaugeItem), Images: [0, 1, 2].map(fullFrame) };
  return item;
}

/** Every profile field set (the unused `TargetWindow` aside), plus a field this build does not know. */
export function fullProfile(): Profile {
  return { ...Object.fromEntries(specsOf(PROFILE).map(([name, spec]) => [name, otherValue("Profile", name, spec) ?? spec.default])), Guid: "11111111-2222-3333-4444-555555555555", unknown: unknown("Profile") } as unknown as Profile;
}

/** The asset names a tree's images name, so a fixture can carry files for them. */
export function assetNames(items: readonly DisplayItem[]): string[] {
  const names = new Set<string>();
  const walk = (list: readonly DisplayItem[]) => {
    for (const item of list) {
      if ("FilePath" in item && item.FilePath) names.add(item.FilePath);
      if (item.kind === "Group") walk(item.DisplayItems);
      if (item.kind === "Gauge") walk(item.Images);
    }
  };
  walk(items);
  return [...names];
}

/** A 1×1 PNG. */
export const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

/** A group and a gauge with nothing in them: InfoPanel writes both as `<X />`. */
export const EMPTY_LISTS = "Kinds-empty";

/** One fixture per kind, one with all of them and one with empty lists. Every image names a file the fixture carries. */
export function fixtures(): { name: string; profile: Profile; items: DisplayItem[]; assets: { name: string; bytes: Uint8Array }[] }[] {
  const profile = { ...fullProfile() };
  const make = (name: string, items: DisplayItem[]) => ({ name, profile: { ...profile, Name: name }, items, assets: assetNames(items).map((n) => ({ name: n, bytes: PNG })) });
  const empty = [{ ...fullItem("Group"), DisplayItems: [] }, { ...fullItem("Gauge"), Images: [] }] as DisplayItem[];
  return [...KINDS.map((kind) => make(`Kind-${kind}`, [withChildren(kind)])), make("Kinds-mixed", KINDS.map(withChildren)), make(EMPTY_LISTS, empty)];
}
