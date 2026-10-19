/**
 * The Gauges page's model (spec §6, A7): where a gauge lives and how an edit gets back there.
 * A gauge is a preset (read-only, customising makes a copy), a My library item, a Gauge item
 * inside an imported canvas zone, or a Custom gauge widget zone. Each entry carries what the
 * page draws (a vector spec, or an image sequence's frame URLs) and its range. Writing back is one
 * config change, so the studio records one undo step.
 */
import { CANVAS_ID, type DashboardConfig, type Placement, type ProfileView } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { openCanvas, type OpenCanvas } from "@/lib/infopanel/canvas";
import { editItems, storeItems } from "@/lib/infopanel/canvas-edit";
import { itemAt, setField, type Path } from "@/lib/infopanel/editor/ops";
import { frameNames, gaugePaths, isGauge, isStale, setVector, vectorOf } from "@/lib/infopanel/gauges/frames";
import { libraryFramesOf } from "./canvas-gauge";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";

/** The Custom gauge widget's module id (src/widgets/CustomGauge.tsx). */
export const CUSTOM_GAUGE_ID = "CustomGauge";

export type GaugeSource =
  | { kind: "preset"; index: number }
  | { kind: "library"; itemId: string }
  /** A Gauge item in a canvas zone of the current profile page. */
  | { kind: "canvas"; zoneId: string; path: Path }
  /** A Custom gauge widget zone. */
  | { kind: "widget"; zoneId: string };

export type GaugeKind = "vector" | "svg" | "frames";

export interface GaugeEntry {
  /** Stable per source: selection and React keys. */
  key: string;
  source: GaugeSource;
  name: string;
  kind: GaugeKind;
  /** The spec drawn live; null for an image sequence with no vector spec. */
  gauge: VectorGauge | null;
  /** An image sequence's frames in value order (null: a frame the store can't serve). */
  frames?: (string | null)[];
  /** The same frames as asset-store ids, for saving to the library (undefined: no frames, or one the store lacks). */
  files?: LibraryFrame[];
  min: number;
  max: number;
  /** InfoPanel's AnimationSpeed, frames a second (0: jump to the frame). */
  animationSpeed: number;
  /** A canvas gauge whose frames are older than its spec (the bake bar). */
  stale?: boolean;
  /** Where it was found ("ARCv2 WIDE", "My library", "Preset"). */
  where: string;
}

export const sourceKey = (s: GaugeSource): string => {
  switch (s.kind) {
    case "preset":
      return `preset:${s.index}`;
    case "library":
      return `library:${s.itemId}`;
    case "canvas":
      return `canvas:${s.zoneId}:${s.path}`;
    case "widget":
      return `widget:${s.zoneId}`;
  }
};

export const kindOf = (g: VectorGauge | null): GaugeKind => (!g ? "frames" : g.shape === "svg" ? "svg" : "vector");

export const KIND_LABEL: Record<GaugeKind, string> = { vector: "Vector", svg: "SVG template", frames: "Image sequence" };

/* ---- presets ---- */

export function presetGauges(): GaugeEntry[] {
  return STARTERS.map((s, index) => {
    const gauge = normalizeGauge(s.gauge);
    const source: GaugeSource = { kind: "preset", index };
    return { key: sourceKey(source), source, name: s.name, kind: kindOf(gauge), gauge, min: gauge.scale?.min ?? 0, max: gauge.scale?.max ?? 100, animationSpeed: 0, where: "Preset" };
  });
}

/* ---- My library ---- */

/** A library frame: its asset id in the store (`<sha256>.<ext>`) and the file name to use. */
export interface LibraryFrame {
  id: string;
  name: string;
}

/** A gauge library item's `data`. */
export interface GaugeLibraryData {
  vector?: VectorGauge;
  frames?: LibraryFrame[];
  min: number;
  max: number;
  animationSpeed: number;
  /** The profile it was saved from. */
  source?: string;
}

const finite = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);

/** A library item's gauge data from untrusted JSON (null when it has neither a spec nor frames). */
export function gaugeDataOf(raw: unknown): GaugeLibraryData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vector = r.vector === undefined ? undefined : normalizeGauge(r.vector);
  const frames = Array.isArray(r.frames)
    ? r.frames.flatMap((f): LibraryFrame[] => {
        const o = f as Record<string, unknown> | null;
        return o && typeof o.id === "string" && /^[0-9a-f]{64}\.[a-z0-9]+$/.test(o.id) && typeof o.name === "string" ? [{ id: o.id, name: o.name }] : [];
      })
    : undefined;
  if (!vector && !frames?.length) return null;
  return {
    ...(vector ? { vector } : {}),
    ...(frames?.length ? { frames } : {}),
    min: finite(r.min, vector?.scale?.min ?? 0),
    max: finite(r.max, vector?.scale?.max ?? 100),
    animationSpeed: finite(r.animationSpeed, 0),
    ...(typeof r.source === "string" ? { source: r.source } : {}),
  };
}

/** Library gauge items as entries; one whose `data` isn't loaded or isn't a gauge is left out. */
export function libraryGauges(items: readonly LibraryItem[]): GaugeEntry[] {
  return items.flatMap((item) => {
    if (item.kind !== "gauge") return [];
    const d = gaugeDataOf(item.data);
    if (!d) return [];
    const source: GaugeSource = { kind: "library", itemId: item.id };
    const gauge = d.vector ?? null;
    return [{
      key: sourceKey(source), source, name: item.name, kind: kindOf(gauge), gauge,
      ...(d.frames ? { frames: d.frames.map((f) => `/api/assets/${f.id}`), files: d.frames } : {}),
      min: d.min, max: d.max, animationSpeed: d.animationSpeed, where: "My library",
    }];
  });
}

/** What saving `entry` (as edited to `gauge`) to the library stores. */
export function libraryDataOf(entry: GaugeEntry, gauge: VectorGauge | null, frames?: LibraryFrame[]): GaugeLibraryData {
  return {
    ...(gauge ? { vector: gauge } : {}),
    ...(frames?.length ? { frames } : {}),
    min: entry.min,
    max: entry.max,
    animationSpeed: entry.animationSpeed,
    ...(entry.source.kind === "canvas" || entry.source.kind === "widget" ? { source: entry.where } : {}),
  };
}

/** An entry for a spec that isn't listed (a working copy being saved): the range comes from its scale, else `prev`. */
export function gaugeEntryOf(source: GaugeSource, name: string, gauge: VectorGauge, where: string, prev?: Pick<GaugeLibraryData, "min" | "max" | "animationSpeed">): GaugeEntry {
  return {
    key: sourceKey(source), source, name, kind: kindOf(gauge), gauge, where,
    min: gauge.scale?.min ?? prev?.min ?? 0, max: gauge.scale?.max ?? prev?.max ?? 100, animationSpeed: prev?.animationSpeed ?? 0,
  };
}

/* ---- in the profile ---- */

/** The spec a Custom gauge widget draws until it is edited (src/widgets/CustomGauge.tsx draws the same). */
const WIDGET_DEFAULT: VectorGauge = normalizeGauge(STARTERS.find((s) => s.name === "Theme ring with value")!.gauge);

/** A Custom gauge widget's spec, from its `gauge` setting (a JSON string); the default for a blank or bad one. */
export function widgetGauge(zone: Placement): VectorGauge {
  const raw = zone.settings?.gauge;
  if (typeof raw !== "string" || !raw) return WIDGET_DEFAULT;
  try {
    return normalizeGauge(JSON.parse(raw));
  } catch {
    return WIDGET_DEFAULT;
  }
}

function canvasGauges(zone: Placement, open: OpenCanvas): GaugeEntry[] {
  return gaugePaths(open.items).flatMap((path) => {
    const item = itemAt(open.items, path);
    if (!isGauge(item)) return [];
    const gauge = vectorOf(item);
    const frames = frameNames(item).map((n) => (n ? (open.assets.get(n)?.url ?? null) : null));
    const files = libraryFramesOf(open, item);
    const source: GaugeSource = { kind: "canvas", zoneId: zone.id, path };
    return [{
      key: sourceKey(source), source, name: item.Name || `Gauge ${path}`, kind: kindOf(gauge), gauge,
      frames, ...(files ? { files } : {}), min: item.MinValue, max: item.MaxValue, animationSpeed: item.AnimationSpeed,
      stale: isStale(item), where: open.stored.source.name,
    }];
  });
}

/** The gauges on the profile page: Gauge items in its canvas zones, then its Custom gauge widgets. */
export function profileGauges(profile: Pick<ProfileView, "placements" | "name">): GaugeEntry[] {
  return profile.placements.flatMap((zone): GaugeEntry[] => {
    if (zone.module === CANVAS_ID && zone.canvas) {
      try {
        return canvasGauges(zone, openCanvas(zone.canvas));
      } catch {
        return [];
      }
    }
    if (zone.module === CUSTOM_GAUGE_ID) {
      const gauge = widgetGauge(zone);
      const source: GaugeSource = { kind: "widget", zoneId: zone.id };
      const label = typeof zone.settings?.label === "string" && zone.settings.label ? zone.settings.label : "Custom gauge";
      return [{ key: sourceKey(source), source, name: label, kind: kindOf(gauge), gauge, min: gauge.scale?.min ?? 0, max: gauge.scale?.max ?? 100, animationSpeed: 0, where: profile.name }];
    }
    return [];
  });
}

/* ---- writing back ---- */

/** `fn` applied to the zone with `zoneId`, wherever it is (every profile, every page). */
export function withZone(config: DashboardConfig, zoneId: string, fn: (z: Placement) => Placement): DashboardConfig {
  let hit = false;
  const profiles = config.profiles.map((p) => {
    const pages = p.pages.map((pg) => {
      if (!pg.placements.some((z) => z.id === zoneId)) return pg;
      hit = true;
      return { ...pg, placements: pg.placements.map((z) => (z.id === zoneId ? fn(z) : z)) };
    });
    return pages.every((pg, i) => pg === p.pages[i]) ? p : { ...p, pages };
  });
  return hit ? { ...config, profiles } : config;
}

/** A canvas zone's stored form with the gauge at `path` drawn by `gauge` (frames kept until baked). */
export function canvasWithVector(stored: StoredCanvas, path: Path, gauge: VectorGauge | null): StoredCanvas {
  const open = openCanvas(stored);
  return storeItems(open.stored, open.profile, setVector(editItems(open), path, gauge));
}

/**
 * The config with a profile gauge's spec replaced: a canvas Gauge item's `vector`, or a Custom gauge
 * widget's `gauge` setting. Presets and library items aren't in the config (null).
 */
export function withGauge(config: DashboardConfig, source: GaugeSource, gauge: VectorGauge): DashboardConfig | null {
  if (source.kind === "canvas") {
    return withZone(config, source.zoneId, (z) => (z.canvas ? { ...z, canvas: canvasWithVector(z.canvas, source.path, gauge) } : z));
  }
  if (source.kind === "widget") {
    return withZone(config, source.zoneId, (z) => ({ ...z, settings: { ...z.settings, gauge: JSON.stringify(gauge) } }));
  }
  return null;
}

/** A canvas zone's stored form with the gauge at `path` animating at `speed` frames a second. */
export function canvasWithSpeed(stored: StoredCanvas, path: Path, speed: number): StoredCanvas {
  const open = openCanvas(stored);
  return storeItems(open.stored, open.profile, setField(editItems(open), path, "AnimationSpeed", speed));
}

/** A canvas zone's stored form with the gauge at `path` named `name`. */
export function canvasWithName(stored: StoredCanvas, path: Path, name: string): StoredCanvas {
  const open = openCanvas(stored);
  return storeItems(open.stored, open.profile, setField(editItems(open), path, "Name", name));
}

/** The config with a profile gauge renamed: a canvas Gauge item's `Name`, or a Custom gauge widget's label. Other sources have no name to set (null). */
export function withGaugeName(config: DashboardConfig, source: GaugeSource, name: string): DashboardConfig | null {
  if (source.kind === "canvas") {
    return withZone(config, source.zoneId, (z) => (z.canvas ? { ...z, canvas: canvasWithName(z.canvas, source.path, name) } : z));
  }
  if (source.kind === "widget") {
    return withZone(config, source.zoneId, (z) => ({ ...z, settings: { ...z.settings, label: name } }));
  }
  return null;
}

/** The config with a canvas Gauge item's AnimationSpeed set (other sources have none to set: unchanged). */
export function withGaugeSpeed(config: DashboardConfig, source: GaugeSource, speed: number): DashboardConfig {
  if (source.kind !== "canvas") return config;
  return withZone(config, source.zoneId, (z) => (z.canvas ? { ...z, canvas: canvasWithSpeed(z.canvas, source.path, speed) } : z));
}
