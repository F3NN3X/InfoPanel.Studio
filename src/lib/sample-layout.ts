import { PANEL_ID, uid, type PanelDef, type Placement, type Widget, type WidgetKind } from "./layout";
import { YR_FORECAST_KEY } from "./sensors";

/*
 * The sample layout — a from-scratch recreation of the reference kiosk layout (FPS rings, big clock
 * block, last-played-game panel, weather, GPU/RAM readouts, network + steam news cards). It is a
 * template, not a profile: the studio's empty-layout card ("Use sample layout") copies its grid and
 * zones onto the page (`withSampleZones`). Every widget is bound to a real live sensor and stays editable.
 */

/** A page layout to start from: a grid and its zones (fresh ids on every call). */
export interface LayoutTemplate {
  name: string;
  cols: number;
  rows: number;
  placements: Placement[];
}

/** The yellow accent the sample layout is built around. */
const SAMPLE_ACCENT = "#f5c518";

const RTSS = (n: string) => `plugins.InfoPanel.RTSS.rtss.${n}`;
const STEAM = (n: string) => `plugins.InfoPanel.SteamAPI.${n}`;
const NVIDIA = (n: string) => `libre.nvidia_geforce_rtx_5090_${n}`;
const WEATHER = (n: string) => `plugins.yr-weather-plugin.brevik-norway.${n}`;

/** Shorthand for building sample widgets with fresh ids. */
function sw(fields: Partial<Widget> & { kind: WidgetKind }): Widget {
  return { id: uid("w"), visible: true, ...fields };
}

/** An accent-yellow vertical bar (the sample's decorative dividers). */
function vbar(extra?: Partial<Widget>): Widget {
  return sw({
    kind: "shape",
    shape: "vbar",
    thickness: 8,
    color: SAMPLE_ACCENT,
    ...extra,
  });
}

/** Shorthand for building sample panels with fresh ids. */
function sp(
  fields: Partial<Omit<PanelDef, "widgets" | "title">> & {
    title: string;
    widgets: Widget[];
  }
): PanelDef {
  return {
    id: uid("panel"),
    titleVisible: false,
    visible: true,
    background: "none",
    ...fields,
  };
}

interface SamplePlacementOpts {
  colStart?: number;
  rowStart?: number;
  rowSpan?: number;
}

function sampleModulePlacement(
  module: string,
  colSpan: number,
  opts: SamplePlacementOpts & {
    settings?: Placement["settings"];
    design?: Placement["design"];
  } = {}
): Placement {
  return {
    id: uid(module),
    module,
    colStart: opts.colStart ?? 1,
    colSpan,
    visible: true,
    rowStart: opts.rowStart ?? 1,
    rowSpan: opts.rowSpan ?? 1,
    settings: opts.settings,
    design: opts.design,
  };
}

function samplePanelPlacement(
  panel: PanelDef,
  colSpan: number,
  opts: SamplePlacementOpts = {}
): Placement {
  return {
    id: uid(PANEL_ID),
    module: PANEL_ID,
    colStart: opts.colStart ?? 1,
    colSpan,
    visible: true,
    rowStart: opts.rowStart ?? 1,
    rowSpan: opts.rowSpan ?? 1,
    panel,
  };
}

/**
 * Macro layout of the sample (12 cols × 6 equal rows, built for a 1920×550 "fill" strip):
 *
 *   row 1  now playing (3) │ clock block (5, rows 1–3) │ last played (4, rows 1–3)
 *   row 2  fps rings (3)   │                            │
 *   row 3  network (3)     │                            │
 *   rows 4–6 weather (4)   │ gpu (4)                    │ session (4)
 */
export function sampleLayout(): LayoutTemplate {
  // — Left column, row 2: FPS rings — six gauges in a single row. A gauge's
  //   size is its ring diameter: 56px fills the ~64px-tall strip row.
  const fpsRings = sp({
    title: "FPS rings",
    accent: SAMPLE_ACCENT,
    layout: "grid",
    columns: 6,
    widgets: [
      sw({ kind: "gauge", sensor: RTSS("fps"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: RTSS("avg-fps"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: RTSS("1% low fps"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: RTSS("refreshrate"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: NVIDIA("gpu_core"), max: 100, size: 56 }),
      sw({ kind: "gauge", sensor: NVIDIA("gpu_memory_junction"), max: 100, size: 56 }),
    ],
  });

  // — Center block (rows 1–3): dividers, "capturing" line, the big FPS
  //   readout (frame time stacked below) with GPU stat tiles, and the clock.
  const clockBlock = sp({
    title: "Clock block",
    accent: SAMPLE_ACCENT,
    layout: "grid",
    columns: 6,
    widgets: [
      vbar({ rowSpan: 4 }),
      sw({ kind: "text", label: "Capturing", text: "No games to capture", span: 4, fontSize: 12 }),
      vbar(),
      sw({ kind: "value", sensor: RTSS("fps"), subSensor: RTSS("current frame time"), fontSize: 26 }),
      sw({ kind: "stat", label: "Power W", sensor: NVIDIA("gpu_board_power"), fontSize: 14 }),
      sw({ kind: "stat", label: "Mem °", sensor: NVIDIA("gpu_memory_junction"), fontSize: 14 }),
      sw({ kind: "stat", label: "Core °", sensor: NVIDIA("gpu_core"), fontSize: 14 }),
      sw({ kind: "stat", label: "Load", sensor: NVIDIA("d3d_3d"), unit: "%", fontSize: 14 }),
      sw({ kind: "clock", span: 5, rowSpan: 2, fontSize: 46, color: SAMPLE_ACCENT }),
    ],
  });

  // — Right block (rows 1–3): last played game — the banner is the panel's
  //   background with the game icon, name, session timer, start time,
  //   total hours and the friends table layered on top.
  const lastPlayed = sp({
    title: "Last played game",
    accent: SAMPLE_ACCENT,
    background: "panel",
    titleVisible: true,
    layout: "overlay",
    widgets: [
      sw({ kind: "image", sensor: STEAM("SteamAPI-Profile.current_game_banner_url"), asBackground: true }),
      sw({ kind: "image", sensor: STEAM("SteamAPI-Profile.game_icon_url"), height: 30, overlayZone: "top" }),
      sw({ kind: "text", sensor: STEAM("SteamAPI-Session.current-game"), fontSize: 15, overlayZone: "top" }),
      sw({ kind: "value", sensor: STEAM("SteamAPI-Session.current-session-time"), color: SAMPLE_ACCENT, fontSize: 26, overlayZone: "middle" }),
      sw({ kind: "text", label: "Started", sensor: STEAM("SteamAPI-Session.session-start-time"), overlayZone: "bottom" }),
      sw({ kind: "value", label: "Total hours", sensor: STEAM("SteamAPI-Library.recent-playtime"), overlayZone: "bottom" }),
      sw({ kind: "table", label: "Friends", sensor: STEAM("SteamAPI-Social.friends-activity"), rows: 3, columns: 4, header: "Friend, Status, Playing, Last Online", overlayZone: "bottom" }),
    ],
  });

  // — Left column, row 3: network upload/download cards.
  const network = sp({
    title: "Network",
    background: "panel",
    layout: "grid",
    columns: 2,
    widgets: [
      sw({ kind: "stat", label: "Data Upload", sensor: "libre.ethernet_data_uploaded", color: SAMPLE_ACCENT }),
      sw({ kind: "stat", label: "Data Download", sensor: "libre.ethernet_data_downloaded", color: SAMPLE_ACCENT }),
    ],
  });

  // — Bottom row, left: current conditions + 7-day forecast table.
  // The forecast lines come from the yr plugin's multi-day forecast.
  const weather = sp({
    title: "Weather",
    background: "panel",
    layout: "grid",
    columns: 4,
    widgets: [
      sw({ kind: "text", text: "Current surface data", span: 4, fontSize: 10, color: "#94a3b8" }),
      sw({ kind: "value", sensor: WEATHER("weather_desc"), fontSize: 13 }),
      sw({ kind: "stat", sensor: WEATHER("temp"), span: 2, color: SAMPLE_ACCENT, fontSize: 18 }),
      sw({ kind: "value", sensor: WEATHER("wind_speed"), label: "wind", decimals: 1 }),
      sw({ kind: "table", sensor: YR_FORECAST_KEY, rows: 7, span: 4, columns: 5, header: "Date, Weather, Temp, Precip, Wind" }),
    ],
  });

  // — Bottom row, center: GPU sparkline + RAM bars + 2×2 stats,
  //   bracketed by full-height bars.
  const gpuBlock = sp({
    title: "GPU / RAM",
    accent: SAMPLE_ACCENT,
    layout: "grid",
    columns: 7,
    widgets: [
      vbar({ rowSpan: 3 }),
      sw({ kind: "sparkline", label: "GPU power (W)", sensor: NVIDIA("gpu_board_power"), history: 80, span: 5, color: SAMPLE_ACCENT }),
      vbar({ rowSpan: 3 }),
      sw({ kind: "bar", label: "RAM USED", sensor: "libre.total_memory_memory_used", max: 64, span: 3 }),
      sw({ kind: "stat", label: "Load", sensor: NVIDIA("d3d_3d"), unit: "%", fontSize: 13 }),
      sw({ kind: "stat", label: "Power W", sensor: NVIDIA("gpu_board_power"), fontSize: 13 }),
      sw({ kind: "bar", label: "RAM FREE", sensor: "libre.total_memory_memory_available", max: 64, span: 3 }),
      sw({ kind: "stat", label: "Mem °", sensor: NVIDIA("gpu_memory_junction"), fontSize: 13 }),
      sw({ kind: "stat", label: "Core °", sensor: NVIDIA("gpu_core"), fontSize: 13 }),
    ],
  });

  // — Bottom row, right: session summary — game, most played, news, dates.
  const sessionBlock = sp({
    title: "Session",
    background: "panel",
    layout: "grid",
    columns: 3,
    widgets: [
      sw({ kind: "text", label: "Game", sensor: STEAM("SteamAPI-Session.current-game") }),
      sw({ kind: "text", label: "News", sensor: STEAM("SteamAPI-News.library-news"), rowSpan: 2 }),
      sw({ kind: "text", label: "Date", text: "Oct 07\nOct 06", align: "right", rowSpan: 2 }),
      sw({ kind: "text", sensor: STEAM("SteamAPI-Library.most-played-recent") }),
    ],
  });

  return {
    name: "Sample 1920×550",
    cols: 12,
    rows: 6,
    placements: [
      sampleModulePlacement("NowPlaying", 3, {
        colStart: 1,
        rowStart: 1,
        settings: { tint: true, layout: "compact", source: "spotify", progress: "bar" },
        design: { accent: SAMPLE_ACCENT },
      }),
      samplePanelPlacement(fpsRings, 3, { colStart: 1, rowStart: 2 }),
      samplePanelPlacement(network, 3, { colStart: 1, rowStart: 3 }),
      samplePanelPlacement(clockBlock, 5, {
        colStart: 4,
        rowStart: 1,
        rowSpan: 3,
      }),
      samplePanelPlacement(lastPlayed, 4, {
        colStart: 9,
        rowStart: 1,
        rowSpan: 3,
      }),
      samplePanelPlacement(weather, 4, {
        colStart: 1,
        rowStart: 4,
        rowSpan: 3,
      }),
      samplePanelPlacement(gpuBlock, 4, {
        colStart: 5,
        rowStart: 4,
        rowSpan: 3,
      }),
      samplePanelPlacement(sessionBlock, 4, {
        colStart: 9,
        rowStart: 4,
        rowSpan: 3,
      }),
    ],
  };
}
