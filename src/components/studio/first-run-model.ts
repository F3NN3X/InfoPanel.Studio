import type { ApiSources } from "@/lib/catalog";
import { newProfile, uid, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { onPage, zoneCount } from "@/lib/pages";
import { sampleLayout } from "@/lib/sample-layout";
import type { SensorMap } from "@/modules/types";
import { withSampleZones } from "./studio-actions";
import { firstFreeRect } from "./zone-geometry";

/*
 * First-run setup (SPEC §10.5): the pure parts. What the window's size looks like, the screen cards, how a
 * Data API answer reads, which widgets the detected sensors offer, how the chosen ones lay out on the grid and
 * what config the whole thing makes. The modal (`first-run.tsx`) only collects the choices.
 */

export type ScreenKind = "bar" | "panel" | "strip" | "tablet";

/** What a window of this size looks like: "a bar display", "a panel or monitor", "a tall strip", "a phone or tablet". */
export function looksLike(width: number, height: number): { kind: ScreenKind; text: string } {
  if (!(width > 0 && height > 0)) return { kind: "panel", text: "a panel or monitor" };
  const ratio = width / height;
  if (ratio >= 2.2) return { kind: "bar", text: "a bar display" };
  if (ratio <= 0.6) return { kind: "strip", text: "a tall strip" };
  if (ratio < 1.2) return { kind: "tablet", text: "a phone or tablet" };
  return { kind: "panel", text: "a panel or monitor" };
}

export interface ScreenChoice {
  id: "detected" | "panel" | "strip" | "tablet" | "custom";
  label: string;
  width: number;
  height: number;
}

/** The step-2 cards: the detected window size first (preselected), then the presets and a custom size. */
export function screenChoices(windowWidth: number, windowHeight: number, custom?: { width: number; height: number }): ScreenChoice[] {
  return [
    { id: "detected", label: "This window", width: windowWidth, height: windowHeight },
    { id: "panel", label: "Panel", width: 1024, height: 600 },
    { id: "strip", label: "Strip", width: 480, height: 1920 },
    { id: "tablet", label: "Phone or tablet", width: 1080, height: 1920 },
    { id: "custom", label: "Custom size", width: custom?.width ?? windowWidth, height: custom?.height ?? windowHeight },
  ];
}

/** A screen size a person can type: whole pixels, 100 to 8192. */
export const validSize = (n: number): boolean => Number.isInteger(n) && n >= 100 && n <= 8192;

/** How many sensors a Data API answer offers and from which sources (its plugins), for "Connected — N sensors from …". */
export function summariseSources(sources: ApiSources): { count: number; names: string[] } {
  let count = 0;
  const names: string[] = [];
  for (const plugin of sources.plugins) {
    const n = plugin.containers.reduce((sum, c) => sum + c.entries.filter((e) => e.type === "sensor").length, 0);
    count += n;
    if (n > 0) names.push(plugin.name);
  }
  return { count, names };
}

/** "Connected — 764 sensors from System, Clock and 16 more". */
export function connectedText({ count, names }: { count: number; names: string[] }): string {
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  const from = shown.length === 0 ? "" : ` from ${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`;
  return `Connected — ${count} ${count === 1 ? "sensor" : "sensors"}${from}`;
}

export type FirstWidgetId = "cpu-temp" | "gpu-temp" | "fans" | "clock" | "now-playing";

export interface FirstWidget {
  id: FirstWidgetId;
  label: string;
  /** The registry module the zone hosts. */
  module: string;
  /** Footprint on a grid (cols, rows). */
  size: { cols: number; rows: number };
}

/** The step-4 cards, in the order they are laid out. */
export const FIRST_WIDGETS: readonly FirstWidget[] = [
  { id: "cpu-temp", label: "CPU temperature", module: "SensorValue", size: { cols: 2, rows: 2 } },
  { id: "gpu-temp", label: "GPU temperature", module: "SensorValue", size: { cols: 2, rows: 2 } },
  { id: "fans", label: "Fans", module: "Fans", size: { cols: 2, rows: 1 } },
  { id: "clock", label: "Clock", module: "Clock", size: { cols: 2, rows: 1 } },
  { id: "now-playing", label: "Now playing", module: "NowPlaying", size: { cols: 3, rows: 1 } },
];

export interface DetectedWidget extends FirstWidget {
  /** The sensors offer it (the Clock needs none): the card starts ticked. */
  detected: boolean;
  /** The sensor a temperature card binds. */
  sensor?: string;
}

const text = (key: string, name?: string) => `${key} ${name ?? ""}`.toLowerCase();
const isTemp = (s: SensorMap[string]) => s.unit.trim() === "°C";

/** The temperature sensor of a part: its name or key mentions it, the best-known names first. */
function findTemp(sensors: SensorMap, part: RegExp, best: RegExp): string | undefined {
  const hits = Object.entries(sensors).filter(([key, s]) => isTemp(s) && part.test(text(key, s.name)));
  return (hits.find(([key, s]) => best.test(text(key, s.name))) ?? hits[0])?.[0];
}

/** The five cards over what the Data API offers right now: the ones it can feed are `detected`. */
export function detectWidgets(sensors: SensorMap): DetectedWidget[] {
  const keys = Object.keys(sensors);
  const cpu = findTemp(sensors, /cpu|ryzen|intel_core|core_i\d/, /package|tctl|tdie|die/);
  const gpu = findTemp(sensors, /gpu|nvidia|radeon|geforce/, /core|hot_?spot|edge/);
  const detected: Record<FirstWidgetId, { on: boolean; sensor?: string }> = {
    "cpu-temp": { on: cpu !== undefined, sensor: cpu },
    "gpu-temp": { on: gpu !== undefined, sensor: gpu },
    fans: { on: keys.some((k) => sensors[k].unit.trim() === "RPM") },
    clock: { on: true },
    "now-playing": { on: keys.some((k) => /^(plugins\.media-plugin\.|plugins\.spotify-plugin\.|spotify\.)/.test(k)) },
  };
  return FIRST_WIDGETS.map((w) => ({ ...w, detected: detected[w.id].on, sensor: detected[w.id].sensor }));
}

/** A widget card turned into a zone with no box yet. */
function zoneFor(w: DetectedWidget): Omit<Placement, "colStart" | "rowStart" | "colSpan" | "rowSpan"> {
  return {
    id: uid(w.module),
    module: w.module,
    visible: true,
    ...(w.module === "SensorValue" ? { settings: { label: w.label, ...(w.sensor ? { sensor: w.sensor } : {}) } } : {}),
  };
}

/**
 * The chosen widgets laid out on the grid, in card order, each at the first free spot. A widget wider or taller
 * than the grid is cut to it; one that finds no room is left out (`skipped`, so the modal can say so).
 */
export function layoutWidgets(chosen: readonly DetectedWidget[], cols: number, rows: number): { placements: Placement[]; skipped: FirstWidgetId[] } {
  const placements: Placement[] = [];
  const skipped: FirstWidgetId[] = [];
  for (const w of chosen) {
    const size = { cols: Math.min(w.size.cols, cols), rows: Math.min(w.size.rows, rows) };
    const spot = firstFreeRect(cols, rows, size, placements);
    if (!spot) {
      skipped.push(w.id);
      continue;
    }
    placements.push({ ...zoneFor(w), colStart: spot.col, rowStart: spot.row, colSpan: spot.cols, rowSpan: spot.rows });
  }
  return { placements, skipped };
}

export type StartChoice = "template" | "import" | "blank";

export interface FirstRunChoices {
  width: number;
  height: number;
  start: StartChoice;
  /** The first page's name; empty keeps "Main". */
  pageName: string;
  /** The ticked widgets (Blank start only). */
  widgets: readonly DetectedWidget[];
  /** The screen the chosen screen template makes at this size (Start from a template); without one, the sample layout. */
  template?: MonitorProfile;
}

/** A fresh install: the one blank screen and nothing on it (the old empty-layout moment). */
export function isPristine(config: DashboardConfig): boolean {
  return config.profiles.length === 1 && zoneCount(config.profiles[0]) === 0;
}

/** The screen a size makes: a new profile's grid and fit, under the given name. */
function screenAt(base: MonitorProfile, name: string, c: FirstRunChoices): MonitorProfile {
  const grid = newProfile(name, c.width, c.height);
  const sized: MonitorProfile = { ...base, name, width: c.width, height: c.height, cols: grid.cols, rows: grid.rows, fit: grid.fit };
  const pageName = c.pageName.trim();
  const named: MonitorProfile = pageName ? { ...sized, pages: sized.pages.map((p, i) => (i === 0 ? { ...p, name: pageName } : p)) } : sized;
  if (c.start === "template" && c.template) {
    // The template's grid, look and pages on this screen, its first page under the typed name.
    const { id: _id, name: _name, pages, ...made } = c.template;
    return { ...sized, ...made, pages: pages.map((p, i) => (i === 0 ? { ...p, id: sized.pages[0].id, name: pageName || p.name } : p)) };
  }
  if (c.start === "template") {
    // The sample layout is a 1920×550 bar's own grid; any other shape scales it onto the grid it has.
    return onPage(undefined, (view) => withSampleZones(view, sampleLayout(), looksLike(c.width, c.height).kind !== "bar"))(named);
  }
  if (c.start === "import") return named;
  const { placements } = layoutWidgets(c.widgets, named.cols, named.rows);
  return onPage(undefined, (view) => ({ ...view, placements }))(named);
}

/**
 * What the setup makes of the config. A fresh install sets up its one blank screen; with screens already there
 * (Help › Run setup again) the setup adds a new screen and leaves the rest alone. `profileId` is the screen to edit.
 */
export function applyFirstRun(config: DashboardConfig, c: FirstRunChoices): { config: DashboardConfig; profileId: string } {
  if (isPristine(config)) {
    const first = config.profiles[0];
    return { config: { ...config, profiles: [screenAt(first, first.name, c)] }, profileId: first.id };
  }
  const fresh = screenAt(newProfile(`${c.width}×${c.height}`, c.width, c.height), `${c.width}×${c.height}`, c);
  return { config: { ...config, profiles: [...config.profiles, fresh] }, profileId: fresh.id };
}
