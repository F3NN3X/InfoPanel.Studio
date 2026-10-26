/**
 * A Studio widget on a Free page (one-editor SPEC §3.3): an InfoPanel `Image` item, its box, carrying the widget's
 * record under `$.widget` (import/stored.ts). It sits in the canvas's items, so z-order, groups, lock, hide, align and
 * snap are the canvas editor's own; the kiosk and the editor draw the registry widget at its box (native.tsx), and an
 * InfoPanel export turns it into items by its `onInfoPanel` rule or leaves it out (`withoutWidgets`).
 */
import { assetKey, type AssetFile, type AssetTable } from "../assets/assets.ts";
import { defaultItem, type DisplayItem } from "../schema.ts";
import { isWidgetItem, widgetBox, widgetOf, type WidgetItem } from "../import/stored.ts";
import { choicesFor, tierOf, type NativeChoice } from "./tiers.ts";
import type { Rect } from "./items.ts";

export type { WidgetItem };
export { isWidgetItem, widgetBox, widgetOf };

/** PANEL_ID (lib/layout.ts), kept here so Node scripts don't load the config model. */
export const WIDGET_PANEL = "panel";

/** A new widget item at `box` (px on the canvas), named `name`. */
export function newWidgetItem(widget: WidgetItem, box: Rect, name: string): DisplayItem {
  return {
    ...defaultItem("Image"),
    Name: name,
    X: Math.round(box.x),
    Y: Math.round(box.y),
    Width: Math.max(1, Math.round(box.w)),
    Height: Math.max(1, Math.round(box.h)),
    widget,
  } as DisplayItem;
}

/** The item with its widget record replaced; any other item as it is. */
export function withWidget(item: DisplayItem, widget: WidgetItem): DisplayItem {
  return item.kind === "Image" ? ({ ...item, widget } as DisplayItem) : item;
}

/** A widget's export rule: its own choice when its tier offers it, else the first its tier offers (decision D2). */
export function widgetRule(widget: Pick<WidgetItem, "module" | "onInfoPanel">): NativeChoice {
  if (widget.module === WIDGET_PANEL) return widget.onInfoPanel === "snapshot" || widget.onInfoPanel === "leave" ? widget.onInfoPanel : "recreate";
  const offered = choicesFor(tierOf(widget.module));
  return widget.onInfoPanel && offered.includes(widget.onInfoPanel) ? widget.onInfoPanel : offered[0];
}

/** The choices a widget item offers, its default first. A Panel is rebuilt widget by widget, so it offers all three. */
export const widgetChoices = (module: string): NativeChoice[] => (module === WIDGET_PANEL ? ["recreate", "snapshot", "leave"] : choicesFor(tierOf(module)));

/** Every widget item's path, in tree order (groups included). */
export function widgetPaths(items: readonly DisplayItem[], prefix = ""): string[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    if (isWidgetItem(item)) return [path];
    return item.kind === "Group" ? widgetPaths(item.DisplayItems, path) : [];
  });
}

/**
 * The items with each widget item replaced by what `made` gives for its path (none: left out), in its place, so
 * the z-order holds. Without widget items the same array comes back, so an unedited profile writes the same bytes.
 */
export function replaceWidgets(items: readonly DisplayItem[], made: (item: DisplayItem, path: string) => readonly DisplayItem[], prefix = ""): DisplayItem[] {
  let changed = false;
  const out = items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    if (isWidgetItem(item)) {
      changed = true;
      return [...made(item, path)];
    }
    if (item.kind !== "Group") return [item];
    const kids = replaceWidgets(item.DisplayItems, made, path);
    if (kids === item.DisplayItems) return [item];
    changed = true;
    return [{ ...item, DisplayItems: kids } as DisplayItem];
  });
  return changed ? out : (items as DisplayItem[]);
}

/** Every FilePath of `items` (groups included) renamed by `names` (lower case → new name). */
function renamePaths(items: readonly DisplayItem[], names: ReadonlyMap<string, string>): DisplayItem[] {
  return items.map((item) => {
    const o = item as unknown as { FilePath?: string | null };
    const to = typeof o.FilePath === "string" ? names.get(assetKey(o.FilePath)) : undefined;
    const next = (to ? { ...item, FilePath: to } : item) as DisplayItem;
    return next.kind === "Group" ? ({ ...next, DisplayItems: renamePaths(next.DisplayItems, names) } as DisplayItem) : next;
  });
}

/**
 * An export's new picture files joined to the table: the same bytes already there are reused, a name already taken by
 * other bytes gets a free one (`_2`, `_3` …), and the items' FilePaths follow.
 */
export function joinFiles(table: AssetTable, files: readonly AssetFile[], items: readonly DisplayItem[]): { assets: AssetTable; items: DisplayItem[] } {
  const out = new Map(table);
  const names = new Map<string, string>();
  for (const f of files) {
    const same = [...out.values()].find((a) => a.hash === f.hash);
    if (same) {
      if (assetKey(same.name) !== assetKey(f.name)) names.set(assetKey(f.name), same.name);
      continue;
    }
    let name = f.name;
    const dot = f.name.lastIndexOf(".");
    for (let n = 2; out.has(assetKey(name)); n++) name = `${f.name.slice(0, dot)}_${n}${f.name.slice(dot)}`;
    out.set(assetKey(name), { ...f, name });
    if (name !== f.name) names.set(assetKey(f.name), name);
  }
  return { assets: out, items: names.size ? renamePaths(items, names) : [...items] };
}

/** What a widget became on export, in its place: recreate as one Group named after it, a snapshot as its one Image renamed. */
export function placeConverted(made: readonly DisplayItem[], host: DisplayItem, rule: NativeChoice): DisplayItem[] {
  if (made.length === 0) return [];
  const name = host.Name;
  if (rule === "snapshot") return made.map((it) => ({ ...it, Name: name }) as DisplayItem);
  if (made.length === 1 && made[0].kind === "Group") return [{ ...made[0], Name: name } as DisplayItem];
  return [{ ...defaultItem("Group"), Name: name, X: host.X, Y: host.Y, DisplayItems: [...made] } as DisplayItem];
}

/** The items with every widget item left out: what InfoPanel gets when nothing has converted them. */
export const withoutWidgets = (items: readonly DisplayItem[]): DisplayItem[] => replaceWidgets(items, () => []);
