/**
 * A profile template made into a new profile's stored form: the template's items laid out for the
 * size (layout.ts), its palette with the chosen variant, and every sensor item bound to the role's
 * sensor on this machine (roles.ts). A role nothing matches is left unbound, named for the role, so
 * the Remap dialog lists it. The result is checked by `readStored` before it is used.
 */
import { rebound } from "../editor/bind.ts";
import { syncElements } from "../elements/apply.ts";
import { detectCores } from "../elements/cores.ts";
import { elementOf } from "../elements/spec.ts";
import { storeItems } from "../canvas-edit.ts";
import { newStored, readStored, type StoredCanvas } from "../import/stored.ts";
import { walkItems } from "../parse.ts";
import type { DisplayItem, Profile } from "../schema.ts";
import { isBound, type DataApiValue } from "../sensors.ts";
import type { Kit, Template } from "./kit.ts";
import { frameOf, gridFor, tiles } from "./layout.ts";
import { ROLE_INFO, resolveRoles, type Role } from "./roles.ts";

export interface TemplateInput {
  name: string;
  width: number;
  height: number;
  /** A palette variant's id; the template's own palette when absent or unknown. */
  variant?: string;
  /** The live Data API's sensors (empty when it can't be reached). */
  sensors: Readonly<Record<string, DataApiValue>>;
  now?: Date;
}

export interface Instance {
  stored: StoredCanvas;
  /** What couldn't be found on this machine, in plain words ("GPU power", "CPU cores"), in template order. */
  unbound: string[];
}

/** The label the Remap dialog shows for the cores a Cores element couldn't find. */
export const CORES_LABEL = "CPU cores";

type WithImport = DisplayItem & { $import?: { key?: string; via?: string } };

export function instantiate(t: Template, input: TemplateInput): Instance {
  const base = newStored({ name: input.name, width: input.width, height: input.height, now: input.now });
  const profile: Profile = { ...readStored(base).profile, BackgroundColor: t.background, Color: t.color, Font: t.type.family };
  const palette = { ...t.palette, ...(t.variants.find((v) => v.id === input.variant)?.palette ?? {}) };
  const found = resolveRoles(input.sensors);
  const missing = new Set<Role>();
  const kit: Kit = {
    profile,
    palette,
    frame: frameOf(profile.Width, profile.Height),
    type: t.type,
    cores: detectCores(input.sensors),
    bind: (item, role) => {
      if (!isBound(item)) return item;
      const sensor = found.get(role);
      if (!sensor) {
        missing.add(role);
        // No ids: InfoPanel reads nothing, and Remap lists it by the role's name.
        const plain = { ...item, SensorType: "Libre", LibreSensorId: "", SensorName: ROLE_INFO[role].label } as DisplayItem;
        return { ...plain, $import: { via: "unresolved" } } as WithImport;
      }
      // A sensor with a ref binds natively and is found by it again; one without binds for the preview only.
      const next = sensor.ref ? rebound(item, sensor) : ({ ...item, SensorName: sensor.name } as DisplayItem);
      return { ...next, $import: { key: sensor.key, via: sensor.ref ? "exact" : "chosen" } } as WithImport;
    },
  };
  const boxes = tiles(kit.frame, gridFor(t.grids, kit.frame.shape), t.margin, t.gap);
  const items = syncElements([...(t.backdrop?.(kit) ?? []), ...t.tiles.flatMap((tile, i) => tile(kit, boxes[i]))]);
  const stored = storeItems({ ...base, palette }, profile, items);

  const read = readStored(JSON.parse(JSON.stringify(stored)));
  const issues = read.issues.filter((i) => i.code !== "unknown-field");
  if (issues.length) throw new Error(`Template ${t.id} doesn't read back: ${issues.map((i) => `${i.path} ${i.field}`).join(", ")}`);

  const coresMissing = kit.cores.length === 0 && [...walkItems(items)].some(({ item }) => elementOf(item)?.type === "cores");
  const unbound = [...missing].map((r) => ROLE_INFO[r].label);
  return { stored, unbound: coresMissing ? [...unbound, CORES_LABEL] : unbound };
}
