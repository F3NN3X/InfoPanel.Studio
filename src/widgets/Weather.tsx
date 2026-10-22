import type { ModuleSettings } from "@/modules/types";
import Forecast from "./Forecast";
import { Widget, shell, get, num, fmt, has, rows, Icon, Stat, Num, weatherIcon, type ShellProps, type WidgetMeta } from "./kit";

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
    { id: "forecast", name: "Forecast", blurb: "Conditions now and the days ahead", tags: "week days outlook", applies: { showForecast: true, showStats: false, showFeels: false } },
    { id: "minimal", name: "Minimal", blurb: "Temperature and conditions only", tags: "simple small", applies: { showForecast: false, showStats: false, showFeels: false } },
  ],
};

const compass = (deg: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((deg % 360) / 45) % 8];

/** The condition's accent (sun amber, rain blue, snow icy, ...), or undefined for an unknown one. */
const conditionTint = (desc: string): string | undefined => {
  const d = desc.toLowerCase();
  if (/thunder|storm/.test(d)) return "rgb(138, 96, 194)";
  if (/snow/.test(d)) return "rgb(148, 196, 236)";
  if (/drizzle/.test(d)) return "rgb(96, 148, 216)";
  if (/rain|shower|shauer|regn/.test(d)) return "rgb(72, 128, 208)";
  if (/fog|mist|haze/.test(d)) return "rgb(150, 152, 164)";
  if (/clear|sunny|sol|sun/.test(d)) return "rgb(248, 176, 58)";
  if (/cloud/.test(d)) return "rgb(128, 148, 180)";
  return undefined;
};

export interface WeatherProps extends ShellProps {
  look?: ModuleSettings;
  /** Default: yr when available. */
  provider?: "yr" | "owm";
  /** Yr container slug. */
  location?: string;
  units?: "C" | "F";
  /** What shows: `full` everything, `now` no forecast, `minimal` temperature + condition only (each flag below overrides it), `forecast` the Forecast widget. */
  view?: "full" | "now" | "forecast" | "minimal";
  /** Take the accent from the current condition (an explicit accent still wins). */
  tint?: boolean;
  /** The wind / humidity / pressure / precipitation stats (default on). */
  showStats?: boolean;
  /** The "feels" part of the condition line (default on). */
  showFeels?: boolean;
  /** The day-forecast strip (default on). */
  showForecast?: boolean;
  /** Forecast days shown, 1-7 (default: 5, or 7 in a large zone). */
  days?: number;
}

export default function Weather(p: WeatherProps) {
  if (p.view === "forecast") return <Forecast {...p} />;
  return <Current {...p} />;
}

function Current(p: WeatherProps) {
  const d = p.data;
  const yr = [...new Set(Object.keys(d || {}).map((k) => k.match(/^plugins\.yr-weather-plugin\.([^.]+)\.temp$/)?.[1]).filter((x): x is string => !!x))];
  const prov = p.provider ?? (yr.length ? "yr" : "owm");
  const base = prov === "yr" ? `plugins.yr-weather-plugin.${p.location ?? yr[0]}` : "plugins.weather-plugin.weather";
  const k = (s: string) => get(d, `${base}.${s}`);
  const F = p.units === "F";
  const T = (c: number) => (F ? (c * 9) / 5 + 32 : c);
  const temp = num(k("temp")),
    feels = num(k("feels_like"));
  const fc = rows(k("forecast")).map(([date, cond, range, rain, wind]) => {
    const [hi, lo] = String(range).split("/").map(num);
    // "Tue 13 Oct" -> "Tue 13", as the legacy forecast cells read
    return { date: String(date).match(/^\w{3}\s+\d{1,2}/)?.[0] ?? date?.split(" ")[0], cond, hi, lo, rain: num(rain), wind };
  });
  const lo = Math.min(...fc.map((f) => f.lo)),
    hi = Math.max(...fc.map((f) => f.hi));
  const icon = weatherIcon(`${k("weather_icon")} ${k("weather_desc")}`);
  const minimal = p.view === "minimal";
  const showStats = p.showStats ?? !minimal;
  const showFeels = p.showFeels ?? !minimal;
  const showForecast = p.showForecast ?? (p.view === undefined || p.view === "full");
  const tint = p.tint ? conditionTint(k("weather_desc")) : undefined;
  const feelsText = showFeels ? ` · feels ${fmt(T(feels), 0)}°` : "";
  const feelsLine = showFeels ? `feels like ${fmt(T(feels), 0)}°` : "";
  return (
    <Widget
      {...shell(p)}
      accent={p.accent ?? tint}
      backdrop={tint && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${tint} 42%, transparent), color-mix(in srgb, ${tint} 12%, transparent))` }} />}
      title={p.title ?? (has(k("name")) ? k("name") : "Weather")}
      icon="location_on"
      compact={{ label: has(k("name")) ? k("name") : "Weather", value: `${fmt(T(temp), 0)}°`, sub: `${k("weather_desc")}${feelsText}`, icon, kind: "value" }}
      right={has(k("last_refreshed")) && <span className="font-mono text-[10px] text-[color:var(--w-faint)]">{String(k("last_refreshed")).slice(11)}</span>}
    >
      {({ size, h }) => {
        const now = (
          <div className="flex min-w-0 items-center gap-3">
            <Icon name={icon} fill className={`${{ xs: "text-3xl", sm: "text-5xl", md: "text-6xl", lg: "text-7xl" }[size]} text-[color:var(--accent)]`} />
            <div className="flex min-w-0 flex-col">
              <Num className={`${{ xs: "text-2xl", sm: "text-4xl", md: "text-5xl", lg: "text-6xl" }[size]} font-semibold leading-none tracking-tight`}>{fmt(T(temp), 0)}°</Num>
              {size !== "xs" && (
                <>
                  <span className="mt-1 truncate text-xs text-[color:var(--w-muted)]">{k("weather_desc")}</span>
                  {feelsLine && <span className="truncate text-xs text-[color:var(--w-muted)] first-letter:uppercase">{feelsLine}</span>}
                </>
              )}
            </div>
          </div>
        );
        if (size === "xs" || size === "sm" || (!showStats && !showForecast)) return <div className="flex h-full items-center">{now}</div>;
        const snow = num(k("snow")) > 0;
        const shown = Math.max(1, Math.min(7, Math.round(p.days ?? (size === "lg" ? 7 : 5))));
        // the forecast cells shed their rows (rain, bar, low) to the height left under the current block and the stats:
        // the temperature (48 / 60px) + description (20) + feels line (16), or the stats grid (one row 38, three rows 128)
        const topH = Math.max(size === "lg" ? 72 : 60, (size === "lg" ? 60 : 48) + 20 + (feelsLine ? 16 : 0), showStats ? (size === "lg" ? 128 : 38) : 0);
        const budget = h > 0 ? h - topH - 16 : Infinity;
        // a cell is 78px (rule + padding, day, icon, high); the low adds 22, the bar 46, the rain 21.
        // Just short of that, the gaps close up (16 -> 12 above, 6 -> 4 inside) to keep the forecast row.
        const tight = budget < 78 && budget + 8 >= 74;
        const bar = size === "lg" && budget >= 78 + 22 + 46,
          showLo = budget >= 78 + 22,
          showRain = budget >= 78 + 22 + 21 + (bar ? 46 : 0);
        return (
          <div className={`flex h-full flex-col ${tight ? "gap-3" : "gap-4"}`}>
            <div className="flex items-start justify-between gap-4">
              {now}
              {showStats && <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2">
                <Stat label="Wind" value={`${fmt(num(k("wind_speed")), 1)} m/s ${compass(num(k("wind_deg")))}`} />
                <Stat label="Humidity" value={`${fmt(num(k("humidity")))}%`} />
                {size === "lg" && (
                  <>
                    <Stat label="Gusts" value={`${fmt(num(k("wind_gust")), 1)} m/s`} />
                    <Stat label="Pressure" value={`${fmt(num(k("pressure")))} hPa`} />
                    <Stat label="Clouds" value={`${fmt(num(k("clouds")))}%`} />
                    <Stat label={snow ? "Snow" : "Rain"} value={`${fmt(num(k(snow ? "snow" : "rain")), 1)} mm/h`} />
                  </>
                )}
              </div>}
            </div>
            {showForecast && fc.length > 0 && (budget >= 78 || tight) && (
              <div className="mt-auto grid gap-1.5 border-t border-[color:var(--w-track)] pt-3" style={{ gridTemplateColumns: `repeat(${Math.min(fc.length, shown)}, minmax(0,1fr))` }}>
                {fc.slice(0, shown).map((f, i) => (
                  <div key={i} className={`flex flex-col items-center ${tight ? "gap-1" : "gap-1.5"}`} title={`${f.cond} · ${f.rain} mm · ${f.wind}`}>
                    <span className="whitespace-nowrap text-[11px] text-[color:var(--w-muted)]">{i === 0 ? `Tmrw ${f.date.split(" ")[1] ?? ""}` : f.date}</span>
                    <Icon name={weatherIcon(f.cond)} className="text-xl text-[color:var(--w-fg)]" />
                    <span className="text-xs font-semibold tabular-nums">{fmt(T(f.hi), 0)}°</span>
                    {bar && (
                      <div className="relative h-10 w-1 rounded-full bg-[color:var(--w-track)]">
                        <div className="absolute inset-x-0 rounded-full" style={{ background: "var(--accent)", bottom: `${((f.lo - lo) / (hi - lo || 1)) * 100}%`, top: `${100 - ((f.hi - lo) / (hi - lo || 1)) * 100}%` }} />
                      </div>
                    )}
                    {showLo && <span className="text-[11px] tabular-nums text-[color:var(--w-faint)]">{fmt(T(f.lo), 0)}°</span>}
                    {showRain && f.rain > 0 && <span className="whitespace-nowrap text-[10px] tabular-nums text-sky-300">{`${f.rain}mm`}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
