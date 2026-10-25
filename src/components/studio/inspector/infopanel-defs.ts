/**
 * InfoPanel item kinds in the inspector registry (A5): each kind's fields, from the InfoPanel
 * schema tables (`src/lib/infopanel/editor/registry.ts`), as the studio's settings, grouped as
 * the registry groups them. No panel is written per kind.
 */
import { checkValue, fieldsOf, valueOf, type FieldDef } from "@/lib/infopanel/editor/registry";
import { cssColor } from "@/lib/infopanel/render/color";
import type { DisplayItem, ItemKind } from "@/lib/infopanel/schema";
import type { ModuleSetting, ModuleSettings, ModuleSettingValue } from "@/modules/types";

/** A group of an item kind's fields, as one inspector section. */
export interface IpGroup {
  id: string;
  title: string;
  defs: ModuleSetting[];
  advanced: boolean;
}

/** The Position section's grid (the rest of the Position group are rows under it). */
export const GRID_FIELDS = new Set(["X", "Y", "Width", "Height", "Rotation", "FlipX"]);
/** The raw binding apart from the Sensor section (the dropdown, Remap): last, and collapsed. */
const ADVANCED = new Set(["Sensor", "Other"]);
const TITLES: Record<string, string> = { Sensor: "Binding details" };
/** The binding ids the sensor dropdown writes: shown read-only under Binding details, never typed. */
export const BINDING_IDS = ["SensorType", "HwInfoRemoteIndex", "Id", "Instance", "EntryId", "LibreSensorId", "PluginSensorId"] as const;

const toSetting = (d: FieldDef): ModuleSetting => {
  const base = { key: d.name, label: d.label, keywords: [d.name] };
  switch (d.spec.kind) {
    case "bool":
      return { ...base, type: "boolean", default: d.spec.default === true };
    case "enum":
      return { ...base, type: "select", default: String(d.spec.default), options: (d.spec.values ?? []).map((v) => ({ value: v, label: v })) };
    case "color":
      return { ...base, type: "color", default: String(d.spec.default) };
    case "int":
    case "uint":
    case "double":
    case "float":
      return { ...base, type: "number", default: Number(d.spec.default) };
    default:
      return { ...base, type: "text", default: d.spec.default == null ? "" : String(d.spec.default) };
  }
};

/**
 * A kind's inspector groups: its fields by registry group, the colours gathered in one
 * "Colours" group (spec §7), the position grid's fields left to the Position section.
 */
export function ipGroups(kind: ItemKind): IpGroup[] {
  const fields = fieldsOf(kind).filter((d) => !GRID_FIELDS.has(d.name));
  // The glow's colour stays with its radius in the Glow section.
  const isColour = (d: FieldDef) => d.spec.kind === "color" && d.group !== "Glow";
  const colours = fields.filter(isColour);
  const rest = fields.filter((d) => !isColour(d) && !(BINDING_IDS as readonly string[]).includes(d.name));
  const groups = [...new Set(rest.map((d) => d.group))].map(
    (g): IpGroup => ({ id: `ip-${g.toLowerCase()}`, title: TITLES[g] ?? g, defs: rest.filter((d) => d.group === g).map(toSetting), advanced: ADVANCED.has(g) }),
  );
  if (colours.length) groups.push({ id: "ip-colours", title: "Colours", defs: colours.map(toSetting), advanced: false });
  // The kind's own groups first after Item, the raw binding last.
  return groups.sort((a, b) => Number(a.advanced) - Number(b.advanced));
}

/* ---- values ---- */

/** "#AARRGGBB" → "#rrggbb" for the colour control (alpha is kept on write, see `fromCss`). */
export function toCss(c: string): string {
  const css = cssColor(c);
  const m = css && /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css);
  return m ? "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : "";
}

/** The control's "#rrggbb" back to InfoPanel's "#AARRGGBB", keeping the old alpha. */
export function fromCss(rgb: string, old: string): string {
  const hex = old.replace("#", "");
  const alpha = hex.length === 8 ? hex.slice(0, 2) : "FF";
  return ("#" + alpha + rgb.replace("#", "")).toUpperCase();
}

const shownOf = (def: ModuleSetting, v: unknown): ModuleSettingValue =>
  def.type === "color" ? toCss(String(v ?? "")) : typeof v === "number" || typeof v === "boolean" ? v : v == null ? "" : String(v);

/** What a field row shows for an item. */
export const ipShown = (item: DisplayItem, def: ModuleSetting): ModuleSettingValue => shownOf(def, valueOf(item, def.key));

/** The fields that differ from the kind's InfoPanel defaults: the "set here" dots and Changed counts. */
export function ipOwn(item: DisplayItem, groups: readonly IpGroup[]): ModuleSettings {
  const out: ModuleSettings = {};
  for (const g of groups) {
    for (const d of g.defs) {
      const v = valueOf(item, d.key);
      if (v !== null && v !== undefined && v !== d.default) out[d.key] = shownOf(d, v);
    }
  }
  return out;
}

/**
 * A row's new value as InfoPanel stores it (through the setter checks), or why it is refused.
 * A colour comes back from the control as "#rrggbb" and keeps the item's alpha.
 */
export function ipValue(item: DisplayItem, field: string, value: ModuleSettingValue): { ok: true; value: unknown } | { ok: false; reason: string } {
  const def = fieldsOf(item.kind as ItemKind).find((d) => d.name === field);
  if (!def) return { ok: false, reason: "not a field of this item" };
  const input = def.spec.kind === "color" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? fromCss(value, String(valueOf(item, field) ?? "")) : value;
  const r = checkValue(def.spec, input);
  return r.ok ? r : { ok: false, reason: `InfoPanel needs ${def.label} as ${r.reason}. The value isn’t stored.` };
}

/** A field back at its InfoPanel default. */
export function ipDefault(item: DisplayItem, field: string): unknown {
  return fieldsOf(item.kind as ItemKind).find((d) => d.name === field)?.spec.default;
}
