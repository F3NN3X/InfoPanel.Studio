// Hourly Weather's catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

/** The dashboard server's weather by place (`ips-server weather.rs`): `weather.place.<id>.<field>`. */
export const P = "weather.place.";

export const meta: WidgetMeta = {
  id: "HourlyWeather",
  name: "Hourly Weather",
  category: "Info",
  icon: "schedule",
  prefixes: [P],
  defaultSize: [4, 1],
  minSize: [1, 1],
  blurb: "The next hours: temperature and rain chance",
  tags: "weather forecast hours hourly rain temperature next today open-meteo",
  description: "The next hours of weather for one place you search for: the condition, temperature and chance of rain each hour, from Open-Meteo (CC BY 4.0). The place goes to that provider only, through the server.",
};
