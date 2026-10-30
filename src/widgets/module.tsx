// The factory that turns a template widget (a component over flat data, `kit.ts`) into a
// DashboardModule: standard look settings, shell props from the resolved settings, Library fields.
import { useEffect, useMemo, type ComponentType } from "react";
import { compactOf } from "@/modules/setting-readers";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import { islandSettings, type IslandSourceDef } from "@/lib/island/sources";
import { effectiveSettings, type DashboardModule, type ModuleSetting, type ModuleSettings, type SensorMap } from "@/modules/types";
import { ensureSkinFonts } from "./core/fonts";
import { SKINS } from "./core/theme";
import type { ShellProps, WidgetMeta } from "./core/types";
import { toFlat, toNames } from "./data-adapter";
import { preloadOf } from "./lazy-widget";

export interface TemplateOptions<P extends object> {
  meta: WidgetMeta;
  Component: ComponentType<ShellProps & { look?: ModuleSettings } & P>;
  /** The template's own settings, after the standard block. */
  settings: ModuleSetting[];
  /** The template's props from its resolved settings. */
  /** `saved` is the zone's own stored values, for keys the schema no longer lists (read, not offered). */
  toProps: (settings: ModuleSettings, saved?: ModuleSettings) => P;
  /** Further prefixes the template reads without owning them (`DashboardModule.reads`). */
  prefixes?: string[];
  /** Overrides `meta.name` as the module title. */
  title?: string;
  /** The settings block before the template's own; default `STANDARD_SETTINGS`. */
  base?: ModuleSetting[];
  /** What it sends to the Dynamic Island; adds "Send to island" and the source's options after its own settings. */
  island?: IslandSourceDef;
}

/** A select value that means "unset": `auto` or empty. */
const chosen = (v: unknown): string | undefined => (v === undefined || v === "" || v === "auto" ? undefined : String(v));

/** The shell props the standard look settings set; `auto` / empty leave the shell's own choice. */
export function shellProps(s: ModuleSettings): Partial<ShellProps> {
  const radius = Number(chosen(s.radius));
  // Small zones (`compact`): dense = the studio view, card / full = the summary card always / never.
  const compact = compactOf(s);
  return {
    accent: chosen(s.accent),
    surface: chosen(s.surface),
    radius: chosen(s.radius) !== undefined && Number.isFinite(radius) ? radius : undefined,
    skin: chosen(s.skin),
    variant: compact === "dense" ? "studio" : compact === "full" ? "default" : undefined,
    graph: chosen(s.graph),
    meter: chosen(s.meter),
    compactView: compact === "card" ? "on" : compact === "full" ? "off" : undefined,
    title: chosen(s.label),
  };
}

/**
 * The look with the surface decided: a value set at any style level wins, else a chosen skin
 * brings its own surface, else `glass` (the default, so skin `auto` configs are unchanged).
 * `effectiveSettings` always fills `surface`, so `saved` (resolved, not defaulted) says if it was set.
 * `fallback` is the module's own surface default (`theme` for the plain card widgets).
 */
export function withSkinSurface(look: ModuleSettings, saved: ModuleSettings | undefined, fallback = "glass"): ModuleSettings {
  if (chosen(saved?.surface)) return look;
  const skin = chosen(look.skin);
  return { ...look, surface: (skin && SKINS[skin]?.surface) || fallback };
}

/**
 * Template ids whose data is not a sensor key (the browser clock, the Wave Link socket, a URL, the timer), so
 * they render with an empty sensor map; every other template renders nothing until a key shows up.
 */
export const SENSORLESS: ReadonlySet<string> = new Set(["Clock", "Calendar", "WebPage", "WaveLink", "Timer", "CodingAgents", "DayPlanner", "RadialClockStack", "OnAirBeacon", "StreamMixer", "AudioButton", "AudioFader", "StreamControl", "ObsButton", "StreamChat"]);

/** Whether the map holds a key under any prefix (a module with no prefixes reads any key). */
function hasKeys(sensors: SensorMap, prefixes: readonly string[]): boolean {
  const keys = Object.keys(sensors);
  return prefixes.length === 0 ? keys.length > 0 : keys.some((k) => prefixes.some((p) => k.startsWith(p)));
}

/** A zone's look: the defaults under `saved` with the surface decided (see `withSkinSurface`), the chosen skin's fonts loaded. */
/** A lone old alignment axis v7 left in place (no 9-cell code says it): carried to the look for `alignOf` (until PR 8). */
const LEGACY_ALIGN = ["alignX", "alignY"];

export function useZoneLook(defs: ModuleSetting[], saved: ModuleSettings | undefined, surfaceDefault: string): ModuleSettings {
  const legacy = Object.fromEntries(LEGACY_ALIGN.flatMap((k) => (saved?.[k] !== undefined ? [[k, saved[k]]] : [])));
  const look = withSkinSurface({ ...effectiveSettings({ settings: defs }, saved), ...legacy }, saved, surfaceDefault);
  const skin = chosen(look.skin);
  useEffect(() => {
    if (skin) ensureSkinFonts(skin);
  }, [skin]);
  return look;
}

export function templateModule<P extends object>({ meta, Component, settings, toProps, prefixes, title, base, island }: TemplateOptions<P>): DashboardModule {
  const all = [...(base ?? STANDARD_SETTINGS), ...settings, ...(island ? islandSettings(island) : [])];
  const surfaceDefault = String(all.find((d) => d.key === "surface")?.default ?? "glass");
  const mod: DashboardModule = {
    id: meta.id,
    title: title ?? meta.name,
    minCols: meta.minSize[0],
    minRows: meta.minSize[1],
    prefixes: meta.prefixes,
    reads: prefixes,
    readsAll: !SENSORLESS.has(meta.id) && meta.prefixes.length === 0 && !prefixes?.length ? true : undefined,
    settings: all,
    category: meta.category,
    icon: meta.icon,
    description: meta.description,
    blurb: meta.blurb,
    tags: meta.tags,
    defaultSize: meta.defaultSize,
    views: meta.views,
    viewKey: meta.viewKey,
    ...(island ? { island } : {}),
    ...(preloadOf(Component) ? { preload: preloadOf(Component) } : {}),
    // No data renders nothing, so the kiosk hides the zone and the studio says "no live data yet".
    render: (sensors, saved) =>
      !SENSORLESS.has(meta.id) && !hasKeys(sensors, [...mod.prefixes, ...(mod.reads ?? [])]) ? null : (
        <TemplateZone sensors={sensors} saved={saved} />
      ),
  };
  function TemplateZone({ sensors, saved }: { sensors: SensorMap; saved?: ModuleSettings }) {
    // HWiNFO readings also under the LibreHardwareMonitor keys the widgets read (`hwinfo-aliases.ts`)
    const aliased = useMemo(() => withHwinfoAliases(sensors), [sensors]);
    const data = useMemo(() => toFlat(aliased), [aliased]);
    const names = useMemo(() => toNames(aliased), [aliased]);
    const look = useZoneLook(all, saved, surfaceDefault);
    return <Component data={data} names={names} {...shellProps(look)} {...toProps(look, saved)} look={look} />;
  }
  return mod;
}
