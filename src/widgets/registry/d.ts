// Template widgets, group D: gaming (see docs/redesign/phase9/brief-9.3c-templates.md).
import type { DashboardModule, ModuleSetting, ModuleSettings, PaletteRole } from "@/modules/types";
import { templateModule } from "../module";
import { boolOf, boolSetting, colorSetting, colorsOf, enumSetting, listOf, numberOf, numberSetting, oneOf, splitKeys, textSetting, type ColorEntry } from "./settings-kit";
import Achievements, { meta as achievementsMeta, type AchievementsProps } from "../Achievements";
import FpsMonitor, { meta as fpsMonitorMeta, type FpsMonitorProps } from "../FpsMonitor";
import FramePacing, { meta as framePacingMeta, type FramePacingProps } from "../FramePacing";
import { FPS_LOOK_SETTINGS, fpsLookProps } from "../fps-settings";
import GameSpotlight, { meta as gameSpotlightMeta, type GameSpotlightProps } from "../GameSpotlight";
import { SPOTLIGHT_COMPOSITE_SETTINGS, SPOTLIGHT_LAYOUT_SETTING, compositeProps } from "../spotlight-settings";
import OsdStrip, { meta as osdStripMeta, type OsdCell, type OsdStripProps } from "../OsdStrip";
import PlaytimeShare, { PALETTE, meta as playtimeShareMeta, type PlaytimeShareProps } from "../PlaytimeShare";
import SteamGame, { meta as steamGameMeta, type SteamGameProps } from "../SteamGame";
import SteamLibrary, { meta as steamLibraryMeta, type SteamLibraryProps } from "../SteamLibrary";
import SteamNews, { meta as steamNewsMeta, type SteamNewsProps } from "../SteamNews";
import SteamProfile, { meta as steamProfileMeta, type SteamProfileProps } from "../SteamProfile";
import SteamFriends, { meta as steamFriendsMeta, type FriendStatus, type SteamFriendsProps } from "../SteamFriends";
import { steamFriendsIsland } from "../island-sources";
import { achievementsIsland, fpsIsland, steamNewsIsland } from "../island/gaming";

const OSD_CELLS = ["fps", "low", "ft", "gpu", "cpu", "vram", "display"] as const satisfies readonly OsdCell[];

/** An fps target, where 0 (and anything below) means the display's refresh rate. */
const targetOf = (v: unknown): number | undefined => {
  const n = numberOf(v);
  return n !== undefined && n > 0 ? n : undefined;
};
const targetSetting = numberSetting("target", "FPS target (0 = refresh rate)", 0, { min: 0, max: 360, step: 5, group: "Target", tab: "data" });

/** The gauge and trend views read the metrics, sparkline and colours; the frame-time graph reads none of them. */
const gaugeOnly = (d: ModuleSetting): ModuleSetting => ({ ...d, visibleIf: (v) => v.view !== "frametime" });
/** GameSpotlight layouts that draw their own fixed gradient instead of the scrim. */
const FIXED_SCRIM = ["ticker", "poster"];
const layoutIs = (...layouts: string[]) => (v: ModuleSettings) => layouts.includes(String(v.spotlightLayout));

/** The friend statuses' colours follow the theme: in-game Series 1, online OK, away Warning, busy Critical, offline Series 2. */
const FRIEND_COLOR_ENTRIES: (ColorEntry & { role: PaletteRole })[] = (
  [
    ["ingame", "In-game", "s1"],
    ["online", "Online", "ok"],
    ["away", "Away", "warn"],
    ["busy", "Busy", "crit"],
    ["offline", "Offline", "s2"],
  ] satisfies [FriendStatus, string, PaletteRole][]
).map(([entry, label, role]) => ({ entry, key: `${entry}Color`, label, role }));

/** The slices follow the theme's Series 1 to 6. */
const PLAYTIME_ROLES = ["s1", "s2", "s3", "s4", "s5", "s6"] as const satisfies readonly PaletteRole[];
const PLAYTIME_COLORS: ColorEntry[] = PALETTE.map((_, i) => ({ entry: String(i), key: `color${i + 1}`, label: `Slice ${i + 1}` }));
/** The slice colours: a stored `colors` list, else the per-slice colours (an unset slice keeps its default). */
function playtimeColors(s: ModuleSettings): string[] | undefined {
  const list = listOf(s.colors, (x) => (typeof x === "string" && x ? x : undefined));
  if (list?.length) return list;
  const set = PLAYTIME_COLORS.map((c) => String(s[c.key] ?? "").trim());
  return set.some(Boolean) ? set.map((c, i) => c || PALETTE[i]) : undefined;
}

/** Budget lines in Hz: a stored list or a comma-separated string ("" = the widget's default). */
const hzList = (v: unknown): number[] | undefined => {
  const l = Array.isArray(v) ? listOf(v, numberOf) : splitKeys(v).map(numberOf).filter((n): n is number => n !== undefined);
  return l?.length ? l : undefined;
};

export const GROUP_D: DashboardModule[] = [
  templateModule<Pick<FpsMonitorProps, "target" | "view" | "showMetrics" | "sparkline" | "ringColor" | "sparkColor">>({
    meta: fpsMonitorMeta,
    Component: FpsMonitor,
    settings: [
      {
        key: "view",
        label: "View",
        type: "preset",
        default: "frametime",
        options: [
          // The frame-time graph draws none of the toggles, so any of their values suits it.
          { value: "frametime", label: "Frame-time graph", applies: {} },
          { value: "gauge", label: "Gauge", applies: { sparkline: false } },
          { value: "trend", label: "Trend", applies: { sparkline: true } },
        ],
        group: "Display",
        hint: "Trend is the gauge with the sparkline on.",
      },
      ...FPS_LOOK_SETTINGS.map(gaugeOnly),
      targetSetting,
    ],
    toProps: (s: ModuleSettings) => ({ target: targetOf(s.target), ...fpsLookProps(s) }),
    island: fpsIsland,
  }),
  templateModule<Pick<GameSpotlightProps, "layout" | "motion" | "scrim" | "music" | "progress" | "vizMode" | "showStats" | "showNews">>({
    meta: gameSpotlightMeta,
    Component: GameSpotlight,
    settings: [
      SPOTLIGHT_LAYOUT_SETTING,
      ...SPOTLIGHT_COMPOSITE_SETTINGS.map((d) => ({ ...d, visibleIf: layoutIs("composite") })),
      enumSetting("music", "Music source", "media", [{ value: "media", label: "Media" }, { value: "spotify", label: "Spotify" }], { group: "Music card", visibleIf: layoutIs("combo") }),
      enumSetting("progress", "Music progress", "wave", [{ value: "wave", label: "Wave" }, { value: "visualizer", label: "Visualizer" }], { group: "Music card", visibleIf: layoutIs("combo") }),
      enumSetting("vizMode", "Visualizer mode", "bars", ["bars", "mirror", "wave", "dots", "line"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), { group: "Music card", visibleIf: (v) => layoutIs("combo")(v) && v.progress === "visualizer" }),
      numberSetting("scrim", "Scrim darkness", 0.6, { min: 0, max: 1, step: 0.05, tab: "style", perWidget: true, visibleIf: (v) => !FIXED_SCRIM.includes(String(v.spotlightLayout)) }),
      boolSetting("motion", "Ken Burns motion", true, { group: "Dynamics", tab: "behaviour", visibleIf: (v) => v.spotlightLayout !== "poster" }),
    ],
    toProps: (s) => ({
      // The standard `layout` keeps its meaning; the template's own layout is stored as `spotlightLayout`.
      layout: oneOf(s.spotlightLayout, ["hero", "poster", "logo", "ticker", "combo", "composite"]),
      ...compositeProps(s),
      motion: typeof s.motion === "boolean" ? s.motion : undefined,
      scrim: numberOf(s.scrim),
      music: oneOf(s.music, ["media", "spotify"]),
      progress: oneOf(s.progress, ["wave", "visualizer"]),
      vizMode: oneOf(s.vizMode, ["bars", "mirror", "wave", "dots", "line"]),
    }),
  }),
  templateModule<Pick<OsdStripProps, "cells" | "target">>({
    meta: osdStripMeta,
    Component: OsdStrip,
    settings: [
      enumSetting(
        "cells",
        "Cells",
        OSD_CELLS.join(","),
        [
          { value: "fps", label: "FPS" },
          { value: "low", label: "1% low" },
          { value: "ft", label: "Frame time" },
          { value: "gpu", label: "GPU" },
          { value: "cpu", label: "CPU" },
          { value: "vram", label: "VRAM" },
          { value: "display", label: "Display" },
        ],
        { multiple: true, group: "Cells" },
      ),
      targetSetting,
    ],
    toProps: (s) => {
      // A stored list (older configs) or the multi-select's comma-separated string; empty keeps every cell.
      const cells = Array.isArray(s.cells) ? listOf(s.cells, (x) => oneOf(x, OSD_CELLS)) : splitKeys(s.cells).flatMap((c) => oneOf(c, OSD_CELLS) ?? []);
      return { cells: cells?.length ? cells : undefined, target: targetOf(s.target) };
    },
  }),
  templateModule<Pick<FramePacingProps, "budgets" | "window">>({
    meta: framePacingMeta,
    Component: FramePacing,
    settings: [
      textSetting("budgets", "Budget lines (Hz, comma-separated)", "", { group: "Budget lines", hint: "Empty = refresh rate and 60" }),
      numberSetting("window", "Samples", 120, { min: 30, max: 600, step: 10, group: "History", tab: "behaviour" }),
    ],
    toProps: (s) => ({ budgets: hzList(s.budgets), window: numberOf(s.window) }),
  }),
  templateModule<Pick<PlaytimeShareProps, "colors">>({
    meta: playtimeShareMeta,
    Component: PlaytimeShare,
    settings: PLAYTIME_COLORS.map((c, i) => colorSetting(c.key, c.label, { role: PLAYTIME_ROLES[i], more: false })),
    toProps: (s) => ({ colors: playtimeColors(s) }),
  }),
  // No own settings: Data shows where the profile comes from (read-only), so the tab is not empty.
  templateModule<Pick<SteamProfileProps, never>>({
    meta: steamProfileMeta,
    Component: SteamProfile,
    settings: [{ key: "account", label: "Steam API", type: "status", default: "", sourcePlugin: "plugins.InfoPanel.SteamAPI.", group: "Account", tab: "data" }],
    toProps: () => ({}),
  }),
  templateModule<Pick<SteamFriendsProps, "view" | "sort" | "showCounts" | "ingameOnly" | "showTime" | "colors">>({
    meta: steamFriendsMeta,
    Component: SteamFriends,
    settings: [
      enumSetting("view", "View", "list", [{ value: "list", label: "List" }, { value: "table", label: "Table" }], { group: "Friends" }),
      boolSetting("ingameOnly", "In-game only", false, { group: "Friends" }),
      boolSetting("showTime", "Last online", true, { group: "Friends" }),
      boolSetting("showCounts", "Counts row", false, { group: "Friends" }),
      ...FRIEND_COLOR_ENTRIES.map((c) => colorSetting(c.key, c.label, { role: c.role, more: false })),
      enumSetting("sort", "Sort", "status", [{ value: "status", label: "Status (in-game first)" }, { value: "name", label: "Name" }, { value: "plugin", label: "Plugin order" }], { group: "Sorting", tab: "behaviour" }),
    ],
    island: steamFriendsIsland,
    toProps: (s) => ({
      view: oneOf(s.view, ["list", "table"]),
      sort: oneOf(s.sort, ["status", "name", "plugin"]),
      ingameOnly: boolOf(s.ingameOnly),
      showTime: boolOf(s.showTime),
      showCounts: boolOf(s.showCounts),
      colors: colorsOf(s, FRIEND_COLOR_ENTRIES),
    }),
  }),
  templateModule<Pick<SteamGameProps, "art" | "scrim">>({
    meta: steamGameMeta,
    Component: SteamGame,
    settings: [
      enumSetting("art", "Artwork", "banner", [{ value: "banner", label: "Banner" }, { value: "grid", label: "Grid" }, { value: "none", label: "None" }], { group: "Artwork" }),
      numberSetting("scrim", "Scrim darkness", 0.55, { min: 0, max: 1, step: 0.05, tab: "style", perWidget: true }),
    ],
    toProps: (s) => ({ art: oneOf(s.art, ["banner", "grid", "none"]), scrim: numberOf(s.scrim) }),
  }),
  templateModule<Pick<AchievementsProps, "display">>({
    meta: achievementsMeta,
    Component: Achievements,
    settings: [enumSetting("display", "Progress display", "ring", [{ value: "ring", label: "Ring" }, { value: "pips", label: "Pips" }], { group: "Progress" })],
    toProps: (s) => ({ display: oneOf(s.display, ["ring", "pips"]) }),
    island: achievementsIsland,
  }),
  templateModule<Pick<SteamLibraryProps, "showNews">>({
    meta: steamLibraryMeta,
    Component: SteamLibrary,
    settings: [
      enumSetting("showNews", "News list", "auto", [{ value: "auto", label: "Auto (large only)" }, { value: "on", label: "On" }, { value: "off", label: "Off" }], { group: "News list" }),
    ],
    toProps: (s) => ({ showNews: s.showNews === "on" || s.showNews === true ? true : s.showNews === "off" || s.showNews === false ? false : undefined }),
  }),
  templateModule<Pick<SteamNewsProps, "lines">>({
    meta: steamNewsMeta,
    Component: SteamNews,
    settings: [numberSetting("lines", "Title lines", 2, { min: 1, max: 4, step: 1, group: "Headlines" })],
    toProps: (s) => ({ lines: numberOf(s.lines) }),
    island: steamNewsIsland,
  }),
];
