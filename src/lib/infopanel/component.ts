/**
 * Components: a piece of an InfoPanel profile saved for reuse. A component is a v1 stored canvas
 * (`infopanel-canvas`) whose size is the bounds of the saved selection: the items re-based to (0,0),
 * only the files they use, the profile's palette (its used slots are what placing maps), and the
 * role of each sensor where `ROLES` knows it, kept apart in the Library item's meta by binding group.
 *
 * Placing one in the editor merges its items at a point (`withComponent`): moved, cloned (no item
 * is shared with the component), files merged by hash once, palette slots mapped onto the target's
 * palette, and drawn in front. Placing one in Design makes a canvas zone of its own identity.
 * Items carry no ids of their own in this model, so a "fresh id" is the clone plus a new profile Guid.
 */
import { assetKey, type AssetType } from "./assets/assets.ts";
import { bindItem, editItems, storeItems, withAsset, withGroupKeys, type DropPlace, type DroppedFile } from "./canvas-edit.ts";
import { openCanvas } from "./canvas.ts";
import { mapItems } from "./editor/bind.ts";
import { roughSize } from "./editor/create.ts";
import { isManaged } from "./editor/groups.ts";
import { itemAt, moveBy, topmost, type Box, type Path } from "./editor/ops.ts";
import { recolour, syncElements } from "./elements/apply.ts";
import { defaultPalette, type Palette, type Slot } from "./elements/palette.ts";
import { elementOf, mapInks } from "./elements/spec.ts";
import { newStored, remapKeys, type StoredCanvas } from "./import/stored.ts";
import { buildCatalog, bindingRef, isBound, type BoundItem, type DataApiValue } from "./sensors.ts";
import { groupBindings, groupId, indexCatalog, resolveAll } from "./remap/remap.ts";
import type { DisplayItem, Profile } from "./schema.ts";
import { ROLES, resolveRole, type Role } from "./templates/roles.ts";
import type { ComponentRoles } from "../my-library/component-meta.ts";

const SCALED = new Set(["Image", "HttpImage", "SensorImage", "Gauge"]);
const parentOf = (p: Path) => p.split(".").slice(0, -1).join(".");

/** The paths to save, in tree order: the topmost selected, each lifted to the managed element (Row, Drives …) it is a part of, so those are saved whole. */
export function componentPaths(items: readonly DisplayItem[], selection: readonly Path[]): Path[] {
  const lifted = topmost(selection).map((path) => {
    let at = path;
    for (let p = parentOf(path); p !== ""; p = parentOf(p)) if (isManaged(itemAt(items, p))) at = p;
    return at;
  });
  // Tree order, not the order they were clicked in: that is the draw order the component keeps.
  return topmost(lifted).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function union(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

/** An item's drawn box: the measured one, else its own geometry (a group is its children's union). */
function boxOf(item: DisplayItem, path: Path, measured: Readonly<Record<Path, Box>>, fontScale: number): Box | null {
  if (measured[path]) return measured[path];
  if (item.kind === "Group") return union(item.DisplayItems.flatMap((c, i) => boxOf(c, `${path}.${i}`, measured, fontScale) ?? []));
  const { width, height } = roughSize(item, fontScale);
  const k = SCALED.has(item.kind) && "Scale" in item && item.Scale > 0 ? item.Scale / 100 : 1;
  return { x: item.X, y: item.Y, width: width * k, height: height * k };
}

/** The slots the items follow: by field (`slots`) and by the inks of their element specs. */
export function usedSlots(items: readonly DisplayItem[]): Slot[] {
  const used = new Set<Slot>();
  mapItems(items, (item) => {
    for (const ref of Object.values((item as { slots?: Record<string, { slot: Slot }> }).slots ?? {})) used.add(ref.slot);
    const spec = elementOf(item);
    if (spec) mapInks(spec, (ink) => (ink.slot && used.add(ink.slot), ink));
    return item;
  });
  return [...used];
}

/** The role a bound item reads, found by running the role rules over the item's own binding; null when none matches. */
export function roleOfItem(item: BoundItem): Role | null {
  const probe = { probe: { name: item.SensorName, ref: bindingRef(item) ?? undefined, unit: "Unit" in item ? (item.Unit as string) : undefined } };
  return ROLES.find((role) => resolveRole(role, probe)) ?? null;
}

/** Every binding group's role that is known, by group id. */
export function rolesOfItems(items: readonly DisplayItem[]): ComponentRoles {
  const out: ComponentRoles = {};
  for (const g of groupBindings([...items])) {
    const role = roleOfItem(g.item);
    if (role) out[g.id] = role;
  }
  return out;
}

export interface SavedComponent {
  stored: StoredCanvas;
  roles: ComponentRoles;
}

export interface SaveInput {
  stored: StoredCanvas;
  profile: Profile;
  /** The editor's items (carrying their `$import` records). */
  items: readonly DisplayItem[];
  selection: readonly Path[];
  /** The edit layer's measured boxes of the selection (text sizes itself). */
  boxes?: Readonly<Record<Path, Box>>;
  name: string;
  palette?: Palette;
  now?: Date;
}

/** A component from a selection: null when nothing is selected. */
export function saveComponent(input: SaveInput): SavedComponent | null {
  const { stored, profile, items, name } = input;
  const paths = componentPaths(items, input.selection);
  const picked = paths.flatMap((p) => itemAt(items, p) ?? []);
  const bounds = union(paths.flatMap((p) => boxOf(itemAt(items, p)!, p, input.boxes ?? {}, profile.FontScale) ?? []));
  if (!bounds || picked.length === 0) return null;
  const dx = -Math.round(bounds.x);
  const dy = -Math.round(bounds.y);
  const moved = moveBy(structuredClone(picked), picked.map((_, i) => String(i)), dx, dy);
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  // The files the items name, and any a spec names by hash (a Drives tile's icon).
  const json = JSON.stringify(moved);
  const names = new Set<string>();
  JSON.parse(json, (k, v) => (k === "FilePath" && typeof v === "string" ? names.add(assetKey(v)) : v));
  const assets = stored.assets.filter((a) => names.has(assetKey(a.name)) || json.includes(a.hash));
  const base = newStored({ name, width, height, now: input.now });
  const own = { ...profile, Name: name, Guid: crypto.randomUUID(), Width: width, Height: height };
  const made = storeItems({ ...base, assets, palette: input.palette ?? stored.palette ?? defaultPalette(profile) }, own, syncElements(moved));
  return { stored: made, roles: rolesOfItems(moved) };
}

/** A canvas for a component placed as a Design zone: its own identity, so it isn't taken for the Library item. */
export function componentCanvas(component: StoredCanvas, name: string, now: Date = new Date()): StoredCanvas {
  return { ...component, source: { name, origin: "new", importedAt: now.toISOString() }, profile: { ...component.profile, Name: name, Guid: crypto.randomUUID() } };
}

/** The component's items with every file reference renamed (a clashing name got a new one in the target). */
function renameFiles(items: readonly DisplayItem[], names: ReadonlyMap<string, string>): DisplayItem[] {
  const swap = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(swap);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const file = typeof o.file === "string" && typeof o.asset === "string" ? names.get(assetKey(o.file)) : undefined;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, k === "file" && file ? file : swap(x)]));
  };
  return mapItems(items, (item) => {
    const o = item as unknown as Record<string, unknown>;
    const path = typeof o.FilePath === "string" ? names.get(assetKey(o.FilePath)) : undefined;
    const images = item.kind === "Gauge" ? { Images: renameFiles(item.Images, names) } : {};
    return { ...item, ...(path && o.RelativePath === true ? { FilePath: path } : {}), ...images, ...(o.element ? { element: swap(o.element) } : {}) } as DisplayItem;
  });
}

export interface Placed {
  stored: StoredCanvas;
  /** The merged items' paths (top level, in front). */
  paths: Path[];
  /** Role-assisted Remap: groups bound by role, and groups left for the Remap dialog. */
  bound: number;
  open: number;
}

/** The roles a placed component was saved with and the machine's sensors they are looked up in. */
export interface RoleSource {
  roles: ComponentRoles;
  sensors: Readonly<Record<string, DataApiValue>>;
}

/**
 * A component merged into a canvas, centred on `place.at` (or the canvas) and kept on the canvas when it fits:
 * moved and cloned, its files joined once (the same bytes reuse the name already there, a clash gets a new one),
 * its palette slots mapped onto `stored`'s palette. The caller commits it as one step.
 */
export function withComponent(stored: StoredCanvas, profile: Profile, items: readonly DisplayItem[], component: StoredCanvas, place?: DropPlace, source?: RoleSource): Placed {
  const open = openCanvas(component);
  const { Width: w, Height: h } = open.profile;
  const at = place?.at ?? { x: profile.Width / 2, y: profile.Height / 2 };
  const clamp = (v: number, size: number, room: number) => (size >= room ? 0 : Math.min(Math.max(0, v), room - size));
  const box = { x: clamp(Math.round(at.x - w / 2), w, profile.Width), y: clamp(Math.round(at.y - h / 2), h, profile.Height), width: w, height: h };
  const snap = place?.snap?.(box) ?? { dx: 0, dy: 0 };
  const moved = moveBy(editItems(open), editItems(open).map((_, i) => String(i)), box.x + Math.round(snap.dx), box.y + Math.round(snap.dy));

  let assets = stored.assets;
  const names = new Map<string, string>();
  for (const a of component.assets) {
    const file: DroppedFile = { name: a.name, hash: a.hash, type: a.type as AssetType, size: a.size, ...(a.ext ? { ext: a.ext } : {}) };
    const r = withAsset(assets, file);
    assets = r.assets;
    if (r.name !== a.name) names.set(assetKey(a.name), r.name);
  }
  const palette = stored.palette ?? defaultPalette(profile);
  const colours = recolour(names.size ? renameFiles(moved, names) : moved, palette);
  const role = source ? bindByRoles(colours, source.roles, source.sensors) : null;
  const mapped = role?.items ?? colours;
  const next = [...items, ...syncElements(mapped)];
  const first = items.length;
  return { stored: storeItems({ ...stored, assets }, profile, next), paths: mapped.map((_, i) => String(first + i)), bound: role?.bound ?? 0, open: role?.open ?? 0 };
}

export interface RoleBinding {
  items: DisplayItem[];
  /** Groups bound by their role. */
  bound: number;
  /** Groups the catalog doesn't resolve and no role could, left for Remap. */
  open: number;
}

/**
 * Role-assisted Remap for a placed component: each binding group the catalog doesn't resolve takes the sensor its
 * saved role finds on this machine (`resolveRole`); the rest are counted for the Remap dialog. Nothing changes
 * while the Data API has no sensors.
 */
export function bindByRoles(items: readonly DisplayItem[], roles: ComponentRoles, sensors: Readonly<Record<string, DataApiValue>>): RoleBinding {
  const groups = groupBindings([...items]);
  if (Object.keys(sensors).length === 0) return { items: [...items], bound: 0, open: 0 };
  const resolved = resolveAll(groups, indexCatalog(buildCatalog({ ...sensors })), new Map());
  const chosen = new Map<string, NonNullable<ReturnType<typeof resolveRole>>>();
  let open = 0;
  for (const g of groups) {
    if (resolved.get(g.id)) continue;
    const sensor = roles[g.id] ? resolveRole(roles[g.id] as Role, sensors) : undefined;
    if (sensor) chosen.set(g.id, sensor);
    else open++;
  }
  // A group the catalog resolves by itself takes this PC's key, not the one it was saved with.
  const found = new Set(groups.filter((g) => resolved.get(g.id)).map((g) => g.id));
  const keyed = found.size ? withGroupKeys(items, remapKeys(resolved, new Map()), found) : [...items];
  const next = mapItems(keyed, (item) => (isBound(item) && chosen.has(groupId(item)) ? bindItem(item, chosen.get(groupId(item))!) : item));
  return { items: next, bound: chosen.size, open };
}
