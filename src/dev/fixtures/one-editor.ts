import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newElement } from "@/lib/infopanel/elements/create";
import { defaultPalette } from "@/lib/infopanel/elements/palette";
import { newItem } from "@/lib/infopanel/editor/create";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { bindingFromRef } from "@/lib/infopanel/sensors";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { CANVAS_ID, ITEM_ID, defaultConfig, type MonitorProfile, type Placement, type ProfilePage } from "@/lib/layout";
import { withoutItems } from "@/lib/page-model/stored-items";
import type { Fixture, FixtureName } from "./types";

/*
 * The eight states of the Edit v3 reference (scratchpad handoff "Unified Editor v3", SPEC §18), as today's model holds
 * them. Two screens: "Desk panel" (1024 x 600, 4 x 3, widgets) and "Neon Rig" (800 x 480, 8 x 5, an imported InfoPanel
 * profile on a Free page). The gauges and items read sensors of the repo's HWiNFO capture
 * (`tests/lib/infopanel/__fixtures__/hwinfo-capture.json`), so behind a Data API serving it they show live-looking values;
 * without one they read as placeholders. What today's model can't hold yet, for the phases that add it:
 *  - nested groups (the schema keeps a group out of a group): not needed by these states;
 *  - the per-state UI: Add's segment, hover card, Recently used and toast are read by Edit (phase 5); the Alt drag and
 *    layer menu are carried on the Fixture for later phases.
 */

const NOW = new Date("2026-10-27T00:00:00Z");

/** The capture's sensors the fixtures read: the Data API key (Studio widgets) and the HWiNFO ref (InfoPanel items). */
const SENSOR = {
  cpuTemp: { key: "hwinfo.cpu_package", ref: "hwinfo:-1/4144394256/0/16777223", name: "CPU Package" },
  gpuTemp: { key: "hwinfo.gpu_temperature", ref: "hwinfo:-1/3758104576/0/16777216", name: "GPU Temperature" },
  cpuLoad: { key: "hwinfo.total_cpu_usage", ref: "hwinfo:-1/4026532608/0/117440545", name: "Total CPU Usage" },
  gpuLoad: { key: "hwinfo.gpu_core_load", ref: "hwinfo:-1/3758104576/0/117440512", name: "GPU Core Load" },
  fan: { key: "hwinfo.gpu_fan1", ref: "hwinfo:-1/3758104576/0/50331648", name: "GPU Fan1" },
} as const;
/** The top of Neon Rig's Fan gauge. */
export const FAN_MAX_RPM = 2000;

/** An InfoPanel item bound to one of the capture's sensors, as the Sensor dropdown binds it: its ids, and the Data API key it reads. */
const bound = (item: DisplayItem, s: (typeof SENSOR)[keyof typeof SENSOR]): DisplayItem =>
  ({ ...item, ...bindingFromRef(s.ref), SensorName: s.name, $import: { key: s.key, via: "chosen" } }) as unknown as DisplayItem;
const PINK = "#FFFF3EC8";

const zone = (id: string, module: string, cell: [number, number, number, number], extra: Partial<Placement> = {}): Placement => ({
  id, module, colStart: cell[0], rowStart: cell[1], colSpan: cell[2], rowSpan: cell[3], visible: true, ...extra,
});

/**
 * The Overlay group's parts (v15 item placements): Accent glow, an element on the cells of columns 1–2, row 1, and
 * Title text, an item placed freely over the gauges; with the page's InfoPanel side they draw with. `grouped` false:
 * Title text alone, at the top level (the reference's alt state).
 */
function overlay(grouped: boolean): { parts: Placement[]; store: ProfilePage["freeCanvas"] } {
  const base = newStored({ name: "Desk panel", width: 1024, height: 600, now: NOW });
  const { profile } = readStored(base);
  const palette = defaultPalette(profile);
  const glow = { ...newElement("glow", profile, palette), Name: "Accent glow", X: 0, Y: 0, Width: 512, Height: 200 } as DisplayItem;
  const title = { ...newItem("Text", profile, palette), Name: "Title text", X: 48, Y: 28, FontSize: 22, Bold: true, Color: PINK } as DisplayItem;
  const stored = storeItems(base, profile, grouped ? [glow, title] : [title]);
  const [g, t] = grouped ? stored.items : [undefined, stored.items[0]];
  const titlePart = zone("title", ITEM_ID, [1, 1, 2, 1], { item: t, px: { x: 48, y: 28, w: 140, h: 36 }, ...(grouped ? { groupId: "overlay" } : {}) });
  return {
    parts: g ? [zone("glow", ITEM_ID, [1, 1, 2, 1], { item: g, groupId: "overlay" }), titlePart] : [titlePart],
    store: withoutItems(stored),
  };
}

/** What Desk panel holds besides its widgets: nothing, Title text on its own, or the Gauges and Overlay groups. */
type DeskExtra = "none" | "title" | "groups";

/** Desk panel: five widgets on a full 4 x 3 grid, no gap and no padding so the cells match the reference's percentages. */
function deskPanel(madeFor: "studio" | "infopanel", extra: DeskExtra = "none"): MonitorProfile {
  const groups = extra === "groups";
  const gauge = (id: string, label: string, sensor: string, cell: [number, number, number, number]) =>
    zone(id, "SensorValue", cell, { name: `${label} gauge`, settings: { display: "gauge", label, sensor }, ...(groups ? { groupId: "gauges" } : {}) });
  const over = extra === "none" ? null : overlay(groups);
  const page: ProfilePage = {
    id: "main",
    name: "Main",
    placements: [
      gauge("cpu", "CPU", SENSOR.cpuTemp.key, [1, 1, 2, 2]),
      gauge("gpu", "GPU", SENSOR.gpuTemp.key, [3, 1, 2, 2]),
      zone("clock", "Clock", [1, 3, 1, 1]),
      zone("weather", "Weather", [2, 3, 1, 1]),
      zone("agents", "CodingAgents", [3, 3, 2, 1]),
      ...(over?.parts ?? []),
    ],
    ...(over ? { freeCanvas: over.store } : {}),
    ...(groups ? { groups: [{ id: "gauges", name: "Gauges" }, { id: "overlay", name: "Overlay" }] } : {}),
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
    cpuv: at(bound(make("Sensor"), SENSOR.cpuTemp), "CPU temp", box(4, 20, 28, 20)),
    cpubar: at(bound(make("Bar"), SENSOR.cpuLoad), "CPU bar", box(4, 43, 28, 4)),
    gpuv: at(bound(make("Sensor"), SENSOR.gpuTemp), "GPU temp", box(36, 20, 28, 20)),
    gpubar: at(bound(make("Bar"), SENSOR.gpuLoad), "GPU bar", box(36, 43, 28, 4)),
    graph: at(bound(make("Graph"), SENSOR.cpuLoad), "CPU load", box(4, 54, 60, 38)),
    // A fan's range in RPM: on the Gauge's default 0-100 its ~1,246 RPM reading is past the top, a full ring.
    gauge: at({ ...bound(make("Gauge"), SENSOR.fan), MinValue: 0, MaxValue: FAN_MAX_RPM } as DisplayItem, "Fan gauge", { ...box(68, 20, 28, 46), w: 221 }),
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

function deskFixture(madeFor: "studio" | "infopanel", selection: string[], leftTab: Fixture["leftTab"], extra: Partial<Fixture> = {}, parts: DeskExtra = "none"): Fixture {
  const profile = deskPanel(madeFor, parts);
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

/** The reference's Recently used: Weather and a gauge (the registry's Custom gauge stands in for its CPU gauge). */
const RECENT = ["Weather", "CustomGauge"];

const BUILD: Record<FixtureName, () => Fixture> = {
  screen: () => deskFixture("studio", ["weather"], "layers"),
  profile: () => neonFixture(profileItems, "CPU temp", "layers"),
  addw: () => neonFixture((p) => [...profileItems(p), p.weather], "Weather", "add", { addSegment: "all", toast: "addw", added: "Weather", recent: RECENT }),
  alt: () => deskFixture("studio", ["title"], "layers", { altDrag: { part: "Title text" } }, "title"),
  export: () => deskFixture("infopanel", [], "layers"),
  layersF: () =>
    neonFixture(
      (p) => [p.card, temps(p), p.graph, group("Right column", [p.gauge, p.weather]), group("Header", [p.clock, p.title])],
      "Weather",
      "layers",
      { contextMenuFor: "Weather" }
    ),
  layersG: () => deskFixture("studio", ["overlay"], "layers", {}, "groups"),
  hover: () => neonFixture(profileItems, null, "add", { addSegment: "widgets", hoverTile: "Weather", recent: RECENT }),
};

/** The fixture `name` of `?fixture=one-editor/<name>`, or undefined for an unknown name. */
export function oneEditorFixture(name: string): Fixture | undefined {
  return Object.hasOwn(BUILD, name) ? BUILD[name as FixtureName]() : undefined;
}
