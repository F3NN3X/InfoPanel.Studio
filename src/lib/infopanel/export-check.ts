/**
 * The Export check (one-editor SPEC §7): what happens to each part of a page when it is exported to InfoPanel.
 * One pure function feeds the editor's live check, its badges and the export dialog's report, so they never
 * disagree. A Free page (one canvas filling the screen) lists its InfoPanel items; a grid page lists each zone as
 * a Studio widget at its cell box, each item placement as the item it is, and the items of any free area (canvas zone).
 */
import { BLANK_MODULE, CANVAS_ID, ITEM_ID, PANEL_ID, type MonitorProfile, type Placement, type ProfilePage } from "../layout.ts";
import { openCanvas } from "./canvas.ts";
import { badgeOf, elementOf } from "./elements/apply.ts";
import type { ElementSpec } from "./elements/spec.ts";
import { choicesFor, MODULE_TIERS, tierOf, type NativeChoice } from "./native/tiers.ts";
import { widgetOf, widgetRule } from "./native/widget-item.ts";
import { freeCanvasOf } from "../screens/list.ts";
import { hiddenByGroups } from "../page-model/items-layer.ts";
import type { DisplayItem } from "./schema.ts";
import { newStored, type StoredCanvas } from "./import/stored.ts";

export { freeCanvasOf, madeForInfoPanel } from "../screens/list.ts";

export type CheckStatus = "ok" | "approx" | "pic" | "out";

export interface CheckRow {
  /** The part: an item's path on a Free page, a zone id on a grid page, `zoneId:path` for a free area's item. */
  path: string;
  name: string;
  kind: "widget" | "item";
  status: CheckStatus;
  why: string;
}

export interface ExportCheck {
  rows: CheckRow[];
  counts: Record<CheckStatus, number>;
}

/** The order the check lists groups in: the surprises first. */
export const STATUS_ORDER: readonly CheckStatus[] = ["out", "pic", "approx", "ok"];

/** A status in full (the check's group headers, tooltips) and as the header pill counts it. */
export const STATUS_LABEL: Record<CheckStatus, string> = { ok: "Exports as is", approx: "Approximated", pic: "Becomes a picture", out: "Left out" };
export const STATUS_SHORT: Record<CheckStatus, string> = { ok: "as is", approx: "approximated", pic: "becomes a picture", out: "left out" };

/**
 * The looks Studio draws that InfoPanel can't (§7.3), by the element setting that holds them. A set one makes its
 * item Approximated, names it in the check, and marks its field in the inspector. Letter spacing sits on the item
 * itself (`STUDIO_ONLY_ITEM_FIELDS`); text gradients have no setting yet, so nothing is listed for them.
 */
export interface StudioOnlyField {
  /** The element type and its spec key (the inspector marks the control for it). */
  type: ElementSpec["type"];
  key: string;
  label: string;
  /** The value as the check words it, or null when the look is off. */
  value: (spec: ElementSpec) => string | null;
  /** How the export treats it; "is dropped" unless it says otherwise. */
  fate?: string;
}

export const STUDIO_ONLY_FIELDS: readonly StudioOnlyField[] = [
  {
    type: "card",
    key: "blur",
    label: "Backdrop blur",
    value: (s) => (s.type === "card" && s.blur ? `${s.blur} px` : null),
    fate: "is baked into the card's picture, so values behind it aren't blurred",
  },
  { type: "shadowtext", key: "shadow", label: "Blurred shadow", value: (s) => (s.type === "shadowtext" ? "on" : null), fate: "becomes a sharp copy" },
  { type: "sparkline", key: "gradient", label: "Gradient fill under the graph", value: (s) => (s.type === "sparkline" && s.style === "area" && s.gradient ? "on" : null) },
  { type: "sparkline", key: "dot", label: "End dot", value: (s) => (s.type === "sparkline" && s.dot ? "on" : null) },
];

/** The studio-only looks an item has set (empty for a plain InfoPanel item). */
export function studioOnlyOf(item: DisplayItem): { field: StudioOnlyField; value: string }[] {
  const spec = elementOf(item);
  if (!spec) return [];
  return STUDIO_ONLY_FIELDS.flatMap((field) => {
    const value = field.type === spec.type ? field.value(spec) : null;
    return value === null ? [] : [{ field, value }];
  });
}

/** A studio-only look an InfoPanel item itself holds (its `$` record, not an element's spec), as the check words it. */
export interface StudioOnlyItemField {
  /** The item's field (the inspector marks the control for it). */
  key: "letterSpacing";
  label: string;
  value: (item: DisplayItem) => string | null;
}

export const STUDIO_ONLY_ITEM_FIELDS: readonly StudioOnlyItemField[] = [
  {
    key: "letterSpacing",
    label: "Letter spacing",
    value: (item) => {
      const v = (item as { letterSpacing?: number }).letterSpacing;
      return typeof v === "number" && v !== 0 ? `${v} px` : null;
    },
  },
];

/** The studio-only looks an InfoPanel item holds itself (letter spacing): each set one is dropped on export. */
export function itemLooksOf(item: DisplayItem): { field: StudioOnlyItemField; value: string }[] {
  return STUDIO_ONLY_ITEM_FIELDS.flatMap((field) => {
    const value = field.value(item);
    return value === null ? [] : [{ field, value }];
  });
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One item's status: a studio-only look makes it Approximated; every other item (baked elements too) exports as is. */
export function itemRow(item: DisplayItem, path: string, imported: boolean): CheckRow {
  const name = item.Name || item.kind;
  const badge = badgeOf(item);
  const looks = itemLooksOf(item).map(({ field, value }) => `${field.label} (${value}) is dropped`);
  if (badge?.kind === "approximated") {
    const set = studioOnlyOf(item);
    const why = set.length ? set.map(({ field, value }) => `${field.label} (${value}) ${field.fate ?? "is dropped"}`).join("; ") : sentence(badge.lost.join("; "));
    return { path, name, kind: "item", status: "approx", why: [why, ...looks].join("; ") };
  }
  if (looks.length) return { path, name, kind: "item", status: "approx", why: looks.join("; ") };
  const why = badge ? badge.reason : imported ? "Original InfoPanel item" : `InfoPanel ${item.kind} item`;
  return { path, name, kind: "item", status: "ok", why };
}

/**
 * Rows for a tree of items: a plain group's children each get a row, a studio element (a managed group too) is one
 * part, and a Studio widget item is a widget.
 */
export function itemRows(items: readonly DisplayItem[], imported: boolean, prefix = ""): CheckRow[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    if (item.kind === "Group" && !elementOf(item)) return itemRows(item.DisplayItems, imported, path);
    // A blank zone a switch to Free kept is open space, nothing to export (as on the grid).
    if (widgetOf(item)?.module === BLANK_MODULE) return [];
    return [widgetItemRow(item, path) ?? itemRow(item, path, imported)];
  });
}

/** Whether a canvas came from InfoPanel (a file, the corpus or the installed app), not made here. */
export const isImported = (canvas: Pick<StoredCanvas, "source">): boolean => canvas.source.origin !== "new";

/** A widget's export rule: its choice, else the first its tier offers (decision D2). */
export function widgetChoice(module: string, choice?: NativeChoice): NativeChoice {
  const offered = choicesFor(tierOf(module));
  return choice && offered.includes(choice) ? choice : offered[0];
}

/** A Studio widget's status and why, for its module, its export rule and its settings. */
function widgetStatus(module: string, choice: NativeChoice, settings: Placement["settings"]): Pick<CheckRow, "status" | "why"> {
  if (module === PANEL_ID) {
    if (choice === "leave") return { status: "out", why: "Left out by you" };
    if (choice === "snapshot") return { status: "pic", why: "Snapshot: a still picture" };
    return { status: "ok", why: "Rebuilt as InfoPanel items" };
  }
  const entry = tierOf(module);
  if (choice === "leave") return { status: "out", why: entry.tier === "native-only" ? "Can't be converted" : "Left out by you" };
  if (choice === "snapshot") return { status: "pic", why: "Snapshot: a still picture" };
  if (module === "Clock" && settings?.face !== "analog") return { status: "ok", why: "Becomes an InfoPanel Clock item" };
  return { status: "pic", why: `Recreate: picture of the widget, live values on top${entry.approximated ? `; ${entry.approximated}` : ""}` };
}

/** One grid zone read as a Studio widget at its cell box. */
export function widgetRow(zone: Placement, name: string): CheckRow {
  const base = { path: zone.id, name, kind: "widget" as const };
  if (zone.module === PANEL_ID) return { ...base, ...widgetStatus(PANEL_ID, "recreate", zone.settings) };
  const stored = zone.settings?.$onInfoPanel;
  const choice = widgetChoice(zone.module, typeof stored === "string" ? (stored as NativeChoice) : undefined);
  return { ...base, ...widgetStatus(zone.module, choice, zone.settings) };
}

/** A widget item on a Free page (§3.3), by its `onInfoPanel` rule. */
export function widgetItemRow(item: DisplayItem, path: string): CheckRow | null {
  const widget = widgetOf(item);
  if (!widget) return null;
  const base = { path, name: item.Name || widget.module, kind: "widget" as const };
  // A widget an older or newer build added (§11): kept on save, never exported.
  if (widget.module !== PANEL_ID && !(widget.module in MODULE_TIERS)) return { ...base, status: "out", why: "Not available in this version" };
  return { ...base, ...widgetStatus(widget.module, widgetRule(widget), widget.settings) };
}

/** Counts per status. */
export function countRows(rows: readonly CheckRow[]): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = { ok: 0, approx: 0, pic: 0, out: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

const checkOf = (rows: CheckRow[]): ExportCheck => ({ rows, counts: countRows(rows) });

/** The check for a canvas's items (the export dialog reads its items from the stored form it opened). */
export const checkItems = (items: readonly DisplayItem[], imported: boolean): ExportCheck => checkOf(itemRows(items, imported));

let base: StoredCanvas | null = null;
/** A canvas to read one stored item through (its schema checks), made once. */
const itemBase = (): StoredCanvas => (base ??= newStored({ name: "", width: 1, height: 1, now: new Date(0) }));

/** The Export check of one page of a screen. `nameOf` names a grid zone (the studio's widget names). */
export function exportCheck(
  profile: Pick<MonitorProfile, "cols" | "rows">,
  page: Pick<ProfilePage, "placements"> & Partial<Pick<ProfilePage, "groups">>,
  nameOf: (zone: Placement) => string = (zone) => zone.module,
): ExportCheck {
  const free = freeCanvasOf(profile, page);
  if (free) return free.canvas ? checkItems(openCanvas(free.canvas).items, isImported(free.canvas)) : checkOf([]);
  // A part of a hidden group isn't drawn, so it doesn't export either (as a hidden part).
  const inHidden = hiddenByGroups(page);
  // A part in a page group exports inside an InfoPanel Group named after it (`items-layer.ts` `exportParts`).
  const groupName = new Map((page.groups ?? []).map((g) => [g.id, g.name]));
  const inGroup = (zone: Placement) => (r: CheckRow): CheckRow => {
    const name = zone.groupId === undefined ? undefined : groupName.get(zone.groupId);
    return name === undefined ? r : { ...r, why: `${r.why}; inside the Group ${name}` };
  };
  const rows = page.placements.flatMap((zone): CheckRow[] => {
    if (zone.module === BLANK_MODULE || !zone.visible || inHidden(zone.groupId)) return [];
    // An item placement (v15) exports as the item it is.
    if (zone.module === ITEM_ID) return zone.item ? itemRows(openCanvas({ ...itemBase(), items: [zone.item] }).items, false).map((r) => inGroup(zone)({ ...r, path: zone.id })) : [];
    if (zone.module !== CANVAS_ID) return [inGroup(zone)(widgetRow(zone, nameOf(zone)))];
    if (!zone.canvas) return [];
    return itemRows(openCanvas(zone.canvas).items, isImported(zone.canvas)).map((r) => ({ ...r, path: `${zone.id}:${r.path}` }));
  });
  return checkOf(rows);
}
