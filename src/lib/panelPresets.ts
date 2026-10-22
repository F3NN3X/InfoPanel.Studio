import type { ModuleSettings } from "@/modules/types";
import { clonePanel, newPanel, uid, type PanelDef, type Widget } from "./layout";
import { layoutStarters } from "./panel-starters";
import type { UserPanelPreset } from "./panel-model";

type Seed = Omit<Widget, "id" | "visible"> & { visible?: boolean };

function w(seed: Seed): Widget {
  return { id: uid("w"), visible: true, ...seed };
}

function makePanel(
  title: string,
  widgets: Widget[],
  opts?: Partial<PanelDef>
): PanelDef {
  const p = newPanel(title);
  p.widgets = widgets;
  if (opts) Object.assign(p, opts);
  return p;
}

export interface PanelPreset {
  id: string;
  title: string;
  description?: string;
  /** The Add list's one line (≤ 44 characters); saved panels list their first items instead. */
  blurb?: string;
  /** Minimum zone footprint this preset renders well in (grid cells). */
  colSpan: number;
  rowSpan: number;
  make: () => PanelDef;
  /** The panel's look (its placement settings); presets without one get the panel's own. */
  settings?: ModuleSettings;
  /** Saved by the user (`config.panelPresets`), not built in. */
  user?: boolean;
}

/* ------------------------------------------------------------------ *
 * Starter panels. Every widget is a normal, editable widget — these
 * just pre-bind live sensors so the user can drop a working panel and
 * then reshape it (rebind, restyle, remove) in the inspector.
 * ------------------------------------------------------------------ */

export const panelPresets: PanelPreset[] = [
  {
    id: "blank",
    title: "Blank panel",
    description: "Empty — build it from widgets",
    blurb: "Start empty and add items",
    colSpan: 2,
    rowSpan: 1,
    make: () => newPanel("Panel"),
  },
  {
    id: "system",
    title: "System",
    description: "CPU + RAM load bars",
    blurb: "CPU and RAM load bars with a graph",
    colSpan: 4,
    rowSpan: 2,
    make: () =>
      makePanel(
        "System",
        [
          w({ kind: "bar", label: "CPU LOAD", sensor: "system.cpu.load" }),
          w({ kind: "bar", label: "RAM USED", sensor: "system.ram.load" }),
          w({ kind: "sparkline", label: "CPU GRAPH", sensor: "system.cpu.load" }),
        ],
        { background: "bordered" }
      ),
  },
  {
    id: "ram",
    title: "RAM",
    description: "Used / free GB + graph",
    blurb: "Used and free memory with a graph",
    colSpan: 2,
    rowSpan: 2,
    make: () =>
      makePanel(
        "RAM",
        [
          w({
            kind: "bar",
            label: "RAM USED",
            sensor: "libre.total_memory_memory_used",
            decimals: 1,
          }),
          w({
            kind: "bar",
            label: "RAM FREE",
            sensor: "libre.total_memory_memory_available",
            decimals: 1,
          }),
          w({
            kind: "sparkline",
            label: "RAM GRAPH",
            sensor: "libre.total_memory_memory_used",
          }),
        ],
        { background: "bordered" }
      ),
  },
  {
    id: "cpu",
    title: "CPU",
    description: "Power, temperature, graph",
    blurb: "Power, temperature and a load graph",
    colSpan: 2,
    rowSpan: 2,
    make: () =>
      makePanel(
        "CPU",
        [
          w({
            kind: "stat",
            label: "Power",
            sensor: "libre.amd_ryzen_9_9950x3d_package",
            unit: "W",
          }),
          w({
            kind: "stat",
            label: "Core tmp",
            sensor: "libre.amd_ryzen_9_9950x3d_ccd1__tdie",
            unit: "°C",
          }),
          w({
            kind: "stat",
            label: "Bus",
            sensor: "libre.amd_ryzen_9_9950x3d_bus_speed",
            unit: "MHz",
          }),
          w({
            kind: "sparkline",
            label: "CPU GRAPH",
            sensor: "libre.amd_ryzen_9_9950x3d_package",
          }),
        ],
        { background: "bordered" }
      ),
  },
  {
    id: "gpu",
    title: "GPU",
    description: "Usage, power, fans, graph",
    blurb: "Usage, power, fans and a graph",
    colSpan: 3,
    rowSpan: 2,
    make: () =>
      makePanel(
        "GPU",
        [
          w({
            kind: "bar",
            label: "GPU USAGE",
            sensor: "libre.nvidia_geforce_rtx_5090_d3d_3d",
          }),
          w({
            kind: "bar",
            label: "POWER",
            sensor: "libre.nvidia_geforce_rtx_5090_gpu_board_power",
            unit: "% TDP",
          }),
          w({
            kind: "stat",
            label: "Fan 1",
            sensor: "libre.nvidia_geforce_rtx_5090_gpu_fan_1",
            unit: "RPM",
          }),
          w({
            kind: "stat",
            label: "Fan 2",
            sensor: "libre.nvidia_geforce_rtx_5090_gpu_fan_2",
            unit: "RPM",
          }),
          w({
            kind: "stat",
            label: "Vcore",
            sensor: "libre.nvidia_geforce_rtx_5090_gpu_core_voltage",
            unit: "V",
            decimals: 2,
          }),
          w({
            kind: "sparkline",
            label: "GPU GRAPH",
            sensor: "libre.nvidia_geforce_rtx_5090_d3d_3d",
          }),
        ],
        { background: "bordered" }
      ),
  },
  {
    id: "fps",
    title: "FPS gauges",
    description: "Ring gauges for RTSS metrics",
    blurb: "FPS, average and 1% low gauges",
    colSpan: 3,
    rowSpan: 2,
    make: () =>
      makePanel(
        "Performance",
        [
          w({
            kind: "gauge",
            label: "FPS",
            sensor: "plugins.InfoPanel.RTSS.rtss.fps",
            max: 240,
          }),
          w({
            kind: "gauge",
            label: "AVG",
            sensor: "plugins.InfoPanel.RTSS.rtss.avg-fps",
            max: 240,
          }),
          w({
            kind: "gauge",
            label: "1% LOW",
            sensor: "plugins.InfoPanel.RTSS.rtss.1% low fps",
            max: 240,
          }),
          w({
            kind: "value",
            label: "Refresh",
            sensor: "plugins.InfoPanel.RTSS.rtss.refreshrate",
            unit: "Hz",
          }),
          w({
            kind: "text",
            label: "GPU",
            sensor: "plugins.InfoPanel.RTSS.rtss.gpu-name",
          }),
        ],
        { background: "panel" }
      ),
  },
  {
    id: "steam",
    title: "Steam",
    description: "Profile, game, stats, news",
    blurb: "Profile, game, stats and news",
    colSpan: 3,
    rowSpan: 2,
    make: () =>
      makePanel(
        "Steam",
        [
          w({
            kind: "text",
            label: "Status",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Profile.online-status",
          }),
          w({
            kind: "stat",
            label: "Level",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Profile.steam-level",
          }),
          w({
            kind: "stat",
            label: "Games",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Library.total-games",
          }),
          w({
            kind: "stat",
            label: "Friends",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Social.total-friends",
          }),
          w({
            kind: "value",
            label: "Played 2w",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Library.recent-playtime",
            decimals: 1,
            unit: "h",
          }),
          w({
            kind: "text",
            label: "Recent",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Library.recent-games",
          }),
          w({
            kind: "text",
            label: "News",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-News.library-news",
          }),
          w({
            kind: "image",
            label: "Game icon",
            sensor: "plugins.InfoPanel.SteamAPI.SteamAPI-Profile.game_icon_url",
          }),
        ],
        { background: "panel" }
      ),
  },
  {
    id: "weather",
    title: "Weather",
    description: "Conditions + wind + pressure",
    blurb: "Conditions, wind and pressure",
    colSpan: 4,
    rowSpan: 2,
    make: () =>
      makePanel(
        "Weather",
        [
          w({
            kind: "stat",
            label: "Sky",
            sensor: "plugins.yr-weather-plugin.brevik-norway.weather",
          }),
          w({
            kind: "stat",
            label: "Gust",
            sensor: "plugins.yr-weather-plugin.brevik-norway.wind_gust",
            unit: "m/s",
            decimals: 1,
          }),
          w({
            kind: "stat",
            label: "Wind",
            sensor: "plugins.yr-weather-plugin.brevik-norway.wind_deg",
            unit: "°",
          }),
          w({
            kind: "stat",
            label: "Pressure",
            sensor: "plugins.yr-weather-plugin.brevik-norway.pressure",
            unit: "hPa",
          }),
        ],
        { background: "panel" }
      ),
  },
  {
    id: "network",
    title: "Network",
    description: "Throughput + data totals",
    blurb: "Utilization and data totals",
    colSpan: 2,
    rowSpan: 2,
    make: () =>
      makePanel(
        "Network",
        [
          w({
            kind: "bar",
            label: "UTILIZATION",
            sensor: "libre.ethernet_network_utilization",
          }),
          w({
            kind: "stat",
            label: "Data ↓",
            sensor: "libre.ethernet_data_downloaded",
            unit: "GB",
            decimals: 2,
          }),
          w({
            kind: "stat",
            label: "Data ↑",
            sensor: "libre.ethernet_data_uploaded",
            unit: "GB",
            decimals: 2,
          }),
        ],
        { background: "bordered" }
      ),
  },
  {
    id: "clock",
    title: "Clock",
    description: "Time + date",
    blurb: "Time and date",
    colSpan: 1,
    rowSpan: 1,
    make: () =>
      makePanel("Clock", [w({ kind: "clock", clock: "both" })], {
        background: "none",
        titleVisible: false,
      }),
  },
];

/** A saved panel as a preset: every use gets a copy with fresh ids. */
export function userPanelPreset(saved: UserPanelPreset): PanelPreset {
  return {
    id: saved.id,
    title: saved.name,
    description: "Saved panel",
    colSpan: saved.colSpan ?? 2,
    rowSpan: saved.rowSpan ?? 1,
    make: () => clonePanel(saved.panel),
    settings: saved.settings,
    user: true,
  };
}

/** The built-in presets, the layout starters and the user's saved panels. */
export function allPanelPresets(saved: UserPanelPreset[] = []): PanelPreset[] {
  return [...panelPresets, ...layoutStarters, ...saved.map(userPanelPreset)];
}

/** A preset (built in, starter or saved) by id. */
export function findPanelPreset(id: string, saved?: UserPanelPreset[]): PanelPreset | undefined {
  return allPanelPresets(saved).find((p) => p.id === id);
}
