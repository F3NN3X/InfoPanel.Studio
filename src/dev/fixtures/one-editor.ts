import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newElement } from "@/lib/infopanel/elements/create";
import { defaultPalette } from "@/lib/infopanel/elements/palette";
import { newItem } from "@/lib/infopanel/editor/create";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { CANVAS_ID, defaultConfig, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import type { Fixture, FixtureName } from "./types";

/*
 * The eight states of the Edit v3 reference (scratchpad handoff "Unified Editor v3", SPEC §18), as today's model holds
 * them. Two screens: "Desk panel" (1024 x 600, 4 x 3, widgets) and "Neon Rig" (800 x 480, 8 x 5, an imported InfoPanel
 * profile on a Free page). What today's model can't hold yet, for the phases that add it:
 *  - groups on a grid page (Gauges, Overlay) and items or elements on a grid page's cells: layersG shows the widgets only;
 *  - an item placed freely over widgets (the Title text of alt and layersG): the grid is full and a free area can't overlap;
 *  - sensor bindings: the items have none, so values read as placeholders, not 54 / 61 / 1240;
 *  - nested groups (the schema keeps a group out of a group): not needed by these states;
 *  - the per-state UI (Add segment, hover card, toast, Alt drag, layer menu): carried on the Fixture, read by later phases.
 */

const NOW = new Date("2026-10-27T00:00:00Z");
const PINK = "#FFFF3EC8";

const zone = (id: string, module: string, cell: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: cell[0], rowStart: cell[1], colSpan: cell[2], rowSpan: cell[3], visible: true, ...extra,
});

/** Desk panel: five widgets on a full 4 x 3 grid, no gap and no padding so the cells match the reference's percentages. */
function deskPanel(madeFor: "studio" | "infopanel"): MonitorProfile {
  const gauge = (id: string, label: string, cell: [number, number, number, number]) =>
    zone(id, "SensorValue", cell, { settings: { display: "gauge", label } });
  const page: ProfilePage = {
    id: "main",
    name: "Main",
    placements: [
      gauge("cpu", "CPU", [1, 1, 2, 2]),
      gauge("gpu", "GPU", [3, 1, 2, 2]),
      zone("clock", "Clock", [1, 3, 1, 1]),
      zone("weather", "Weather", [2, 3, 1, 1]),
      zone("agents", "CodingAgents", [3, 3, 2, 1]),
    ],
  };
  return { id: "desk", name: "Desk panel", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", gap: 0, padding: 0, madeFor, pages: [page] };
}

type Spot = { x: number; y: number; w: number; h: number };
/** A box in the reference's percentages of the 800 x 480 page, in px. */
const box = (x: number, y: number, w: number, h: number): Spot => ({ x: Math.round(x * 8), y: Math.round(y * 4.8), w: Math.round(w * 8), h: Math.round(h * 4.8) });
const at = <T extends DisplayItem>(item: T, name: string, s: Spot): DisplayItem => ({ ...item, Name: name, X: s.x, Y: s.y, Width: s.w, Height: s.h }) as DisplayItem;
const group = (name: string, kids: DisplayItem[]): DisplayItem =>
  ({ ...defaultItem("Group"), Name: name, X: Math.min(...kids.map((k) => k.X as number)), Y: Math.min(...kids.map((k) => k.Y as number)), IsExpanded: true, DisplayItems: kids }) as DisplayItem;

/** The path of the item named `name` in a canvas's items ("2", "3.1"), for a fixture's selection. */
function pathOf(items: readonly DisplayItem[], name: string, prefix = ""): string | undefined {
  for (const [i, item] of items.entries()) {
    const path = prefix === "" ? String(i) : `${prefix}.${i}`;
    if (item.Name === name) return path;
    if (item.kind === "Group") {
      const inside = pathOf(item.DisplayItems, name, path);
      if (inside) return inside;
    }
  }
  return undefined;
}

type Parts = Record<"title" | "clock" | "cpuv" | "cpubar" | "gpuv" | "gpubar" | "graph" | "gauge" | "card" | "weather", DisplayItem>;

function neonParts(): { profile: ReturnType<typeof readStored>["profile"]; base: StoredCanvas; parts: Parts } {
  const base = newStored({ name: "Neon Rig", width: 800, height: 480, now: NOW });
  const { profile } = readStored(base);
  const palette = defaultPalette(profile);
  const make = (kind: Parameters<typeof newItem>[0]) => newItem(kind, profile, palette);
  const text = (name: string, s: Spot, color: string) => ({ ...at(make("Text"), name, s), Color: color, FontSize: 30, Bold: true }) as DisplayItem;
  const parts: Parts = {
    // Letter spacing is studio-only (v15 `$.letterSpacing`): the Export check reads it as approximated.
    title: { ...text("NEON RIG", box(4, 5, 44, 11), PINK), letterSpacing: 5 } as unknown as DisplayItem,
    clock: at({ ...make("Clock"), Format: "HH:mm" } as DisplayItem, "Clock", box(68, 5, 28, 11)),
    cpuv: at(make("Sensor"), "CPU temp", box(4, 20, 28, 20)),
    cpubar: at(make("Bar"), "CPU bar", box(4, 43, 28, 4)),
    gpuv: at(make("Sensor"), "GPU temp", box(36, 20, 28, 20)),
    gpubar: at(make("Bar"), "GPU bar", box(36, 43, 28, 4)),
    graph: at(make("Graph"), "CPU load", box(4, 54, 60, 38)),
    gauge: at(make("Gauge"), "Fan gauge", { ...box(68, 20, 28, 46), w: 221 }),
    card: at(newElement("card", profile, palette), "Panel card", box(2, 17, 64, 33)),
    // On the cells COL 7 ROW 5 W 2 H 1 of the 8 x 5 grid (100 x 96 px cells), the host Image item their box.
    weather: newWidgetItem({ module: "Weather", cell: { col: 7, row: 5, cols: 2, rows: 1 } }, { x: 600, y: 384, w: 200, h: 96 }, "Weather"),
  };
  return { profile, base, parts };
}

/** Neon Rig: an imported-style InfoPanel profile, one Free page. `items` are in canvas order, the first at the bottom. */
function neonRig(order: (p: Parts) => DisplayItem[]): { profile: MonitorProfile; items: DisplayItem[] } {
  const { profile, base, parts } = neonParts();
  const items = order(parts);
  const canvas: StoredCanvas = { ...storeItems(base, profile, items), source: { name: "Neon Rig", origin: "file", importedAt: NOW.toISOString() } };
  const page: ProfilePage = {
    id: "main",
    name: "Main",
    placements: [{ id: "neon-canvas", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 8, rowSpan: 5, visible: true, canvas }],
  };
  return { profile: { id: "neon", name: "Neon Rig", width: 800, height: 480, cols: 8, rows: 5, fit: "fill", gap: 0, padding: 0, madeFor: "infopanel", pages: [page] }, items };
}

const temps = (p: Parts) => group("Temps", [p.cpuv, p.cpubar, p.gpuv, p.gpubar]);
/** The reference's profile tree, top first: Fan gauge, Clock, CPU load, Temps, NEON RIG; here bottom first. */
const profileItems = (p: Parts): DisplayItem[] => [p.title, temps(p), p.graph, p.clock, p.gauge];

function withConfig(profile: MonitorProfile) {
  return { ...defaultConfig(), activeProfile: profile.id, profiles: [profile] };
}

function deskFixture(madeFor: "studio" | "infopanel", selection: string[], leftTab: Fixture["leftTab"], extra: Partial<Fixture> = {}): Fixture {
  const profile = deskPanel(madeFor);
  return { config: withConfig(profile), route: { profileId: profile.id, pageId: "main" }, selection, leftTab, ...extra };
}

function neonFixture(order: (p: Parts) => DisplayItem[], select: string | null, leftTab: Fixture["leftTab"], extra: Partial<Fixture> = {}): Fixture {
  const { profile, items } = neonRig(order);
  return {
    config: withConfig(profile),
    route: { profileId: profile.id, pageId: "main" },
    selection: [],
    canvasSelection: select ? [pathOf(items, select) ?? ""] : [],
    leftTab,
    ...extra,
  };
}

const BUILD: Record<FixtureName, () => Fixture> = {
  screen: () => deskFixture("studio", ["weather"], "layers"),
  profile: () => neonFixture(profileItems, "CPU temp", "layers"),
  addw: () => neonFixture((p) => [...profileItems(p), p.weather], "Weather", "add", { addSegment: "all", toast: "addw" }),
  alt: () => deskFixture("studio", ["cpu"], "layers", { altDrag: { part: "Title text" } }),
  export: () => deskFixture("infopanel", [], "layers"),
  layersF: () =>
    neonFixture(
      (p) => [p.card, temps(p), p.graph, group("Right column", [p.gauge, p.weather]), group("Header", [p.clock, p.title])],
      "Weather",
      "layers",
      { contextMenuFor: "Weather" }
    ),
  layersG: () => deskFixture("studio", [], "layers"),
  hover: () => neonFixture(profileItems, null, "add", { addSegment: "w", hoverTile: "Weather" }),
};

/** The fixture `name` of `?fixture=one-editor/<name>`, or undefined for an unknown name. */
export function oneEditorFixture(name: string): Fixture | undefined {
  return Object.hasOwn(BUILD, name) ? BUILD[name as FixtureName]() : undefined;
}
