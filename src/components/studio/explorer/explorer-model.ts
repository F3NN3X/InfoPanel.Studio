import type { SensorMap } from "@/modules/types";
import {
  formatReading,
  fold,
  searchPoints,
  type DataContainer,
  type DataPoint,
  type DataSource,
  type Health,
  type PointType,
} from "@/lib/data-points";
import type { AlertsConfig } from "@/lib/alerts";
import type { Change } from "@/lib/data-history";
import type { Usage, UsageIndex } from "@/lib/data-usage";
import { offsetsOf, rowAt, stickyBefore, windowRange } from "@/lib/virtual-window";
import { sourcePrefKey, type SourcePref } from "@/lib/layout";
import { spanText } from "../sidebar/data-api-model";

/** Pure filtering, grouping and windowing behind the Data Explorer. */

export type TypeFilter = "all" | "number" | "text" | "image" | "list" | "url";

/** What the tree selected: everything, one source, or one container. */
export type Scope =
  | { kind: "all" }
  | { kind: "source"; id: string }
  | { kind: "container"; id: string; sourceId: string };

export const ALL_SCOPE: Scope = { kind: "all" };

export interface PointFilter {
  scope: Scope;
  query: string;
  type: TypeFilter;
  hideEmpty: boolean;
  inUse: boolean;
  /** The keys something uses (a screen or an alert rule): what the "Only in use" switch keeps. */
  used: ReadonlySet<string>;
}

/** A link to an image, whole or from the server's root: a file name with an image extension, a plugin's image route or a media cover. */
const IMAGE_URL = /^(?:https?:\/\/|\/)\S*(?:\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#]\S*)?$|\/api\/images\/|\/cover(?:[?#/]|$))/i;

/** Whether a point is a link to an image (the table draws a thumbnail, the detail pane the picture). */
export const isImagePoint = (point: DataPoint): boolean => (point.type === "url" || point.type === "text") && IMAGE_URL.test(point.raw.trim());

/** Whether a point's type belongs to the table's type control. */
export function matchesType(point: DataPoint, type: TypeFilter): boolean {
  switch (type) {
    case "all":
      return true;
    case "number":
      return point.type === "number";
    case "text":
      return (point.type === "text" && !isImagePoint(point)) || point.type === "bool";
    case "image":
      return isImagePoint(point);
    case "list":
      return point.type === "list";
    case "url":
      return point.type === "url" && !isImagePoint(point);
  }
}

export function inScope(point: DataPoint, scope: Scope): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "source") return point.sourceId === scope.id;
  return point.containerId === scope.id;
}

/** The table's points: scope, then search, type and the Hide empty / In use chips. */
export function filterPoints(points: readonly DataPoint[], f: PointFilter): DataPoint[] {
  const scoped = points.filter((p) => inScope(p, f.scope));
  return searchPoints(scoped, f.query).filter(
    (p) =>
      matchesType(p, f.type) &&
      (!f.hideEmpty || p.type !== "empty") &&
      (!f.inUse || f.used.has(p.key))
  );
}

/**
 * The tree after the filter field and the health chip: a source stays when
 * its name or one of its containers matches (showing only the matching
 * containers when the name does not), and when its status is the chip's.
 */
export function filterSources(
  sources: readonly DataSource[],
  query: string,
  health: Health | null
): DataSource[] {
  const q = fold(query.trim());
  return sources.flatMap((s) => {
    if (health && s.status !== health) return [];
    if (!q || fold(s.name).includes(q)) return [s];
    const containers = s.containers.filter((c) => fold(c.title).includes(q));
    return containers.length > 0 ? [{ ...s, containers }] : [];
  });
}

/** Row heights of the virtual table (px). */
export const POINT_ROW_H = 52;
export const GROUP_ROW_H = 40;

export type GroupRow = {
  kind: "group";
  id: string;
  /** The source's name. */
  title: string;
  /** The container when the source has several, else "built in" for the built-in sources. */
  sub: string;
  /** Pushed through the API: the row carries a "Pushed" tag. */
  pushed: boolean;
  count: number;
  collapsed: boolean;
};

export type TableRow = GroupRow | { kind: "point"; point: DataPoint };

/** Points in order, each run of one container preceded by a group header row; a collapsed container keeps only its header. */
export function flattenRows(points: readonly DataPoint[], sources: readonly DataSource[], collapsed: ReadonlySet<string>): TableRow[] {
  const counts = new Map<string, number>();
  for (const p of points) counts.set(p.containerId, (counts.get(p.containerId) ?? 0) + 1);
  const rows: TableRow[] = [];
  let current: string | null = null;
  for (const point of points) {
    if (point.containerId !== current) {
      current = point.containerId;
      const source = sources.find((s) => s.id === point.sourceId);
      const container = point.containerTitle.trim();
      const several = (source?.containers.length ?? 1) > 1;
      rows.push({
        kind: "group",
        id: current,
        title: point.sourceName,
        sub: several && container && container !== point.sourceName ? container : source?.category === "Built-in" ? "built in" : "",
        pushed: source?.category === "Pushed via API",
        count: counts.get(current) ?? 0,
        collapsed: collapsed.has(current),
      });
    }
    if (!collapsed.has(current)) rows.push({ kind: "point", point });
  }
  return rows;
}

export const rowHeight = (row: TableRow): number => (row.kind === "group" ? GROUP_ROW_H : POINT_ROW_H);

/** Top offset of every row, plus the total height as the last entry. */
export const rowOffsets = (rows: readonly TableRow[]): number[] => offsetsOf(rows, rowHeight);

export { rowAt, windowRange };

/** Index of the group header governing the row at `index` (-1 before the first). */
export const stickyIndex = (rows: readonly TableRow[], index: number): number => stickyBefore(rows, index, (r) => r.kind === "group");

/** The containers of a source or the whole tree, for the group summary. */
export function scopeContainers(sources: readonly DataSource[], scope: Scope): DataContainer[] {
  if (scope.kind === "all") return sources.flatMap((s) => s.containers);
  if (scope.kind === "source") return sources.find((s) => s.id === scope.id)?.containers ?? [];
  return sources.flatMap((s) => s.containers).filter((c) => c.id === scope.id);
}

/** The longest dotted key prefix shared by the points ("" for everything), for a group stream URL. */
export function streamPrefix(points: readonly DataPoint[]): string {
  if (points.length === 0) return "";
  const first = points[0].key;
  let end = first.length;
  for (const p of points) {
    let i = 0;
    while (i < end && p.key[i] === first[i]) i++;
    end = i;
  }
  const common = first.slice(0, end);
  const dot = common.lastIndexOf(".");
  return dot >= 0 ? common.slice(0, dot + 1) : common;
}

/** The value to show for a point: the live reading when the stream has one, else the snapshot's. */
export function displayValue(point: DataPoint, values: SensorMap): string {
  const live = values[point.key];
  if (!live) return point.raw;
  if (typeof live.value === "number") return formatReading(live.value, live.unit);
  return live.text?.trim() || point.raw;
}

/** The unrounded reading, for copying ("-24.799999237060547 dB"). */
export function rawValue(point: DataPoint, values: SensorMap): string {
  const live = values[point.key];
  if (typeof live?.value === "number") return live.unit ? `${live.value} ${live.unit}` : String(live.value);
  return live?.text?.trim() || point.raw;
}

/** The type shown on the inspector's value card. */
export const TYPE_LABEL: Record<PointType, string> = {
  number: "Number",
  text: "Text",
  bool: "Boolean",
  url: "URL",
  list: "List / JSON",
  empty: "Empty",
};

/** The stream route for one key, as the inspector shows and copies it. */
export const streamPath = (key: string): string => `/events?prefix=${encodeURIComponent(key)}&interval=1000`;

export type ValueTone = "number" | "text" | "empty";

/** A reading split into its number and unit ("26.2 °C"), or null for anything else. */
export function splitNumber(text: string): { num: string; unit: string } | null {
  const m = /^(-?[\d.,]+)\s+(\S.*)$/.exec(text);
  return m ? { num: m[1], unit: m[2] } : null;
}

/** The table's live-value cell: the first line (with " …" when more follow), and how to colour it. */
export function valueCell(point: DataPoint, values: SensorMap): { text: string; tone: ValueTone } {
  if (isImagePoint(point)) return { text: "image", tone: "text" };
  const full = displayValue(point, values);
  const lines = full.split("\n");
  const first = lines[0].trim();
  if (first === "" || (point.type === "empty" && !(point.key in values))) return { text: "empty", tone: "empty" };
  return { text: lines.length > 1 ? `${first} …` : first, tone: point.type === "number" ? "number" : "text" };
}

/** The widget's own name: the part of a usage label after "Panel › ". */
export const usageName = (usage: Usage): string => usage.label.split(" › ").at(-1) ?? usage.label;

/** A zone a point can be bound to; panel zones list their bindable widgets. */
export interface BindZone {
  id: string;
  title: string;
  widgets?: { id: string; label: string }[];
}

/** One choice of the "Bind to" select: a widget zone, or one widget of a panel zone. */
export interface BindOption {
  zoneId: string;
  widgetId?: string;
  label: string;
}

/** Every place a point can be bound, in layout order. */
export function bindOptions(zones: readonly BindZone[]): BindOption[] {
  return zones.flatMap((z): BindOption[] =>
    z.widgets
      ? z.widgets.map((w) => ({ zoneId: z.id, widgetId: w.id, label: `${z.title} › ${w.label}` }))
      : [{ zoneId: z.id, label: z.title }]
  );
}

/**
 * The binding target: the user's choice while it still exists, else a widget
 * of the selected canvas zone, else the first option (null when nothing can be bound).
 */
export function resolveBindTarget(
  options: readonly BindOption[],
  chosen: Pick<BindOption, "zoneId" | "widgetId"> | null,
  selectedZoneId: string | null
): BindOption | null {
  const same = (o: BindOption) => o.zoneId === chosen?.zoneId && o.widgetId === chosen?.widgetId;
  return (
    (chosen && options.find(same)) ||
    (selectedZoneId !== null ? options.find((o) => o.zoneId === selectedZoneId) : undefined) ||
    options[0] ||
    null
  );
}

/** Whether the point's usages include the target. */
export function isBoundTo(usedBy: readonly Usage[], target: BindOption | null): boolean {
  return (
    target !== null &&
    usedBy.some((u) => u.zoneId === target.zoneId && (target.widgetId === undefined || u.panelWidgetId === target.widgetId))
  );
}

/** The group summary's title and subtitle for a scope. */
export function summaryHeading(scope: Scope, sources: readonly DataSource[]): { title: string; sub: string } {
  if (scope.kind === "all") return { title: "All data points", sub: `${sources.length} sources` };
  const source = sources.find((s) => s.id === (scope.kind === "source" ? scope.id : scope.sourceId));
  if (!source) return { title: "", sub: "" };
  const container = scope.kind === "container" ? source.containers.find((c) => c.id === scope.id) : undefined;
  if (container && source.containers.length > 1) return { title: container.title, sub: source.name };
  const n = source.containers.length;
  return { title: source.name, sub: `${source.category} · ${n} group${n === 1 ? "" : "s"}` };
}

/** The group summary's callout: only for a source or container showing nothing useful. */
export function scopeNote(scope: Scope, sources: readonly DataSource[]): { health: Health; text: string } | null {
  if (scope.kind === "all") return null;
  const source = sources.find((s) => s.id === (scope.kind === "source" ? scope.id : scope.sourceId));
  if (!source) return null;
  if (scope.kind === "container" && source.containers.length > 1) {
    const container = source.containers.find((c) => c.id === scope.id);
    return container?.status === "warn" ? { health: "warn", text: "Every value in this group is empty or zero." } : null;
  }
  if (source.status === "warn") {
    return { health: "warn", text: "Every value from this source is empty or zero — check the plugin settings or API key." };
  }
  return source.status === "off" ? { health: "off", text: "This source has no data points right now." } : null;
}

/** The group summary's stat rows for the points of a scope. */
export function scopeStats(
  points: readonly DataPoint[],
  values: SensorMap,
  usage: UsageIndex
): { label: string; value: number }[] {
  const numeric = points.filter((p) => p.type === "number");
  return [
    { label: "Data points", value: points.length },
    { label: "Numeric", value: numeric.length },
    { label: "Live-updating", value: numeric.filter((p) => p.key in values).length },
    { label: "Empty", value: points.filter((p) => p.type === "empty").length },
    { label: "Used in layout", value: points.filter((p) => usage.byKey.has(p.key)).length },
  ];
}

/**
 * The preference key a tree row edits: a plugin's container (its source row when it has just one), or
 * any other source as a whole. A row that edits none (a container of a built-in source) is null.
 */
export function prefKeyOf(s: DataSource, c?: DataContainer): string | null {
  if (s.category !== "Plugins") return c ? null : sourcePrefKey(s.id, "");
  const container = c ?? (s.containers.length === 1 ? s.containers[0] : undefined);
  return container ? sourcePrefKey(s.id, container.id.slice(s.id.length + 1)) : null;
}

/**
 * The display name a point row edits (SPEC §10.2, PLAN decision 8): the one of its source container
 * (a plugin) or its source, shown on every row of that group. `name` is what it falls back to.
 */
export function pointDisplayName(
  sources: readonly DataSource[],
  point: DataPoint,
  prefs: Record<string, SourcePref> | undefined
): { key: string; value: string; name: string } | null {
  const source = sources.find((s) => s.id === point.sourceId);
  if (!source) return null;
  const plugin = source.category === "Plugins";
  const key = prefKeyOf(source, plugin ? source.containers.find((c) => c.id === point.containerId) : undefined);
  if (!key) return null;
  const name = plugin ? point.containerTitle : source.name;
  return { key, value: prefs?.[key]?.displayName ?? "", name };
}

/** What a row's "Used in" cell shows: up to two chips (the alert first), then how many more, and the full list for its tooltip. */
export function usedInChips(screens: readonly string[] | undefined, alerts: readonly { name: string }[] | undefined): { chips: string[]; more: number; title: string } {
  const all = [...(alerts?.length ? ["Alert"] : []), ...(screens ?? [])];
  const title = [...(alerts ?? []).map((a) => `Alert: ${a.name}`), ...(screens ?? [])].join(", ");
  return { chips: all.slice(0, 2), more: Math.max(0, all.length - 2), title };
}

/** The alert rules that watch each key (a sensor rule's conditions), by key. Notification rules watch no key. */
export function alertsByKey(alerts: AlertsConfig | undefined): Map<string, { id: string; name: string }[]> {
  const byKey = new Map<string, { id: string; name: string }[]>();
  for (const rule of alerts?.rules ?? []) {
    if (rule.source.kind !== "sensor") continue;
    for (const key of new Set(rule.source.conditions.map((c) => c.key))) {
      byKey.set(key, [...(byKey.get(key) ?? []), { id: rule.id, name: rule.name }]);
    }
  }
  return byKey;
}

/** The keys any screen or alert rule uses. */
export function usedKeys(screens: ReadonlyMap<string, unknown>, alerts: ReadonlyMap<string, unknown>): Set<string> {
  return new Set([...screens.keys(), ...alerts.keys()]);
}

/** How long ago, as the rows read it: "now" under 5 s, else "12 s ago". */
export const agoText = (at: number, now: number): string => (now - at < 5000 ? "now" : `${spanText(now - at)} ago`);

/**
 * A text, link or image point's "Last 60 s" cell: when its value last changed, or "unchanged" while this page has seen
 * no change (the Data API keeps no history, so only what the page watched is known).
 */
export function changedText(changes: readonly Change[], now: number): string {
  return changes.length >= 2 ? `changed ${agoText(changes[changes.length - 1].at, now)}` : "unchanged";
}
