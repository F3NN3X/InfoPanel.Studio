// Template widgets, group B: storage, network, info, generic (see docs/redesign/phase9/brief-9.3c-templates.md).
import { clockOf, decimalsOf, deviceOf, tempUnitOf, thresholdsOf } from "@/modules/setting-readers";
import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { templateModule } from "../module";
import { boolOf, boolSetting, colorSetting, dateSetting, deviceSetting, enumSetting, formatSetting, itemsOf, numberOf, numberSetting, oneOf, pass, rateUnitOf, rateUnitSetting, sensorSetting, splitKeys, stringOf, textSetting, thresholdSetting, timeSetting, viewOnly, viewsExcept, viewSetting } from "./settings-kit";
import { driveSpaceIsland, networkAdaptersIsland, networkThroughputIsland } from "../island/hardware";
import { weatherIsland } from "../island/info";
import { countdownIsland } from "../island/countdown";
import { timerIsland } from "../island/timer";
import * as DriveSpace from "../DriveSpace";
import * as StorageHealth from "../StorageHealth";
import * as DiskIO from "../DiskIO";
import * as NetworkThroughput from "../NetworkThroughput";
import * as NetworkAdapters from "../NetworkAdapters";
import * as Clock from "../Clock";
import * as Calendar from "../Calendar";
import * as Timer from "../Timer";
import * as Countdown from "../Countdown";
import * as StatusBar from "../StatusBar";
import { ITEMS, ITEM_LABELS } from "../StatusBar/items";
import { isDate, isTime } from "@/lib/countdown";
import * as CodingAgents from "../CodingAgents";
import * as Weather from "../Weather";
import * as Forecast from "../Forecast";
import * as SensorValue from "../SensorValue";
import * as SensorGroup from "../SensorGroup";
import * as CustomGauge from "../CustomGauge";

/** "5, 15, 25" → [5, 15, 25]: whole minutes 1-1440, at most eight. */
export const presetsOf = (v: unknown): number[] | undefined => {
  const list = String(v ?? "")
    .split(",")
    .map((x) => Math.round(Number(x.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 1440)
    .slice(0, 8);
  return list.length ? list : undefined;
};
/** A number where blank = the widget's own default. */
const optional = (key: string, label: string, group: string, hint?: string): ModuleSetting => textSetting(key, label, "", { group, hint });

/** The stored numbers among `keys`, as props of the same name (blank or non-numeric = left out). */
const numbersOf = <K extends string>(s: ModuleSettings, keys: readonly K[]): Partial<Record<K, number>> =>
  Object.fromEntries(keys.flatMap((k) => (numberOf(s[k]) === undefined ? [] : [[k, numberOf(s[k])]]))) as Partial<Record<K, number>>;

const DRIVE_SETTINGS: ModuleSetting[] = [
  viewSetting(DriveSpace.meta, { group: "Drive" }),
  deviceSetting("Drive", "drive", { group: "Drive", hint: "Pin one volume; Auto lists all" }),
  enumSetting("sort", "Sort", "usage", [{ value: "usage", label: "By usage" }, { value: "name", label: "By name" }], { group: "Sorting", tab: "behaviour" }),
  // Segments and Bars always colour by fullness.
  viewOnly(DriveSpace.meta, "list")(boolSetting("neutral", "Neutral below thresholds", true, { tab: "style", perWidget: true })),
  thresholdSetting("full"),
];

/** A stored number where 0 (and blank) = off / automatic. */
const positiveOf = (v: unknown): number | undefined => numberOf(v) || undefined;
/** Decimals with 3 and 4 kept for a single reading (SPEC §6.2). */
const FINE_DECIMALS = formatSetting("decimals", { options: ["auto", "0", "1", "2", "3", "4"].map((value) => ({ value, label: value === "auto" ? "Auto" : value })) });
/** A sensor's own thresholds: off until set (blank was off), unless the theme sets the Value levels. */
const valueThresholds = (extra: Partial<ModuleSetting> = {}): ModuleSetting => thresholdSetting("value", { default: "off", defaultY: "off", ...extra });
const ranged = (v: ModuleSettings): boolean => v.display === "gauge" || v.display === "bar";

const SENSOR_VALUE_SETTINGS: ModuleSetting[] = [
  enumSetting("display", "Display", "value", [{ value: "value", label: "Value" }, { value: "gauge", label: "Gauge" }, { value: "bar", label: "Bar" }, { value: "spark", label: "Spark" }], { group: "Display" }),
  optional("unit", "Unit override", "Display", "Blank = the unit read from the value"),
  sensorSetting("sensor", "Sensor", { group: "Reading" }),
  numberSetting("min", "Minimum", 0, { group: "Bar scale", tab: "data", visibleIf: ranged }),
  numberSetting("max", "Maximum", 0, { group: "Bar scale", tab: "data", hint: "0 = automatic", visibleIf: ranged }),
  FINE_DECIMALS,
  valueThresholds(),
];

// SensorGroup's `sensors` are stored as ordered keys (labelled from the sensor display name); the bar range, decimals and thresholds are shared by every item, and `items` overrides them (and the label) per sensor.
/** Pick sensors (the list) or Auto-discover (every hardware reading); `mode` was the `auto` toggle until config v8. */
const discovered = (v: ModuleSettings): boolean => v.mode === "auto";
const listed = (v: ModuleSettings): boolean => !discovered(v);
const SENSOR_GROUP_SETTINGS: ModuleSetting[] = [
  enumSetting("mode", "Readings", "pick", [{ value: "pick", label: "Pick sensors" }, { value: "auto", label: "Auto-discover" }], { group: "Readings" }),
  viewSetting(SensorGroup.meta, { label: "Layout", group: "Readings", visibleIf: listed }),
  boolSetting("bars", "Bar per item", true, { group: "Readings", visibleIf: listed }),
  numberSetting("maxRows", "Max rows (0 = all)", 12, { min: 0, max: 100, step: 2, group: "Readings", visibleIf: discovered }),
  // The dots of the discovered list: the theme's Critical, Series 3 and Series 5 ("" = red, blue, amber).
  colorSetting("tempColor", "Temperature dot", { role: "crit", more: false, visibleIf: discovered }),
  colorSetting("fanColor", "Fan dot", { role: "s3", more: false, visibleIf: discovered }),
  colorSetting("powerColor", "Power dot", { role: "s5", more: false, visibleIf: discovered }),
  // `items` (per-sensor overrides, a JSON object string) is tuned inline on each listed sensor.
  sensorSetting("sensors", "Sensors", { keyY: "items", defaultY: "", group: "Sensors", tab: "data", multiple: true, hint: "Empty = CPU, GPU, memory and volume. Tune a row to override its label, bar maximum, thresholds or decimals.", visibleIf: listed }),
  numberSetting("groupMax", "Bar maximum", 0, { min: 0, max: 500, step: 10, group: "Bar scale", tab: "data", hint: "Every item; 0 = Auto (100 for % and °, else no bar)", visibleIf: listed }),
  // Discovered temperatures read in the unit too.
  formatSetting("tempUnit"),
  { ...FINE_DECIMALS, visibleIf: listed },
  valueThresholds({ visibleIf: listed }),
];

function sensorItems(s: ModuleSettings): SensorGroup.SensorGroupProps["sensors"] {
  const keys = splitKeys(s.sensors);
  if (!keys.length) return undefined;
  // 0 / blank bar maximum = automatic (SensorGroup derives it from the unit); unset decimals / levels = per reading / none
  const max = numberOf(s.groupMax) || undefined;
  const decimals = decimalsOf(s, "groupDecimals");
  const shared = { ...(max !== undefined ? { max } : {}), ...(decimals !== undefined ? { decimals } : {}), ...thresholdsOf(s, "value", ["groupWarn", "groupCrit"]) };
  const items = itemsOf(s.items);
  return keys.map((key) => ({ key, ...shared, ...items[key] }));
}

/** NetworkThroughput's view and toggles, under the old Network widget's keys. */
// The old `view` select (speeds / totals) only bundled these two switches; a stored `view` is ignored.
const NETWORK_SETTINGS: ModuleSetting[] = [
  { key: "showTotals", label: "Session totals", type: "boolean", default: true, group: "Traffic" },
  { key: "sparkline", label: "Trend sparkline", type: "boolean", default: false, group: "Traffic" },
  // The speeds follow the theme's Series 1 and 2 ("" = the widget's own colours).
  colorSetting("downloadColor", "Download", { role: "s1", more: false }),
  colorSetting("uploadColor", "Upload", { role: "s2", more: false }),
  rateUnitSetting(),
];

/** Weather's view and toggles, under the old Weather widget's keys. */
const WEATHER_ROWS: ModuleSetting[] = [
  viewSetting(Weather.meta, { label: "Preset", group: "Display", hint: "Sets the three toggles below. Change one and the preset reads Custom." }),
  { key: "showStats", label: "Stats row", type: "boolean", default: true, group: "Display" },
  { key: "showFeels", label: "Feels-like", type: "boolean", default: true, group: "Display" },
  { key: "showForecast", label: "Forecast strip", type: "boolean", default: true, group: "Display" },
  {
    key: "forecastDays",
    label: "Forecast days",
    type: "number",
    default: 5,
    min: 1,
    max: 7,
    step: 1,
    group: "Display",
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
/** The views that draw the stats, feels-like and forecast strip toggles (Glance and Week have their own layout). */
const togglesShown = viewOnly(Weather.meta, "full", "now", "minimal");
/** The Forecast view is the Forecast widget: no tint, background or provider of its own. */
const notForecast = viewOnly(Weather.meta, ...viewsExcept(Weather.meta, "forecast"));
const WEATHER_GATE = (d: ModuleSetting): ModuleSetting =>
  ["showStats", "showFeels", "showForecast"].includes(d.key) ? togglesShown(d) : d.key === "tint" || d.key.startsWith("fx") ? notForecast(d) : d;
const WEATHER_SETTINGS: ModuleSetting[] = WEATHER_ROWS.map(WEATHER_GATE);

/** The stored settings as the Weather template's props (`forecastDays` is its `days`). */
const weatherToProps = (s: ModuleSettings): Partial<Weather.WeatherProps> => ({
  view: s.view as Weather.WeatherProps["view"],
  tint: Boolean(s.tint),
  showStats: Boolean(s.showStats),
  showFeels: Boolean(s.showFeels),
  showForecast: Boolean(s.showForecast),
  days: Math.max(1, Math.min(7, Math.round(Number(s.forecastDays) || 5))),
  ...iconsOf(s),
  ...fxOf(s),
});

/** The animated-background settings as the Weather props, each clamped to its range. */
const fxOf = (s: ModuleSettings): Partial<Weather.WeatherProps> => {
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

/** The weather icon-set settings as the templates' icon props. */
const iconsOf = (s: ModuleSettings) => ({
  iconSet: oneOf(s.iconSet, ["app", "meteocons"]),
  iconStyle: oneOf(s.iconStyle, ["fill", "flat", "line", "monochrome"]),
  iconAnimated: s.iconAnimated === true,
});

/** The weather templates' `units` prop from the themed Temperature unit (config v7 moved `units` → `tempUnit`). */
const unitsOf = (s: ModuleSettings): "C" | "F" => (tempUnitOf(s) === "f" ? "F" : "C");
const yrLocation = (group: string): ModuleSetting => ({ key: "location", label: "Location", type: "select", default: "", optionsFrom: "sources", sourcePlugin: "plugins.yr-weather-plugin.", group, tab: "data", hint: "Blank = the first Yr location" });

/** A Status Bar slot: the stored comma-separated items that exist; undefined while unset (the bar's own). */
const slotOf = (v: unknown) => (v === undefined ? undefined : splitKeys(v).flatMap((k) => oneOf(k, ITEMS) ?? []));
const barUses = (...keys: (typeof ITEMS)[number][]) => (v: ModuleSettings) => [v.left ?? "logo", v.center ?? "date,time", v.right ?? "weather,network,volume,battery"].some((s) => splitKeys(s).some((k) => (keys as string[]).includes(k)));
const BAR_ITEMS = ITEMS.map((value) => ({ value, label: ITEM_LABELS[value] }));
const usesWeather = barUses("weather");
const STATUSBAR_SETTINGS: ModuleSetting[] = [
  viewSetting(StatusBar.meta, { group: "Layout" }),
  enumSetting("left", "Left", "logo", BAR_ITEMS, { multiple: true, group: "Slots", hint: "Items show in the order picked; one with no data is left out" }),
  enumSetting("center", "Centre", "date,time", BAR_ITEMS, { multiple: true, group: "Slots" }),
  enumSetting("right", "Right", "weather,network,volume,battery", BAR_ITEMS, { multiple: true, group: "Slots" }),
  enumSetting("display", "Show", "both", [{ value: "both", label: "Icon and value" }, { value: "value", label: "Value" }, { value: "icon", label: "Icon" }], { group: "Display", perWidget: true, hint: "Network, volume and battery show their icon only, unless set to Value" }),
  boolSetting("separators", "Dividers", true, { group: "Display", perWidget: true }),
  enumSetting("spacing", "Spacing", "normal", [{ value: "compact", label: "Compact" }, { value: "normal", label: "Normal" }, { value: "roomy", label: "Roomy" }], { group: "Display", perWidget: true }),
  { key: "logoIcon", label: "Logo icon", type: "icon", default: "monitor", group: "Logo", visibleIf: barUses("logo") },
  { key: "logoImage", label: "Logo image", type: "image", default: "", group: "Logo", perWidget: true, hint: "Replaces the icon", visibleIf: barUses("logo") },
  textSetting("text", "Text", "", { group: "Text", hint: "Empty = the item is left out", visibleIf: barUses("text") }),
  boolSetting("seconds", "Show seconds", false, { group: "Time", visibleIf: barUses("time", "datetime") }),
  { key: "iconSet", label: "Weather icon set", type: "select", default: "app", options: [{ value: "app", label: "App icons" }, { value: "meteocons", label: "Meteocons" }], group: "Icons", perWidget: true, visibleIf: usesWeather },
  { key: "iconStyle", label: "Icon style", type: "select", default: "line", options: [{ value: "fill", label: "Fill" }, { value: "flat", label: "Flat" }, { value: "line", label: "Line" }, { value: "monochrome", label: "Monochrome" }], group: "Icons", perWidget: true, visibleIf: (v) => usesWeather(v) && v.iconSet === "meteocons" },
  { key: "iconAnimated", label: "Animated icons", type: "boolean", default: false, group: "Icons", perWidget: true, hint: "Animated icons use more CPU and memory on the kiosk, and run outside the Max FPS cap.", visibleIf: (v) => usesWeather(v) && v.iconSet === "meteocons" },
  enumSetting("islandGap", "Gap for the island", "auto", [{ value: "auto", label: "Auto" }, { value: "off", label: "Off" }, { value: "custom", label: "Custom" }], { group: "Island", perWidget: true, hint: "Auto leaves room for the Dynamic Island at the page centre while it is on; the centre items split around it" }),
  numberSetting("islandGapPx", "Gap width (px)", 160, { min: 80, max: 400, step: 10, group: "Island", perWidget: true, visibleIf: (v) => v.islandGap === "custom" }),
  formatSetting("clock"),
  formatSetting("tempUnit"),
  rateUnitSetting(),
];

/** The Coding Agents settings that only apply to the Full view. */
const full = viewOnly(CodingAgents.meta, "full");

export const GROUP_B: DashboardModule[] = [
  templateModule({
    meta: DriveSpace.meta,
    Component: DriveSpace.default,
    settings: DRIVE_SETTINGS,
    toProps: (s): Partial<DriveSpace.DriveSpaceProps> => ({ view: oneOf(s.view, ["list", "segments", "bars"]), drive: deviceOf(s, "drive"), sort: oneOf(s.sort, ["usage", "name"]), ...thresholdsOf(s, "full", ["warn", "crit"]), neutral: boolOf(s.neutral) }),
    island: driveSpaceIsland,
  }),
  // any vendor's drive: the keys are read, not owned (the fallback grid keeps the rest of `libre.`)
  templateModule({ meta: StorageHealth.meta, Component: StorageHealth.default, prefixes: ["libre."], settings: [deviceSetting("Disk", "disk", { group: "Disk" })], toProps: (s): Partial<StorageHealth.StorageHealthProps> => ({ disk: deviceOf(s, "disk") }) }),
  templateModule({
    meta: DiskIO.meta,
    Component: DiskIO.default,
    settings: [
      boolSetting("showHistory", "Combined history", true, { group: "Chart" }),
      // Read and write follow the theme's Series 1 and 2 ("" = the widget's own colours).
      colorSetting("readColor", "Read", { role: "s1", more: false }),
      colorSetting("writeColor", "Write", { role: "s2", more: false }),
      deviceSetting("Disk", "disk", { group: "Disk", hint: "Auto = every detected drive" }),
    ],
    toProps: (s): Partial<DiskIO.DiskIOProps> => ({ ...pass<Partial<DiskIO.DiskIOProps>>("readColor", "writeColor")(s), disk: deviceOf(s, "disk"), showHistory: boolOf(s.showHistory) }),
  }),
  templateModule({
    meta: NetworkThroughput.meta,
    Component: NetworkThroughput.default,
    settings: [
      ...NETWORK_SETTINGS,
      deviceSetting("Adapter", "adapter", { group: "Adapter" }),
      enumSetting("chart", "Chart", "overlay", [{ value: "overlay", label: "Overlay" }, { value: "mirrored", label: "Mirrored" }], { group: "Traffic", visibleIf: (v) => Boolean(v.sparkline) }),
    ],
    toProps: (s) => ({
      ...pass<Partial<NetworkThroughput.NetworkThroughputProps>>("chart", "showTotals", "sparkline", "downloadColor", "uploadColor")(s),
      adapter: deviceOf(s, "adapter"),
      rateUnit: rateUnitOf(s.rateUnit),
    }),
    island: networkThroughputIsland,
  }),
  templateModule({
    meta: NetworkAdapters.meta,
    Component: NetworkAdapters.default,
    settings: [
      boolSetting("showDown", "Show adapters that are down", false, { group: "Adapters" }),
      enumSetting("showIpv6", "IPv6 count", "auto", [{ value: "auto", label: "Large zones" }, { value: "show", label: "Show" }, { value: "hide", label: "Hide" }], { group: "Addresses" }),
      boolSetting("hideIp", "Blur addresses", false, { group: "Addresses", hint: "Privacy: addresses stay blurred" }),
    ],
    toProps: (s): Partial<NetworkAdapters.NetworkAdaptersProps> => ({ ...pass<Partial<NetworkAdapters.NetworkAdaptersProps>>("showDown", "hideIp")(s), showIpv6: s.showIpv6 === "show" ? true : s.showIpv6 === "hide" ? false : undefined }),
    island: networkAdaptersIsland,
  }),
  templateModule({
    meta: Clock.meta,
    Component: Clock.default,
    settings: [
      enumSetting("face", "Face", "digital", [{ value: "digital", label: "Digital" }, { value: "analog", label: "Analog" }], { group: "Face" }),
      boolSetting("showSeconds", "Seconds", true, { group: "Time & date" }),
      boolSetting("showDate", "Date", true, { group: "Time & date" }),
      // Themed (config v7 moved the Clock's `format` here); 24 h stays this widget's own default.
      formatSetting("clock", { default: "24" }),
    ],
    toProps: (s): Partial<Clock.ClockProps> => {
      const clock = clockOf(s);
      return { ...pass<Partial<Clock.ClockProps>>("showSeconds", "showDate", "face")(s), format: clock === "12" ? "12h" : clock === "24" ? "24h" : "auto" };
    },
  }),
  templateModule({
    meta: Timer.meta,
    Component: Timer.default,
    settings: [
      textSetting("presets", "Presets (minutes)", "5, 15, 25", { group: "Presets", hint: "The buttons, comma separated" }),
      boolSetting("pomodoro", "Pomodoro button", false, { group: "Pomodoro", hint: "Focus and break rounds until stopped" }),
      numberSetting("focusMin", "Focus (min)", 25, { min: 5, max: 90, step: 5, group: "Pomodoro", visibleIf: (v) => v.pomodoro === true }),
      numberSetting("breakMin", "Break (min)", 5, { min: 1, max: 30, step: 1, group: "Pomodoro", visibleIf: (v) => v.pomodoro === true }),
    ],
    toProps: (s): Partial<Timer.TimerProps> => ({
      presets: presetsOf(s.presets),
      pomodoro: boolOf(s.pomodoro),
      focusMin: numberOf(s.focusMin),
      breakMin: numberOf(s.breakMin),
    }),
    island: timerIsland,
  }),
  templateModule({
    meta: Countdown.meta,
    Component: Countdown.default,
    settings: [
      viewSetting(Countdown.meta, { group: "Event" }),
      textSetting("eventName", "Event name", "", { group: "Event", hint: "Empty = no title line" }),
      dateSetting("date", "Date", "", { group: "Event", tab: "data" }),
      timeSetting("time", "Time of day", "", { group: "Event", tab: "data", hint: "Empty = an all-day event" }),
      enumSetting("count", "Count", "auto", [{ value: "auto", label: "Auto" }, { value: "until", label: "Until" }, { value: "since", label: "Since" }], { group: "Counting", tab: "data", hint: "Auto counts up an hour after the start (the rest of the day when all-day)" }),
      enumSetting("breakdown", "Breakdown", "auto", [{ value: "auto", label: "Auto" }, { value: "days", label: "Days" }, { value: "years", label: "Years" }, { value: "live", label: "Live" }], { group: "Counting", tab: "data", hint: "Live adds seconds" }),
      boolSetting("showDate", "Show the date", true, { group: "Event" }),
      formatSetting("clock"),
    ],
    // A malformed date or time reads as unset.
    toProps: (s): Partial<Countdown.CountdownProps> => ({
      view: oneOf(s.view, ["inline", "tiles", "big"]),
      eventName: stringOf(s.eventName),
      date: isDate(s.date) ? s.date : undefined,
      time: isTime(s.time) ? s.time : undefined,
      count: oneOf(s.count, ["auto", "until", "since"]),
      breakdown: oneOf(s.breakdown, ["auto", "days", "years", "live"]),
      showDate: boolOf(s.showDate),
      clock: clockOf(s),
    }),
    island: countdownIsland,
  }),
  templateModule({
    meta: StatusBar.meta,
    Component: StatusBar.default,
    settings: STATUSBAR_SETTINGS,
    toProps: (s): Partial<StatusBar.StatusBarProps> => ({
      view: oneOf(s.view, ["edge", "pill", "islands"]),
      left: slotOf(s.left),
      center: slotOf(s.center),
      right: slotOf(s.right),
      display: oneOf(s.display, ["both", "value", "icon"]),
      separators: boolOf(s.separators),
      spacing: oneOf(s.spacing, ["compact", "normal", "roomy"]),
      logoIcon: stringOf(s.logoIcon),
      logoImage: stringOf(s.logoImage),
      text: stringOf(s.text),
      seconds: boolOf(s.seconds),
      clock: clockOf(s),
      tempUnit: tempUnitOf(s),
      rateUnit: rateUnitOf(s.rateUnit),
      ...iconsOf(s),
      islandGap: oneOf(s.islandGap, ["auto", "off", "custom"]),
      islandGapPx: numberOf(s.islandGapPx),
    }),
  }),
  templateModule({
    meta: CodingAgents.meta,
    Component: CodingAgents.default,
    settings: [
      viewSetting(CodingAgents.meta, { group: "Agents" }),
      enumSetting(
        "agents",
        "Agents",
        "both",
        [
          { value: "both", label: "Claude and Codex" },
          { value: "claude", label: "Claude Code" },
          { value: "codex", label: "Codex" },
        ],
        { group: "Agents" }
      ),
      full(boolSetting("showPlan", "Plan use", true, { group: "Plan limits", hint: "The 5-hour and weekly windows, from the statusline (Claude) and the session files (Codex)" })),
      full(boolSetting("showSessions", "Sessions", true, { group: "Sessions", hint: "Each session: working with its tool, waiting for you, done" })),
      full(boolSetting("showUsage", "Tokens per day", true, { group: "Tokens", hint: "Today's tokens and the last five weeks, read from the transcripts" })),
      full(boolSetting("showBreakdown", "Breakdown", true, { group: "Tokens", hint: "This week's tokens by model and project, and today's by type, read from the transcripts" })),
      full(
        enumSetting("limitStyle", "Limit style", "bars", [{ value: "bars", label: "Bars" }, { value: "rings", label: "Rings" }], {
          group: "Plan limits",
          hint: "Rings fall back to bars when the cell is too small for them",
          visibleIf: (v) => v.showPlan !== false,
        })
      ),
      enumSetting("percent", "Show limits as", "used", [{ value: "used", label: "Used" }, { value: "left", label: "Left" }], { group: "Plan limits", visibleIf: (v) => v.showPlan !== false }),
      full(
        enumSetting("history", "History", "bars", [{ value: "bars", label: "Daily bars" }, { value: "heatmap", label: "Heatmap" }], {
          group: "Tokens",
          hint: "The heatmap moves beside the rest in a wide cell, and falls back to bars when it does not fit",
          visibleIf: (v) => v.showUsage !== false,
        })
      ),
    ],
    toProps: (s): Partial<CodingAgents.CodingAgentsProps> => ({
      view: oneOf(s.view, ["full", "summary", "limits"] as const),
      agents: oneOf(String(s.agents), ["both", "claude", "codex"] as const),
      showPlan: boolOf(s.showPlan),
      showSessions: boolOf(s.showSessions),
      showUsage: boolOf(s.showUsage),
      showBreakdown: boolOf(s.showBreakdown),
      limitStyle: oneOf(s.limitStyle, ["bars", "rings"] as const),
      percent: oneOf(s.percent, ["used", "left"] as const),
      history: oneOf(s.history, ["bars", "heatmap"] as const),
    }),
  }),
  templateModule({
    meta: Calendar.meta,
    Component: Calendar.default,
    // the date comes from the clock plugin, owned by Clock
    prefixes: ["plugins.clock-plugin."],
    settings: [enumSetting("weekStart", "Week starts on", "1", [{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }], { group: "Week" })],
    toProps: (s): Partial<Calendar.CalendarProps> => ({ weekStart: numberOf(oneOf(String(s.weekStart), ["0", "1"])) }),
  }),
  templateModule({
    meta: Weather.meta,
    Component: Weather.default,
    settings: [
      ...WEATHER_SETTINGS,
      notForecast(enumSetting("provider", "Provider", "auto", [{ value: "auto", label: "Auto" }, { value: "yr", label: "Yr" }, { value: "owm", label: "OpenWeatherMap" }], { group: "Source", tab: "data" })),
      // The Forecast view reads Yr whatever the provider.
      { ...yrLocation("Source"), visibleIf: (v) => v.view === "forecast" || v.provider !== "owm" },
      formatSetting("tempUnit"),
    ],
    toProps: (s) => ({ ...pass<Partial<Weather.WeatherProps>>("location")(s), units: unitsOf(s), provider: oneOf(s.provider, ["yr", "owm"]), ...weatherToProps(s) }),
    island: weatherIsland,
  }),
  templateModule({
    meta: Forecast.meta,
    Component: Forecast.default,
    settings: [numberSetting("days", "Days", 0, { min: 0, max: 7, step: 1, group: "Days", hint: "0 = as many as fit" }), yrLocation("Location"), formatSetting("tempUnit")],
    toProps: (s): Partial<Forecast.ForecastProps> => ({ ...pass<Partial<Forecast.ForecastProps>>("location")(s), units: unitsOf(s), days: numberOf(s.days) || undefined }),
  }),
  templateModule({
    meta: SensorValue.meta,
    Component: SensorValue.default,
    settings: SENSOR_VALUE_SETTINGS,
    toProps: (s): Partial<SensorValue.SensorValueProps> => {
      const decimals = decimalsOf(s);
      return {
        ...pass<Partial<SensorValue.SensorValueProps>>("sensor", "label", "display", "unit")(s),
        ...numbersOf(s, ["min"]),
        ...(decimals !== undefined ? { decimals } : {}),
        ...thresholdsOf(s, "value", ["warn", "crit"]),
        max: positiveOf(s.max),
      };
    },
  }),
  templateModule({
    meta: SensorGroup.meta,
    Component: SensorGroup.default,
    settings: SENSOR_GROUP_SETTINGS,
    toProps: (s): Partial<SensorGroup.SensorGroupProps> => ({
      ...pass<Partial<SensorGroup.SensorGroupProps>>("bars", "maxRows", "tempColor", "fanColor", "powerColor")(s),
      auto: discovered(s),
      layout: oneOf(s.groupLayout, ["auto", "rows", "grid"]),
      sensors: sensorItems(s),
      tempUnit: tempUnitOf(s),
    }),
  }),
  templateModule({
    meta: CustomGauge.meta,
    Component: CustomGauge.default,
    settings: [
      // The standard `label` is the title, as for Sensor.
      sensorSetting("sensor", "Sensor", { group: "Sensor" }),
      // The spec is edited in Gauges: the raw JSON never shows as a field.
      textSetting("gauge", "Gauge", JSON.stringify(CustomGauge.DEFAULT_GAUGE_SPEC), { hidden: true }),
      // Frames a library gauge arrived with (JSON): kept for an export, never shown or drawn.
      textSetting("frames", "Frames", "", { hidden: true }),
    ],
    toProps: (s): Partial<CustomGauge.CustomGaugeProps> => ({ ...pass<Partial<CustomGauge.CustomGaugeProps>>("sensor")(s), gauge: CustomGauge.parseGaugeSetting(s.gauge) }),
  }),
];
