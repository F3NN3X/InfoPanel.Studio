import type { ModuleSettings } from "@/modules/types";

/**
 * Settings a widget needs before it draws anything but its empty state, for the fixture data: the Stream Deck picks the
 * demo deck (`demo-streams.ts`), the countdown a date six weeks out, the sensor value a sensor and the web page a small
 * same-origin page (`src/dev/qa/webpage.html`, served in dev and the fixtures and stats builds only), Ping a host and Hourly
 * Weather a place (the `ping.*` and `weather.place.*` fixtures in `__fixtures__/extra.json`). Merged under the page's own settings, so the toolbar and
 * `settings=` still win; `data=live` leaves them out.
 */
export function demoSettings(now = new Date()): Readonly<Record<string, ModuleSettings>> {
  const date = new Date(now.getTime() + 42 * 86_400_000).toISOString().slice(0, 10);
  return {
    StreamDeck: { device: "demo" },
    Countdown: { date },
    SensorValue: { sensor: "libre.amd_ryzen_9_9950x3d_cpu_total" },
    WebPage: { url: "/assets/qa/webpage.html" },
    Ping: { host: "example.net" },
    HourlyWeather: { places: JSON.stringify([{ name: "Oslo", lat: 59.91, lon: 10.75 }]) },
  };
}

const DEMO = demoSettings();

/** A placement's settings on the page: the module's demo settings under `base` (fixtures only). */
export const withDemo = (module: string, base: ModuleSettings, live: boolean): ModuleSettings => (live ? base : { ...DEMO[module], ...base });
