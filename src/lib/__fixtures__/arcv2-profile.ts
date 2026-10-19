import { PANEL_ID, uid, type MonitorProfile, type PanelDef, type Placement, type Widget, type WidgetKind } from "../layout";
import { mainPage } from "../pages";
import { YR_FORECAST_KEY } from "../sensors";

/*
 * Test fixture: the ARCv2 profile earlier versions shipped — a faithful recreation of the "ARCv2 WIDE"
 * InfoPanel export (1920×550) as a 3×3 grid of 4-wide panels:
 *
 *   Left   (C1–4)  : spotify (rows 1–2) · network (3–4) · weather (5–6)
 *   Center (C5–8)  : gpu readout (1–2) · big clock (3–4) · cpu strip (5–6)
 *   Right  (C9–12) : steam hero (1–2) · friends (3–4) · news (5–6)
 *
 * No longer shipped; stored configs keep their copy. Its panels stay as rich fixtures for the panel
 * loader and renderer tests (overlays, CSS hooks, background art).
 */

/** Shorthand for building panel widgets with fresh ids. */
function sw(fields: Partial<Widget> & { kind: WidgetKind }): Widget {
  return { id: uid("w"), visible: true, ...fields };
}

const ARCV2_PROFILE_ID = "arcv2";

/** The export's yellow accent (#FFFFBC13 in Profile/DisplayItems.xml). */
const ARCV2_ACCENT = "#ffbc13";
/** Cream value text on the export's light panels. */
const ARCV2_DARK = "#3b3b3b";
/** Dark-navy text on the yellow SPOTIFY card. */
const ARCV2_NAVY = "#090d19";
/** Teal network bars from the export. */
const ARCV2_TEAL = "#3d94a8";
/** Warm off-white used for the export's secondary text. */
const ARCV2_CREAM = "#ebe6d7";
const ARCV2_FAINT = "#ffffffe0";

const RTSS = (n: string) => `plugins.InfoPanel.RTSS.rtss.${n}`;
const STEAM = (n: string) => `plugins.InfoPanel.SteamAPI.${n}`;
const NVIDIA = (n: string) => `libre.nvidia_geforce_rtx_5090_${n}`;
const WEATHER = (n: string) => `plugins.yr-weather-plugin.brevik-norway.${n}`;
const AMD = (n: string) => `libre.amd_ryzen_9_9950x3d_${n}`;
const SPOTIFY = (n: string) => `plugins.spotify-plugin.spotify.${n}`;
/** InfoPanel export assets, shipped in public/assets/ip/arcv2/. */
const ASSET = (f: string) => `/assets/ip/arcv2/${f}`;

/** Shorthand for arcv2 panels (title hidden, no card background). */
function ap(
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

interface ArcPlacementOpts {
  colStart: number;
  rowStart: number;
  rowSpan?: number;
}

function apPlacement(panel: PanelDef, colSpan: number, opts: ArcPlacementOpts): Placement {
  return {
    id: uid(PANEL_ID),
    module: PANEL_ID,
    colSpan,
    colStart: opts.colStart,
    rowStart: opts.rowStart,
    rowSpan: opts.rowSpan ?? 1,
    visible: true,
    panel,
  };
}

export function arcv2Profile(): MonitorProfile {
  // — Right column, rows 1–2: the steam hero. Banner + dark scrim with
  //   status, session timer, start time and total hours (the export's
  //   "Current Game" title is hidden in the source, kept faithful).
  const steamTop = ap({
    title: "Steam hero",
    accent: ARCV2_ACCENT,
    layout: "overlay",
    widgets: [
      sw({ kind: "image", sensor: STEAM("SteamAPI-Profile.current_game_banner_url"), asBackground: true }),
      sw({ kind: "image", sensor: STEAM("SteamAPI-Profile.game_icon_url"), height: 30, overlayZone: "top" }),
      sw({ kind: "text", label: "Status", sensor: STEAM("SteamAPI-Profile.status"), fontSize: 13, color: ARCV2_FAINT, overlayZone: "top" }),
      sw({ kind: "text", sensor: STEAM("SteamAPI-Session.current-game"), fontSize: 24, color: ARCV2_FAINT, overlayZone: "top", visible: false }),
      sw({ kind: "value", sensor: STEAM("SteamAPI-Session.current-session-time"), label: "in game", fontSize: 20, color: "#ffffff", overlayZone: "middle" }),
      sw({ kind: "text", label: "Started", sensor: STEAM("SteamAPI-Session.session-start-time"), fontSize: 14, color: ARCV2_FAINT, overlayZone: "bottom" }),
      sw({ kind: "value", label: "hrs total", sensor: STEAM("SteamAPI-Library.recent-playtime"), fontSize: 14, color: ARCV2_FAINT, align: "right", overlayZone: "bottom" }),
    ],
  });

  // — Center column, rows 1–2: the GPU block. The export's cream GPU-bg
  //   panel (no scrim) with the big yellow FPS readout, 1% low + frame
  //   time, and the four stat columns the background art pre-prints.
  const gpu = ap({
    title: "GPU",
    accent: ARCV2_ACCENT,
    layout: "overlay",
    scrim: false,
    bottomGridCols: 5,
    widgets: [
      sw({ kind: "image", text: ASSET("GPU-bg.png"), asBackground: true }),
      sw({ kind: "text", label: "Capturing:", sensor: RTSS("windowtitle"), fontSize: 16, color: ARCV2_DARK, overlayZone: "top" }),
      // Middle: the big yellow FPS headline + frame time (the "1%/MS" pair).
      sw({ kind: "value", sensor: RTSS("fps"), fontSize: 49, color: ARCV2_ACCENT, overlayZone: "middle" }),
      sw({ kind: "value", sensor: RTSS("current frame time"), unit: "ms", fontSize: 14, color: ARCV2_DARK, overlayZone: "middle" }),
      // Bottom: five value cells sitting under the art's pre-printed columns
      // (1%/MS · POWER W · MEM ° · CORE ° · LOAD) — value-only, the labels
      // are already baked into GPU-bg.png.
      sw({ kind: "value", sensor: RTSS("1% low fps"), fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: NVIDIA("gpu_package"), unit: "W", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: NVIDIA("gpu_memory_junction"), unit: "°C", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: NVIDIA("gpu_core"), unit: "MHz", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: NVIDIA("d3d_3d"), unit: "%", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
    ],
  });

  // — Right column, rows 3–4: the friends table (the export's "Friends"
  //   group: name, status, current game, last-seen).
  const friends = ap({
    title: "Friends",
    accent: ARCV2_ACCENT,
    layout: "grid",
    columns: 1,
    widgets: [
      sw({ kind: "text", label: "Friends", fontSize: 13, color: ARCV2_FAINT }),
      sw({ kind: "table", sensor: STEAM("SteamAPI-Social.friends-activity"), rows: 4, columns: 4, header: "Friend, Status, Playing, Last Online" }),
    ],
  });

  // — Right column, rows 5–6: game news (the export's bottom-right news
  //   group: the current game's headline + the library feed).
  const news = ap({
    title: "News",
    accent: ARCV2_ACCENT,
    layout: "grid",
    columns: 2,
    widgets: [
      sw({ kind: "text", label: "News", sensor: STEAM("SteamAPI-News.current_game_news_title"), fontSize: 16, color: "#ffffff", span: 2 }),
      sw({ kind: "text", label: "Library", sensor: STEAM("SteamAPI-News.library-news"), fontSize: 12, color: ARCV2_FAINT, span: 2 }),
    ],
  });

  // — Center column, rows 5–6: the CPU strip (the export's CPU group):
  //   rolling load sparkline, RAM used/free bars and the stat columns
  //   pre-printed on the CPU-bg art.
  const cpuStrip = ap({
    title: "CPU",
    accent: ARCV2_ACCENT,
    layout: "overlay",
    scrim: false,
    bottomGridCols: 4,
    widgets: [
      sw({ kind: "image", text: ASSET("CPU-bg.png"), asBackground: true }),
      // Top: the rolling CPU-load sparkline across the panel.
      sw({ kind: "sparkline", sensor: AMD("cpu_total"), label: "", history: 60, color: ARCV2_ACCENT, overlayZone: "top" }),
      // Middle: the RAM used / free bars.
      sw({ kind: "bar", label: "RAM USED", sensor: "system.ram.load", max: 100, color: ARCV2_ACCENT, overlayZone: "middle" }),
      sw({ kind: "bar", label: "RAM FREE", sensor: "system.ram.free", max: 100, color: ARCV2_TEAL, overlayZone: "middle" }),
      // Bottom: four value cells under the art's pre-printed columns
      // (LOAD · POWER W · MEM ° · CORE °) — value-only, labels are baked
      // into CPU-bg.png.
      sw({ kind: "value", sensor: AMD("cpu_total"), unit: "%", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: AMD("package"), unit: "W", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: "libre.kingston___kf560c36_32___1__dimm__1", unit: "°C", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: AMD("core__tctl_tdie"), unit: "°C", fontSize: 18, color: ARCV2_DARK, overlayZone: "bottom" }),
    ],
  });

  // — Center column, rows 3–4: the big yellow clock with the date below
  //   (the export's Clock 63px + Calendar 23px), centered across the
  //   column between two thin accent bars.
  const clockPanel = ap({
    title: "Clock",
    accent: ARCV2_ACCENT,
    layout: "grid",
    columns: 3,
    gridCols: "14px 1fr 14px",
    widgets: [
      sw({ kind: "shape", shape: "vbar", thickness: 5, color: ARCV2_ACCENT }),
      sw({ kind: "clock", clock: "both", fontSize: 52, color: ARCV2_ACCENT, align: "center" }),
      sw({ kind: "shape", shape: "vbar", thickness: 5, color: ARCV2_ACCENT }),
    ],
  });

  // — Left column, row 3: the FPS ring row (the export's six gauges:
  //   frame-rate readouts plus GPU core clock and memory temperature).
  const fpsRings = ap({
    title: "FPS rings",
    accent: ARCV2_ACCENT,
    layout: "grid",
    columns: 6,
    widgets: [
      sw({ kind: "gauge", sensor: RTSS("fps"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: RTSS("avg-fps"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: RTSS("1% low fps"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: RTSS("refreshrate"), max: 240, size: 56 }),
      sw({ kind: "gauge", sensor: NVIDIA("gpu_core"), max: 3500, size: 56 }),
      sw({ kind: "gauge", sensor: NVIDIA("gpu_memory_junction"), max: 100, size: 56 }),
    ],
  });

  // — Left column, rows 1–2: the SPOTIFY card (yellow panel art from the
  //   export, dark-navy text, cover art in the white slot).
  const spotify = ap({
    title: "Spotify",
    accent: ARCV2_ACCENT,
    layout: "overlay",
    scrim: false,
    widgets: [
      sw({ kind: "image", text: ASSET("SPOTIFY.png"), asBackground: true }),
      sw({ kind: "text", label: "Artist", sensor: SPOTIFY("artist"), fontSize: 19, color: ARCV2_NAVY, overlayZone: "top" }),
      sw({ kind: "text", sensor: SPOTIFY("current-track"), fontSize: 22, color: ARCV2_NAVY, overlayZone: "top" }),
      sw({ kind: "image", sensor: SPOTIFY("cover-art"), height: 90, overlayZone: "top" }),
      sw({ kind: "bar", sensor: SPOTIFY("track-progress"), max: 100, color: ARCV2_NAVY, overlayZone: "middle" }),
      sw({ kind: "value", sensor: SPOTIFY("elapsed-time"), fontSize: 15, color: ARCV2_NAVY, overlayZone: "bottom" }),
      sw({ kind: "value", sensor: SPOTIFY("remaining-time"), fontSize: 15, color: ARCV2_NAVY, visible: false, overlayZone: "bottom" }),
    ],
  });

  // — Left column, row 4: network (the export's NETWORK panel: dark
  //   art with pre-printed labels, teal speed bars, GB/s values).
  const network = ap({
    title: "Network",
    accent: ARCV2_ACCENT,
    layout: "overlay",
    scrim: false,
    widgets: [
      sw({ kind: "image", text: ASSET("NETWORK-bg.png"), asBackground: true }),
      sw({ kind: "bar", sensor: "libre.ethernet_upload_speed", max: 10_000_000, color: ARCV2_TEAL, scale: 1e-9, decimals: 3, unit: "GB/s", overlayZone: "top" }),
      sw({ kind: "bar", sensor: "libre.ethernet_download_speed", max: 10_000_000, color: ARCV2_TEAL, scale: 1e-9, decimals: 3, unit: "GB/s", overlayZone: "top" }),
      sw({ kind: "value", sensor: "libre.ethernet_upload_speed", fontSize: 12, color: ARCV2_ACCENT, scale: 1e-9, decimals: 3, unit: "GB/s", overlayZone: "bottom" }),
      sw({ kind: "value", sensor: "libre.ethernet_download_speed", fontSize: 12, color: ARCV2_ACCENT, scale: 1e-9, decimals: 3, unit: "GB/s", overlayZone: "bottom" }),
    ],
  });

  // — Left column, rows 5–6: weather (current conditions + 7-day
  //   forecast from the bridge's own fetch).
  const weather = ap({
    title: "Weather",
    accent: ARCV2_ACCENT,
    layout: "grid",
    columns: 4,
    widgets: [
      sw({ kind: "image", sensor: WEATHER("weather_icon_url"), height: 36 }),
      sw({ kind: "text", sensor: WEATHER("weather_desc"), fontSize: 14, color: ARCV2_CREAM }),
      sw({ kind: "stat", sensor: WEATHER("temp"), unit: "°C", fontSize: 14, color: ARCV2_CREAM }),
      sw({ kind: "value", sensor: WEATHER("wind_speed"), label: "Wind", unit: "m/s", fontSize: 11, color: ARCV2_CREAM }),
      sw({ kind: "table", sensor: YR_FORECAST_KEY, rows: 7, columns: 5, fontSize: 14, header: "Date, Weather, Temp, Precip, Wind", span: 4 }),
    ],
  });

  return {
    id: ARCV2_PROFILE_ID,
    name: "ARCv2",
    width: 1920,
    height: 550,
    cols: 12,
    rows: 6,
    fit: "fill",
    pages: [mainPage([
      // Left column (C1–4): spotify, fps rings, network, weather.
      apPlacement(spotify, 4, { colStart: 1, rowStart: 1, rowSpan: 2 }),
      apPlacement(fpsRings, 4, { colStart: 1, rowStart: 3, rowSpan: 1 }),
      apPlacement(network, 4, { colStart: 1, rowStart: 4, rowSpan: 1 }),
      apPlacement(weather, 4, { colStart: 1, rowStart: 5, rowSpan: 2 }),
      // Center column (C5–8): gpu readout, big clock, cpu strip.
      apPlacement(gpu, 4, { colStart: 5, rowStart: 1, rowSpan: 2 }),
      apPlacement(clockPanel, 4, { colStart: 5, rowStart: 3, rowSpan: 2 }),
      apPlacement(cpuStrip, 4, { colStart: 5, rowStart: 5, rowSpan: 2 }),
      // Right column (C9–12): steam hero, friends, news.
      apPlacement(steamTop, 4, { colStart: 9, rowStart: 1, rowSpan: 2 }),
      apPlacement(friends, 4, { colStart: 9, rowStart: 3, rowSpan: 2 }),
      apPlacement(news, 4, { colStart: 9, rowStart: 5, rowSpan: 2 }),
    ])],
  };
}
