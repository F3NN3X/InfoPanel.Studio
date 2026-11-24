// Weather's catalog entry: pure data, so the registry and the generator read it without the component.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Weather",
  name: "Weather",
  category: "Info",
  icon: "partly_cloudy_day",
  prefixes: ["plugins.yr-weather-plugin.", "plugins.weather-plugin."],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Current conditions and 7-day forecast",
  tags: "temperature rain wind",
  description: "Current conditions, feels-like, wind, humidity, pressure, rain/snow and 7-day forecast (MET/Yr or OpenWeatherMap).",
  // Each view sets the three toggles in place; changed afterwards, the row reads Custom. Full = their defaults.
  views: [
    { id: "full", name: "Full", applies: { showForecast: true, showStats: true, showFeels: true } },
    { id: "now", name: "Now", blurb: "Current conditions with wind and humidity", tags: "current today", applies: { showForecast: false, showStats: true, showFeels: true } },
    // The Forecast widget until config v19: added at its size (4x1) and found by its words. With Empty card on (what a migrated
    // Forecast zone stores) it gates on any key as that widget did; off, on the weather plugins as the rest of Weather.
    { id: "forecast", name: "Forecast", blurb: "Conditions now and the days ahead", tags: "week days outlook multi-day highs lows", defaultSize: [4, 1], applies: { showForecast: true, showStats: false, showFeels: false }, prefixes: [], prefixesWhen: "emptyCard" },
    { id: "minimal", name: "Minimal", blurb: "Temperature and conditions only", tags: "simple small", applies: { showForecast: false, showStats: false, showFeels: false } },
    { id: "glance", name: "Glance", blurb: "Big icon, temperature and place", tags: "icon big", defaultSize: [3, 2], applies: { showForecast: false, showStats: false, showFeels: false } },
    { id: "week", name: "Week", blurb: "Today and the next days", tags: "days outlook forecast", defaultSize: [5, 2], applies: { showForecast: true, showStats: false, showFeels: false } },
  ],
  layouts: [
    { id: "standard", name: "Standard" },
    { id: "quote", name: "Quote slab" },
  ],
};
