// Template widgets that join the calendar, weather, OBS and the clock: Day Planner, Radial Clock Stack, On-Air Beacon.
// Each module's options are exported for the schema tests.
import { clockOf } from "@/modules/setting-readers";
import type { DashboardModule, ModuleSetting } from "@/modules/types";
import { templateModule, type TemplateOptions } from "../module";
import { boolOf, boolSetting, colorSetting, enumSetting, formatSetting, numberOf, numberSetting, oneOf, sensorSetting, stringOf, textSetting } from "./settings-kit";
import DayPlanner, { meta as dayPlannerMeta, type DayPlannerProps } from "../DayPlanner";
import OnAirBeacon, { meta as onAirMeta, type OnAirBeaconProps } from "../OnAirBeacon";
import RadialClockStack, { meta as radialMeta, type RadialClockStackProps } from "../RadialClockStack";

export const DAYPLANNER_SETTINGS: ModuleSetting[] = [
  enumSetting(
    "hours",
    "Look ahead",
    "12",
    [{ value: "6", label: "6 hours" }, { value: "12", label: "12 hours" }, { value: "24", label: "24 hours" }, { value: "36", label: "36 hours" }],
    { group: "Rail", hint: "24 and 36 hours reach into tomorrow" }
  ),
  enumSetting("orientation", "Direction", "auto", [{ value: "auto", label: "Auto" }, { value: "vertical", label: "Vertical" }, { value: "horizontal", label: "Horizontal" }], { group: "Rail" }),
  boolSetting("showWeather", "Weather band", true, { group: "Weather", hint: "Temperature and rain behind the events, from the Yr weather plugin" }),
  textSetting("location", "Weather location", "", { group: "Weather", tab: "data", hint: "Empty = the first Yr location" }),
  enumSetting("units", "Temperature unit", "C", [{ value: "C", label: "°C" }, { value: "F", label: "°F" }], { group: "Weather", tab: "data" }),
  formatSetting("clock"),
];

export const dayPlannerOptions: TemplateOptions<Pick<DayPlannerProps, "hours" | "orientation" | "showWeather" | "location" | "units" | "clock">> = {
  meta: dayPlannerMeta,
  Component: DayPlanner,
  settings: DAYPLANNER_SETTINGS,
  toProps: (s) => ({
    hours: numberOf(s.hours),
    orientation: oneOf(s.orientation, ["auto", "vertical", "horizontal"]),
    showWeather: boolOf(s.showWeather),
    location: stringOf(s.location),
    units: oneOf(s.units, ["C", "F"]),
    clock: clockOf(s),
  }),
};

export const RADIAL_SETTINGS: ModuleSetting[] = [
  enumSetting("span", "Second ring", "year", [{ value: "year", label: "Year" }, { value: "week", label: "Week" }], { group: "Rings" }),
  enumSetting("weekStart", "Week starts", "1", [{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }], { group: "Rings", visibleIf: (v) => v.span === "week" }),
  sensorSetting("sensor", "Sensor ring", { group: "Rings", tab: "data", hint: "Empty = no sensor ring" }),
  numberSetting("sensorMin", "Sensor empty at", 0, { group: "Rings", tab: "data", visibleIf: (v) => !!v.sensor }),
  numberSetting("sensorMax", "Sensor full at", 100, { group: "Rings", tab: "data", visibleIf: (v) => !!v.sensor }),
  boolSetting("showEvent", "Next event ring", true, { group: "Rings", hint: "Fills as the next calendar event gets close; needs a calendar under Island › Calendar" }),
  numberSetting("horizon", "Event run-up (minutes)", 120, { min: 5, max: 1440, step: 5, group: "Rings", tab: "data", visibleIf: (v) => v.showEvent !== false }),
  boolSetting("showSeconds", "Seconds ring", false, { group: "Rings", hint: "Ticks every second instead of every minute" }),
  formatSetting("clock"),
];

export const radialOptions: TemplateOptions<Pick<RadialClockStackProps, "span" | "weekStart" | "sensor" | "sensorMin" | "sensorMax" | "showEvent" | "horizon" | "showSeconds" | "clock">> = {
  meta: radialMeta,
  Component: RadialClockStack,
  settings: RADIAL_SETTINGS,
  toProps: (s) => ({
    span: oneOf(s.span, ["year", "week"]),
    weekStart: numberOf(s.weekStart),
    sensor: stringOf(s.sensor),
    sensorMin: numberOf(s.sensorMin),
    sensorMax: numberOf(s.sensorMax),
    showEvent: boolOf(s.showEvent),
    horizon: numberOf(s.horizon),
    showSeconds: boolOf(s.showSeconds),
    clock: clockOf(s),
  }),
};

export const ONAIR_SETTINGS: ModuleSetting[] = [
  boolSetting("showElapsed", "Elapsed time", true, { group: "Display", hint: "Counted from when the dashboard first sees the state; OBS does not report how long it has run" }),
  boolSetting("seconds", "Count seconds", false, { group: "Display", hint: "Ticks every second while on air; off counts minutes", visibleIf: (v) => v.showElapsed !== false }),
  colorSetting("liveColor", "Live", { role: "crit", more: false }),
  colorSetting("recColor", "Recording", { role: "warn", more: false }),
];

export const onAirOptions: TemplateOptions<Pick<OnAirBeaconProps, "showElapsed" | "seconds" | "liveColor" | "recColor">> = {
  meta: onAirMeta,
  Component: OnAirBeacon,
  settings: ONAIR_SETTINGS,
  toProps: (s) => ({ showElapsed: boolOf(s.showElapsed), seconds: boolOf(s.seconds), liveColor: stringOf(s.liveColor), recColor: stringOf(s.recColor) }),
};

export const TIME_WIDGETS: DashboardModule[] = [templateModule(dayPlannerOptions), templateModule(radialOptions), templateModule(onAirOptions)];
