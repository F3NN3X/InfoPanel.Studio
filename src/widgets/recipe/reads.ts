// The keys a recipe placement reads, for its data gate and its subscription (`DashboardModule.readsFor`, the gate the built-ins
// have through their prefixes): every sensor binding in its blocks, and the value of each sensor option (the placement's
// stored one, else the recipe's default). A sensor key that names a device option (`libre.{cpu}_cpu_total`) reads the device the
// placement picked; on Auto it reads by the key's part before the device, as a built-in hardware widget reads its prefix. A Repeat
// over places reads its places' weather (`weather.place.<id>.`, the server's Weather by place) for the places the placement lists;
// a Repeat over devices reads its source's prefixes (`libre.`, and `hwinfo.` for fans), as a hardware widget does.
// A recipe that reads none draws without data.
import type { ModuleSettings } from "@/modules/types";
import { hw } from "../core/data";
import type { Data } from "../core/types";
import type { Binding, Block, Recipe, RecipeDeviceKind } from "./types";
import { DEVICE_SLOT, placesOf } from "./validate";
import { type DeviceSource, isDeviceSource, SOURCE_PREFIXES } from "./sources";
import { placePrefix } from "./weather";

/** The sensor keys bound by name anywhere in the tree (a binding to an option is the option's, read per placement). */
export function boundSensors(recipe: Recipe): string[] {
  const keys = new Set<string>();
  const add = (b: Binding | undefined) => {
    if (b && "sensor" in b) keys.add(b.sensor);
  };
  const walk = (b: Block) => {
    if ("bind" in b) add(b.bind);
    if ("cells" in b) for (const c of b.cells ?? []) add(c);
    if (b.type === "label") for (const p of b.parts ?? []) if ("bind" in p) add(p.bind);
    // a condition on a reading reads it as well (format 2)
    add(b.when?.reading?.bind);
    if ("children" in b) for (const c of b.children) walk(c);
  };
  add(recipe.root.subtitle);
  walk(recipe.root);
  return [...keys];
}

/** The device a placement's device option names: its stored or default id, or with Auto the first of its kind in `data` (none: undefined). */
export function deviceOf(kind: RecipeDeviceKind | undefined, value: unknown, data?: Data): string | undefined {
  const chosen = typeof value === "string" && value !== "auto" && value !== "" ? value : undefined;
  if (chosen || !data) return chosen;
  const found = hw(data);
  return kind === "cpu" ? found.cpu : kind === "gpu" ? found.gpu : kind === "disk" ? found.disks[0] : kind === "adapter" ? found.adapters[0] : undefined;
}

/**
 * A sensor key with its device options filled in (`values`: the placement's option values), and the device id the first one took.
 * A device not known (Auto with no data) leaves the key undefined.
 */
export function expandKey(recipe: Recipe, key: string, values: Record<string, unknown>, data?: Data): { key?: string; device?: string } {
  let device: string | undefined;
  let missing = false;
  const out = key.replace(DEVICE_SLOT, (_, name: string) => {
    const id = deviceOf(recipe.options.find((o) => o.key === name)?.kind, values[name], data);
    device ??= id;
    if (!id) missing = true;
    return id ?? "";
  });
  return missing ? { device } : { key: out, device };
}

/** The place-list options a Repeat over Weather by place runs over. */
export function weatherLists(recipe: Recipe): string[] {
  const out = new Set<string>();
  const walk = (b: Block) => {
    if (b.type === "repeat" && b.source === "weather-by-place" && b.over) out.add(b.over);
    if ("children" in b) for (const c of b.children) walk(c);
  };
  walk(recipe.root);
  return [...out];
}

/** The device sources a recipe's Repeats run over. */
export function deviceSources(recipe: Recipe): DeviceSource[] {
  const out = new Set<DeviceSource>();
  const walk = (b: Block) => {
    if (b.type === "repeat" && isDeviceSource(b.source)) out.add(b.source);
    if ("children" in b) for (const c of b.children) walk(c);
  };
  walk(recipe.root);
  return [...out];
}

/**
 * A placement's keys, sorted: the recipe's bound sensors (a device on Auto by the key's part before it), its sensor options' values,
 * the weather prefix of each place its Repeats run over (the stored list, else the recipe's default, as the renderer reads it), and
 * the prefixes of its Repeats over devices.
 */
export function recipeReads(recipe: Recipe): (saved: ModuleSettings | undefined) => string[] {
  const fixed = boundSensors(recipe);
  const options = recipe.options.filter((o) => o.type === "sensor");
  const picked = recipe.options.filter((o) => o.type === "device");
  const lists = recipe.options.filter((o) => o.type === "place-list" && weatherLists(recipe).includes(o.key));
  const devices = deviceSources(recipe).flatMap((s) => SOURCE_PREFIXES[s]);
  return (saved) => {
    const values = Object.fromEntries(picked.map((o) => [o.key, saved?.[o.key] ?? o.default]));
    const bound = fixed.map((k) => expandKey(recipe, k, values).key ?? k.slice(0, k.indexOf("{")));
    const chosen = options.flatMap((o) => String(saved?.[o.key] ?? o.default ?? "").split(",").filter(Boolean));
    const weather = lists.flatMap((o) => {
      const stored = placesOf(saved?.[o.key]);
      const list = (Array.isArray(stored) ? stored : o.default) as { lat?: unknown; lon?: unknown }[];
      return (Array.isArray(list) ? list : []).flatMap((p) => (typeof p?.lat === "number" && typeof p.lon === "number" ? [placePrefix({ lat: p.lat, lon: p.lon })] : []));
    });
    return [...new Set([...bound, ...chosen, ...weather, ...devices])].sort();
  };
}
