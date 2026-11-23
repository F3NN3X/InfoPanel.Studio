// Hourly Weather: the next hours for one place. What the registry needs; the component is its own chunk.
// It reads the dashboard server's weather by place (`weather.place.<id>.`), which fetches the place a saved Hourly Weather
// widget names (ips-server weather.rs `referenced_places`); the page never calls the provider.
import { tempUnitOf } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { CARD, defineWidget } from "../define";
import { boolOf, boolSetting, formatSetting, numberOf, numberSetting } from "../shared/settings-kit";
import type { HourlyWeatherProps } from "./HourlyWeather";
import { firstPlace } from "./place";
import { meta } from "./meta";

/** Hours the widget can show, and its default (the server holds 24). */
const HOURS_MAX = 24;
const HOURS_DEFAULT = 12;

export default defineWidget({
  meta,
  // A summary card; the dense view falls back to it; the temperature unit.
  inspector: { header: "yes", compact: CARD, fmt: ["tempUnit"] },
  settings: [
    // The place list is one place long here: the server fetches the first. Edited as places, with place search.
    { key: "places", label: "Place", type: "text", default: "[]", places: true, group: "Place", tab: "data", hint: "Search for a place; its name and position go to Open-Meteo through this server only" },
    numberSetting("hours", "Hours", HOURS_DEFAULT, { group: "Display", min: 2, max: HOURS_MAX, step: 1, hint: "As many as fit are drawn" }),
    boolSetting("showRain", "Chance of rain", true, { group: "Display" }),
    formatSetting("tempUnit"),
  ],
  render: {
    load: () => import("./HourlyWeather"),
    toProps: (s: ModuleSettings): Partial<HourlyWeatherProps> => ({
      place: firstPlace(s.places),
      hours: Math.min(HOURS_MAX, Math.max(2, Math.round(numberOf(s.hours) ?? HOURS_DEFAULT))),
      showRain: boolOf(s.showRain),
      units: tempUnitOf(s) === "f" ? "F" : "C",
    }),
  },
  // Migrations and sample stay central (the default): the sample is src/widgets/__fixtures__/extra.json (`weather.place.*`) and
  // the widget-qa demo settings name its place. It draws without sensor keys too (module.tsx SENSORLESS): with no place it says so.
});
