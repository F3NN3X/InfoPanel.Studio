// Weather: current conditions and the days ahead, with the multi-day Forecast as one of its views. What the registry needs;
// the component is its own chunk.
import { tempUnitOf } from "@/modules/setting-readers";
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { BOTH, CARD, defineWidget } from "../define";
import { weatherIsland } from "../island/info";
import { boolSetting, enumSetting, formatSetting, iconsOf, numberOf, oneOf, pass, viewOnly, viewsExcept, viewSetting } from "../shared/settings-kit";
import { meta } from "./meta";
import type { WeatherProps } from "./Weather";

/** Weather's view and toggles, under the old Weather widget's keys. */
const WEATHER_ROWS: ModuleSetting[] = [
  viewSetting(meta, { label: "Preset", group: "Display", hint: "Sets the three toggles below. Change one and the preset reads Custom." }),
  { key: "showStats", label: "Stats row", type: "boolean", default: true, group: "Display" },
  { key: "showFeels", label: "Feels-like", type: "boolean", default: true, group: "Display" },
  { key: "showForecast", label: "Forecast strip", type: "boolean", default: true, group: "Display" },
  {
    key: "forecastDays",
    label: "Forecast days",
    type: "number",
    default: 5,
    // 0 = Auto: the Forecast view fits as many as the zone holds (a migrated Forecast widget's default, config v19)
    min: 0,
    max: 7,
    step: 1,
    group: "Display",
    hint: "0 = as many as fit in the Forecast view",
    visibleIf: (v) => v.showForecast !== false,
  },
  { key: "tint", label: "Tint from conditions", type: "boolean", default: true, tab: "style", perWidget: true },
  {
    key: "iconSet",
    label: "Icon set",
    type: "select",
    default: "app",
    options: [
      { value: "app", label: "App icons" },
      { value: "meteocons", label: "Meteocons" },
    ],
    group: "Icons",
    perWidget: true,
  },
  {
    key: "iconStyle",
    label: "Icon style",
    type: "select",
    default: "line",
    options: [
      { value: "fill", label: "Fill" },
      { value: "flat", label: "Flat" },
      { value: "line", label: "Line" },
      { value: "monochrome", label: "Monochrome" },
    ],
    group: "Icons",
    perWidget: true,
    visibleIf: (v) => v.iconSet === "meteocons",
  },
  {
    key: "iconAnimated",
    label: "Animated icons",
    type: "boolean",
    default: false,
    group: "Icons",
    perWidget: true,
    hint: "Animated icons use more CPU and memory on the kiosk, and run outside the Max FPS cap.",
    visibleIf: (v) => v.iconSet === "meteocons",
  },
  {
    key: "fxOn",
    label: "Animated background",
    type: "boolean",
    default: false,
    group: "Background",
    perWidget: true,
    hint: "Animated backgrounds use more CPU, GPU and memory on the kiosk. They follow Max FPS and stop when reduced motion is on.",
  },
  { key: "fxIntensity", label: "Intensity", type: "number", default: 1, min: 0.25, max: 2, step: 0.25, group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxDensity", label: "Particles", type: "number", default: 100, min: 25, max: 200, step: 25, group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxSpeed", label: "Speed", type: "number", default: 1, min: 0.5, max: 2, step: 0.25, group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxWind", label: "Wind", type: "select", default: "auto", options: [{ value: "auto", label: "Auto" }, { value: "none", label: "None" }, { value: "left", label: "Left" }, { value: "right", label: "Right" }], group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxLightning", label: "Lightning", type: "boolean", default: true, group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxClouds", label: "Clouds and fog", type: "boolean", default: true, group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxOpacity", label: "Strength", type: "number", default: 100, min: 20, max: 100, step: 10, group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
  { key: "fxPreview", label: "Show", type: "select", default: "auto", options: [{ value: "auto", label: "Live condition" }, { value: "clear", label: "Clear" }, { value: "cloudy", label: "Cloudy" }, { value: "rain", label: "Rain" }, { value: "snow", label: "Snow" }, { value: "hail", label: "Hail" }, { value: "thunder", label: "Thunder" }, { value: "fog", label: "Fog" }], group: "Background", perWidget: true, visibleIf: (v) => v.fxOn === true },
];
/**
 * The Forecast view without weather data but with other sensors: hidden (Weather's way), or its empty card (the Forecast
 * widget's, so config v19 turns it on for a migrated Forecast zone). It switches the view's gate (`prefixesWhen`, meta.ts).
 */
const EMPTY_CARD = viewOnly(meta, "forecast")(
  boolSetting("emptyCard", "Empty card without weather data", false, { group: "Display", hint: "Off hides the zone until the weather plugin reports; on draws the card, empty, once any sensor does" })
);
/** The views that draw the stats, feels-like and forecast strip toggles (Glance and Week have their own layout). */
const togglesShown = viewOnly(meta, "full", "now", "minimal");
/** The Forecast view is the Forecast widget: no tint, background or provider of its own. */
const notForecast = viewOnly(meta, ...viewsExcept(meta, "forecast"));
const WEATHER_GATE = (d: ModuleSetting): ModuleSetting =>
  ["showStats", "showFeels", "showForecast"].includes(d.key) ? togglesShown(d) : d.key === "tint" || d.key.startsWith("fx") ? notForecast(d) : d;

/**
 * The days shown (`forecastDays`): 1-7; 0 (and blank) is the view's own count, as many as fit in the Forecast view (the
 * Forecast widget's `days: 0`), 5 in the others, as before 0 was allowed.
 */
const daysOf = (s: ModuleSettings): number | undefined => {
  const n = numberOf(s.forecastDays);
  if (n) return Math.max(1, Math.min(7, Math.round(n)));
  return s.view === "forecast" ? undefined : 5;
};

/** The animated-background settings as the Weather props, each clamped to its range. */
const fxOf = (s: ModuleSettings): Partial<WeatherProps> => {
  const range = (v: unknown, lo: number, hi: number) => {
    const n = numberOf(v);
    return n === undefined ? undefined : Math.min(hi, Math.max(lo, n));
  };
  return {
    fxOn: s.fxOn === true,
    fxWind: oneOf(s.fxWind, ["auto", "none", "left", "right"]),
    fxPreview: oneOf(s.fxPreview, ["auto", "clear", "cloudy", "rain", "snow", "hail", "thunder", "fog"]),
    fxOpts: {
      intensity: range(s.fxIntensity, 0.25, 2),
      density: range(s.fxDensity, 25, 200),
      speed: range(s.fxSpeed, 0.5, 2),
      lightning: s.fxLightning !== false,
      clouds: s.fxClouds !== false,
      opacity: range(s.fxOpacity, 20, 100),
    },
  };
};

const yrLocation: ModuleSetting = { key: "location", label: "Location", type: "select", default: "", optionsFrom: "sources", sourcePlugin: "plugins.yr-weather-plugin.", group: "Source", tab: "data", hint: "Blank = the first Yr location" };

export default defineWidget({
  meta,
  // A summary card; the Forecast view (the Forecast widget until config v19) also has a dense view of its own.
  inspector: { header: "yes", compact: CARD, fmt: ["tempUnit"], byView: { forecast: { compact: BOTH } } },
  settings: [
    ...WEATHER_ROWS.map(WEATHER_GATE),
    EMPTY_CARD,
    notForecast(enumSetting("provider", "Provider", "auto", [{ value: "auto", label: "Auto" }, { value: "yr", label: "Yr" }, { value: "owm", label: "OpenWeatherMap" }], { group: "Source", tab: "data" })),
    // The Forecast view reads Yr whatever the provider.
    { ...yrLocation, visibleIf: (v) => v.view === "forecast" || v.provider !== "owm" },
    formatSetting("tempUnit"),
  ],
  island: weatherIsland,
  render: {
    load: () => import("./Weather"),
    // `units` is the themed Temperature unit (config v7 moved `units` → `tempUnit`).
    toProps: (s: ModuleSettings, saved?: ModuleSettings): Partial<WeatherProps> => ({
      ...pass<Partial<WeatherProps>>("location")(s),
      units: tempUnitOf(s) === "f" ? "F" : "C",
      provider: oneOf(s.provider, ["yr", "owm"]),
      view: s.view as WeatherProps["view"],
      tint: Boolean(s.tint),
      showStats: Boolean(s.showStats),
      showFeels: Boolean(s.showFeels),
      showForecast: Boolean(s.showForecast),
      days: daysOf(s),
      ...iconsOf(s),
      iconThemed: saved?.iconStyle === undefined,
      ...fxOf(s),
    }),
  },
  // Migrations and sample stay central (the default): in settings-migrate.ts config v7 moved `units` to `tempUnit`, and
  // config v19 (settings-migrate.v19.ts) made every Forecast placement this widget's forecast view; the sample is
  // src/widgets/__fixtures__/snapshot.json, with no widget-qa demo settings.
});
